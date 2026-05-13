// _hyperstream runtime — boots, scans DOM, manages connections per [_stream] element
'use strict';

import { readElementConfig, findStreamElements } from './attributes.js';
import { SubscriptionRegistry } from './subscriptions.js';
import { parseEnvelope, validateFragment, FRAME_TYPES } from './envelope.js';
import { resolveTarget } from './target.js';
import { applySwap, applyMulti, applyAtomic } from './swap.js';
import { cursor } from './cursor.js';
import { openSSE } from '../transport/sse.js';
import { openWS } from '../transport/ws.js';
import { pickTransport } from '../transport/pick.js';

export class Runtime {
    constructor({ config, logger }) {
        this.config = config;
        this.logger = logger;
        this.registry = new SubscriptionRegistry();
        this.observer = null;
        this.elementToConn = new WeakMap(); // element -> Connection
    }

    process(root) {
        if (!root) return;
        const elts = findStreamElements(root);
        for (const el of elts) this.attach(el);
        this.startObserver();
    }

    cleanup(root) {
        if (!root) return;
        const elts = findStreamElements(root);
        for (const el of elts) this.detach(el);
    }

    attach(el) {
        if (this.elementToConn.has(el)) return; // already attached
        const cfg = readElementConfig(el);
        if (!cfg) return;
        const conn = this.registry.register(cfg.url, el, cfg.subscribe);
        this.elementToConn.set(el, conn);

        if (!conn.transport) {
            this.openTransport(conn, cfg);
        } else {
            this.maybeUpdateChannels(conn);
        }
    }

    detach(el) {
        const conn = this.elementToConn.get(el);
        if (!conn) return;
        this.elementToConn.delete(el);
        this.registry.unregister(conn.url, el);
        // If conn still alive, sync subscriptions to remaining elements.
        if (this.registry.getConnection(conn.url)) {
            this.maybeUpdateChannels(conn);
        }
    }

    maybeUpdateChannels(conn) {
        if (conn.transport && typeof conn.transport.updateChannels === 'function') {
            const channels = conn.allChannels();
            const cursors = cursor.forUrl(conn.url);
            conn.transport.updateChannels(channels, cursors);
        }
    }

    openTransport(conn, cfg) {
        const kind = pickTransport(cfg.transport, cfg.url);
        const channels = conn.allChannels();
        const cursors = cursor.forUrl(conn.url);
        const handle = (text) => this.handleEnvelope(conn, text);

        let transport;
        if (kind === 'ws') {
            transport = openWS({
                url: cfg.url,
                channels,
                cursors,
                onMessage: handle,
                onOpen: () => this.logger.debug('WS open', cfg.url),
                onError: (e) => this.logger.debug('WS error', e),
                onClose: () => this.logger.debug('WS close', cfg.url),
            });
        } else {
            transport = openSSE({
                url: cfg.url,
                channels,
                cursors,
                onMessage: (msg) => handle(msg.data),
                onOpen: () => this.logger.debug('SSE open', cfg.url),
                onError: (e) => this.logger.debug('SSE error', e),
                onClose: () => this.logger.debug('SSE close', cfg.url),
            });
        }
        conn.setTransport(transport);
    }

    handleEnvelope(conn, text) {
        if (!text) return;
        const result = parseEnvelope(text);
        if (!result.ok) {
            this.logger.warn('envelope parse failed', result.error);
            return;
        }
        const frame = result.frame;
        if (typeof frame.seq === 'number') {
            conn.recordSeq(frame.channel, frame.seq);
            cursor.set(conn.url, frame.channel, frame.seq);
        }
        this.dispatch(conn, frame);
    }

    dispatch(conn, frame) {
        const elements = conn.elementsForChannel(frame.channel);
        const resolveFor = (sourceEl) => (sel) => resolveTarget(sel, sourceEl);

        switch (frame.type) {
            case FRAME_TYPES.FRAGMENT: {
                const err = validateFragment(frame);
                if (err) { this.logger.warn('invalid fragment', err); return; }
                if (elements.length === 0) {
                    const t = resolveTarget(frame.target, null);
                    applySwap(t, frame);
                } else {
                    for (const el of elements) {
                        const t = resolveTarget(frame.target, el);
                        applySwap(t, frame);
                    }
                }
                return;
            }
            case FRAME_TYPES.MULTI: {
                if (!Array.isArray(frame.fragments)) return;
                if (elements.length === 0) {
                    applyMulti(frame.fragments, resolveFor(null));
                } else {
                    for (const el of elements) applyMulti(frame.fragments, resolveFor(el));
                }
                return;
            }
            case FRAME_TYPES.ATOMIC: {
                if (!Array.isArray(frame.fragments)) return;
                if (elements.length === 0) {
                    applyAtomic(frame.fragments, resolveFor(null));
                } else {
                    for (const el of elements) applyAtomic(frame.fragments, resolveFor(el));
                }
                return;
            }
            case FRAME_TYPES.PARTIAL: {
                if (typeof frame.chunk !== 'string') return;
                const targets = elements.length === 0
                    ? [resolveTarget(frame.target, null)]
                    : elements.map((el) => resolveTarget(frame.target, el));
                for (const t of targets) {
                    if (!t) continue;
                    t.insertAdjacentHTML('beforeend', frame.chunk);
                }
                return;
            }
            case FRAME_TYPES.SUBSCRIBE_ACK: {
                this.logger.debug('subscribe-ack', frame.channels);
                return;
            }
            case FRAME_TYPES.CLOSE: {
                this.logger.debug('server close', frame.code, frame.reason);
                if (conn.transport) conn.transport.close();
                return;
            }
            default:
                this.logger.warn('unknown frame type', frame.type);
        }
    }

    startObserver() {
        if (this.observer || typeof MutationObserver === 'undefined' || typeof document === 'undefined') return;
        this.observer = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== 1) continue;
                    const elts = findStreamElements(node);
                    for (const el of elts) this.attach(el);
                }
                for (const node of m.removedNodes) {
                    if (node.nodeType !== 1) continue;
                    const elts = findStreamElements(node);
                    for (const el of elts) this.detach(el);
                }
            }
        });
        this.observer.observe(document.documentElement, { childList: true, subtree: true });
    }
}
