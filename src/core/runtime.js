// _hyperherald runtime — boots, scans DOM, manages connections per [_herald] element
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
        this.elementQos = new WeakMap(); // element -> { coalesce, buffer }
        this.suspense = new Map(); // suspense_id -> { lastSeq, sealed }
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

        const qos = this.initQos(cfg);
        if (qos) this.elementQos.set(el, qos);

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
        const qos = this.elementQos.get(el);
        if (qos && qos.coalesce) {
            for (const entry of qos.coalesce.pending.values()) {
                if (entry.timer) clearTimeout(entry.timer);
            }
            qos.coalesce.pending.clear();
        }
        this.elementQos.delete(el);
        this.registry.unregister(conn.url, el);
        // If conn still alive, sync subscriptions to remaining elements.
        if (this.registry.getConnection(conn.url)) {
            this.maybeUpdateChannels(conn);
        }
    }

    initQos(cfg) {
        const c = cfg.coalesce || {};
        const b = cfg.buffer || {};
        const hasCoalesce = typeof c.windowMs === 'number' && c.windowMs > 0;
        const hasBuffer = typeof b.max === 'number' && b.max > 0;
        if (!hasCoalesce && !hasBuffer) return null;
        return {
            coalesce: hasCoalesce ? {
                windowMs: c.windowMs,
                strategy: c.strategy || 'last',
                keyPrefix: c.key || '',
                pending: new Map(),
            } : null,
            buffer: hasBuffer ? {
                max: b.max,
                drop: b.drop || 'oldest',
                queue: [],
                scheduled: false,
            } : null,
        };
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
                        const qos = this.elementQos.get(el);
                        if (qos) {
                            this.enqueueQos(el, qos, frame);
                        } else {
                            const t = resolveTarget(frame.target, el);
                            applySwap(t, frame);
                        }
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
                this.dispatchPartial(conn, frame, elements);
                return;
            }
            case FRAME_TYPES.SUBSCRIBE_ACK: {
                this.logger.debug('subscribe-ack', frame.channels);
                return;
            }
            case FRAME_TYPES.CLOSE: {
                this.logger.debug('server close', frame.code, frame.reason);
                if (frame.code === 4001) {
                    this.dispatchGone(conn, frame);
                }
                if (conn.transport) conn.transport.close();
                return;
            }
            default:
                this.logger.warn('unknown frame type', frame.type);
        }
    }

    dispatchPartial(conn, frame, elements) {
        const id = frame.suspense_id || '';
        let entry = null;
        if (id) {
            entry = this.suspense.get(id);
            if (!entry) {
                entry = { lastSeq: -1, sealed: false };
                this.suspense.set(id, entry);
            }
            if (entry.sealed) return;
            if (typeof frame.seq === 'number' && frame.seq <= entry.lastSeq) return;
        }

        const targets = elements.length === 0
            ? [resolveTarget(frame.target, null)]
            : elements.map((el) => resolveTarget(frame.target, el));

        let applied = false;
        for (const t of targets) {
            if (!t) continue;
            t.insertAdjacentHTML('beforeend', frame.chunk);
            applied = true;
        }

        if (!applied) return;
        if (entry && typeof frame.seq === 'number') entry.lastSeq = frame.seq;

        if (frame.final) {
            if (entry) entry.sealed = true;
            const detail = {
                url: conn.url,
                channel: frame.channel,
                suspense_id: id,
            };
            for (const t of targets) {
                if (!t) continue;
                t.dispatchEvent(new CustomEvent('hyperherald:suspense:done', { detail, bubbles: true }));
            }
        }
    }

    dispatchGone(conn, frame) {
        const detail = {
            url: conn.url,
            channel: frame.channel,
            code: frame.code,
            reason: frame.reason || '',
        };
        const elements = conn.elementsForChannel(frame.channel);
        if (elements.length === 0) {
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('hyperherald:gone', { detail, bubbles: true }));
            }
            return;
        }
        for (const el of elements) {
            el.dispatchEvent(new CustomEvent('hyperherald:gone', { detail, bubbles: true }));
        }
    }

    enqueueQos(el, qos, frame) {
        if (qos.coalesce) {
            this.coalesceEnqueue(el, qos, frame);
        } else {
            this.bufferEnqueue(el, qos, frame);
        }
    }

    coalesceEnqueue(el, qos, frame) {
        const c = qos.coalesce;
        const key = (c.keyPrefix ? c.keyPrefix + ':' : '') + (frame.target || '');
        const existing = c.pending.get(key);
        if (existing) {
            if (c.strategy === 'first') return;
            existing.frame = frame;
            return;
        }
        const entry = { frame, timer: null };
        c.pending.set(key, entry);
        entry.timer = setTimeout(() => {
            c.pending.delete(key);
            if (qos.buffer) {
                this.bufferEnqueue(el, qos, entry.frame);
            } else {
                this.applyQosFrame(el, entry.frame);
            }
        }, c.windowMs);
    }

    bufferEnqueue(el, qos, frame) {
        const b = qos.buffer;
        if (b.queue.length >= b.max) {
            if (b.drop === 'newest') return;
            b.queue.shift();
        }
        b.queue.push(frame);
        if (b.scheduled) return;
        b.scheduled = true;
        const flush = () => {
            b.scheduled = false;
            const items = b.queue.splice(0);
            for (const f of items) this.applyQosFrame(el, f);
        };
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(flush);
        } else {
            setTimeout(flush, 0);
        }
    }

    applyQosFrame(el, frame) {
        const t = resolveTarget(frame.target, el);
        applySwap(t, frame);
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
