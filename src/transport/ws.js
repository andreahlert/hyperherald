// _hyperstream WebSocket transport — reconnect, backoff, cursor handshake
'use strict';

import { config } from '../core/config.js';
import { logger } from '../core/logger.js';

/**
 * Open a WebSocket connection. Each text frame is one envelope (HTML).
 * Reconnect with exponential backoff + jitter; on each (re)connect a
 * <hs-subscribe> envelope is sent including channels and cursors for replay.
 *
 * options:
 *   url        — ws:// or wss:// URL (required)
 *   channels   — initial channel subscription list
 *   cursors    — { channel: lastSeq } for replay on (re)connect
 *   protocols  — WebSocket subprotocols
 *   onMessage  — (envelopeText) => void   (raw text; caller parses)
 *   onOpen     — () => void
 *   onError    — (err) => void
 *   onClose    — (event) => void
 */
export function openWS(options) {
    const {
        url,
        channels = [],
        cursors = {},
        protocols,
        onMessage = () => {},
        onOpen = () => {},
        onError = () => {},
        onClose = () => {},
    } = options;

    let closed = false;
    let socket = null;
    let attempt = 0;
    let reconnectTimer = null;
    let visibilityHandler = null;
    let paused = false;

    function buildUrl() {
        const u = new URL(url, typeof window !== 'undefined' ? window.location.href : 'http://localhost');
        if (u.protocol === 'http:') u.protocol = 'ws:';
        else if (u.protocol === 'https:') u.protocol = 'wss:';
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

    function attrEscape(s) {
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    function sendSubscribe() {
        if (!socket || socket.readyState !== 1 /* OPEN */) return;
        const channelsAttr = channels.map(attrEscape).join(' ');
        const cursorsAttr = Object.entries(cursors)
            .map(([ch, seq]) => `${attrEscape(ch)}:${seq}`)
            .join(' ');
        const html =
            `<hs-subscribe v="${config.specVersion}"` +
            ` channels="${channelsAttr}"` +
            (cursorsAttr ? ` cursors="${cursorsAttr}"` : '') +
            ` ts="${Date.now()}"></hs-subscribe>`;
        try {
            socket.send(html);
        } catch (e) {
            logger.debug('WS subscribe send failed', e);
        }
    }

    function connect() {
        if (closed || paused) return;
        const target = buildUrl();
        let s;
        try {
            s = protocols ? new WebSocket(target, protocols) : new WebSocket(target);
        } catch (e) {
            logger.debug('WS construct failed', e);
            scheduleReconnect();
            return;
        }
        socket = s;

        s.addEventListener('open', () => {
            if (closed) { try { s.close(); } catch {} return; }
            attempt = 0;
            sendSubscribe();
            onOpen();
        });

        s.addEventListener('message', (ev) => {
            if (closed) return;
            // Spec is HTML text; binary frames ignored for v0.
            if (typeof ev.data === 'string') {
                onMessage(ev.data);
            }
        });

        s.addEventListener('error', (ev) => {
            if (closed) return;
            logger.debug('WS error', ev);
            onError(ev);
        });

        s.addEventListener('close', (ev) => {
            socket = null;
            if (closed) {
                onClose(ev);
                return;
            }
            // Server-initiated graceful close: do not reconnect.
            if (ev.code === 1000 && ev.reason === 'hs:close') {
                onClose(ev);
                closed = true;
                return;
            }
            scheduleReconnect();
        });
    }

    function scheduleReconnect() {
        if (closed || paused) return;
        attempt++;
        const delay = reconnectDelay();
        logger.debug(`WS reconnect attempt ${attempt} in ${Math.round(delay)}ms`);
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delay);
    }

    if (config.pauseOnBackground && typeof document !== 'undefined') {
        visibilityHandler = () => {
            if (document.hidden) {
                paused = true;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                if (socket) {
                    try { socket.close(1000, 'hs:pause'); } catch {}
                    socket = null;
                }
            } else if (paused) {
                paused = false;
                attempt = 0;
                connect();
            }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
    }

    connect();

    return {
        get url() { return url; },
        get readyState() { return socket ? socket.readyState : 3 /* CLOSED */; },
        send(data) {
            if (!socket || socket.readyState !== 1) return false;
            if (typeof data !== 'string') return false;
            try {
                socket.send(data);
                return true;
            } catch (e) {
                logger.debug('WS send failed', e);
                return false;
            }
        },
        updateChannels(nextChannels, nextCursors) {
            channels.splice(0, channels.length, ...nextChannels);
            for (const k of Object.keys(cursors)) delete cursors[k];
            Object.assign(cursors, nextCursors || {});
            sendSubscribe();
        },
        close() {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (visibilityHandler && typeof document !== 'undefined') {
                document.removeEventListener('visibilitychange', visibilityHandler);
            }
            if (socket) {
                try { socket.close(1000, 'client closed'); } catch {}
                socket = null;
            }
        },
    };
}
