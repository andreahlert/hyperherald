// _hyperstream SSE transport — fetch + ReadableStream parser, Last-Event-ID replay
'use strict';

import { config } from '../core/config.js';
import { logger } from '../core/logger.js';

/** Async generator parsing an SSE byte stream into {data,event,id,retry} messages. */
async function* parseSSE(reader) {
    const decoder = new TextDecoder();
    let buffer = '';
    let hasData = false;
    let message = { data: '', event: '', id: '', retry: null };
    let firstChunk = true;

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            let chunk = decoder.decode(value, { stream: true });
            if (firstChunk) {
                if (chunk.charCodeAt(0) === 0xFEFF) chunk = chunk.slice(1);
                firstChunk = false;
            }
            buffer += chunk;

            const lines = buffer.split(/\r\n|\r|\n/);
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line) {
                    if (hasData) {
                        yield message;
                        hasData = false;
                        message = { data: '', event: '', id: '', retry: null };
                    }
                    continue;
                }

                const colonIndex = line.indexOf(':');
                if (colonIndex === 0) continue;

                let field, val;
                if (colonIndex < 0) {
                    field = line;
                    val = '';
                } else {
                    field = line.slice(0, colonIndex);
                    val = line.slice(colonIndex + 1);
                    if (val[0] === ' ') val = val.slice(1);
                }

                if (field === 'data') {
                    message.data += (hasData ? '\n' : '') + val;
                    hasData = true;
                } else if (field === 'event') {
                    message.event = val;
                } else if (field === 'id') {
                    if (!val.includes('\0')) message.id = val;
                } else if (field === 'retry') {
                    const retryValue = parseInt(val, 10);
                    if (!isNaN(retryValue)) message.retry = retryValue;
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Open a SSE connection and dispatch parsed messages to a handler.
 * Returns an SSETransport with .close() and .channels lifecycle hooks.
 *
 * options:
 *   url        — URL to fetch (required)
 *   channels   — initial channel subscription list (passed as ?channels=...)
 *   cursors    — { channel: lastSeq } for replay on (re)connect
 *   onMessage  — (msg) => void where msg = { data, event, id }
 *   onOpen     — () => void
 *   onError    — (err) => void
 *   onClose    — () => void
 */
export function openSSE(options) {
    const {
        url,
        channels = [],
        cursors = {},
        onMessage = () => {},
        onOpen = () => {},
        onError = () => {},
        onClose = () => {},
    } = options;

    let closed = false;
    let abortController = null;
    let lastEventId = null;
    let attempt = 0;
    let reconnectTimer = null;
    let visibilityHandler = null;
    let paused = false;
    let unpauseResolver = null;

    function buildUrl() {
        const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
        if (channels.length > 0) u.searchParams.set('channels', channels.join(','));
        for (const [ch, seq] of Object.entries(cursors)) {
            u.searchParams.append('cursor', `${ch}:${seq}`);
        }
        return u.toString();
    }

    function reconnectDelay() {
        const base = config.reconnectDelay;
        const max  = config.reconnectMaxDelay;
        const exp  = base * Math.pow(2, Math.min(attempt - 1, 7));
        const jit  = config.reconnectJitter;
        const range = exp * jit;
        return Math.min(max, Math.max(0, exp + (Math.random() * 2 - 1) * range));
    }

    if (config.pauseOnBackground && typeof document !== 'undefined') {
        visibilityHandler = () => {
            if (document.hidden) {
                paused = true;
                abortController?.abort();
            } else if (paused) {
                paused = false;
                if (unpauseResolver) {
                    unpauseResolver();
                    unpauseResolver = null;
                }
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
    }

    async function loop() {
        while (!closed) {
            if (paused) {
                await new Promise((r) => { unpauseResolver = r; });
                if (closed) break;
            }
            if (attempt > 0) {
                const delay = reconnectDelay();
                logger.debug(`SSE reconnect attempt ${attempt} in ${Math.round(delay)}ms`);
                await new Promise((r) => { reconnectTimer = setTimeout(r, delay); });
                if (closed) break;
            }

            const ac = new AbortController();
            abortController = ac;
            const headers = { 'Accept': 'text/event-stream' };
            if (lastEventId) headers['Last-Event-ID'] = lastEventId;

            try {
                const response = await fetch(buildUrl(), {
                    method: 'GET',
                    signal: ac.signal,
                    headers,
                });
                if (closed) break;
                if (!response.ok) {
                    throw new Error(`SSE HTTP ${response.status}`);
                }
                attempt = 0;
                onOpen();

                const reader = response.body.getReader();
                for await (const msg of parseSSE(reader)) {
                    if (closed) break;
                    if (msg.id) lastEventId = msg.id;
                    onMessage(msg);
                }
            } catch (err) {
                if (closed || ac.signal.aborted) {
                    if (paused) continue; // visibility-aborted; loop will await unpause
                    break;
                }
                logger.debug('SSE error', err);
                onError(err);
            }

            attempt++;
        }
        if (visibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', visibilityHandler);
        }
        onClose();
    }

    loop();

    return {
        close() {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (abortController) abortController.abort();
            if (unpauseResolver) {
                unpauseResolver();
                unpauseResolver = null;
            }
        },
        get url() { return url; },
    };
}
