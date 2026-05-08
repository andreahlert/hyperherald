// _hyperstream envelope, HTML-over-the-wire parser
// Spec: www/docs/spec.md
'use strict';

import { config } from './config.js';
import { logger } from './logger.js';

export const FRAME_TYPES = Object.freeze({
    FRAGMENT:      'fragment',
    MULTI:         'multi',
    ATOMIC:        'atomic',
    PARTIAL:       'partial',
    SUBSCRIBE_ACK: 'subscribe-ack',
    CLOSE:         'close',
});

const TAG_TO_TYPE = Object.freeze({
    'hs-fragment':      FRAME_TYPES.FRAGMENT,
    'hs-multi':         FRAME_TYPES.MULTI,
    'hs-atomic':        FRAME_TYPES.ATOMIC,
    'hs-partial':       FRAME_TYPES.PARTIAL,
    'hs-subscribe-ack': FRAME_TYPES.SUBSCRIBE_ACK,
    'hs-close':         FRAME_TYPES.CLOSE,
});

export const SWAP_STYLES = Object.freeze([
    'inner', 'outer', 'before', 'after',
    'append', 'prepend', 'delete', 'replace',
    'morph',
]);

function parseRoot(html) {
    const tmpl = document.createElement('template');
    tmpl.innerHTML = String(html).trim();
    return tmpl.content.firstElementChild;
}

function readNum(el, attr) {
    const raw = el.getAttribute(attr);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

function readChildFragments(parent) {
    const out = [];
    for (const child of parent.children) {
        if (child.tagName.toLowerCase() !== 'hs-fragment') continue;
        out.push({
            target: child.getAttribute('target') || '',
            swap:   child.getAttribute('swap')   || 'inner',
            html:   child.innerHTML,
        });
    }
    return out;
}

/**
 * Parse a wire string (HTML envelope) or accept a parsed Element and return
 * a normalized frame object. Returns { ok: true, frame } or { ok: false, error }.
 */
export function parseEnvelope(input) {
    let root;
    if (typeof input === 'string') {
        root = parseRoot(input);
        if (!root) return { ok: false, error: 'envelope: empty or malformed HTML' };
    } else if (input && typeof input === 'object' && input.tagName) {
        root = input;
    } else {
        return { ok: false, error: 'envelope must be HTML string or Element' };
    }

    const tag = root.tagName.toLowerCase();
    const type = TAG_TO_TYPE[tag];
    if (!type) return { ok: false, error: `unknown envelope tag: <${tag}>` };

    const v = readNum(root, 'v');
    if (v != null && v !== config.specVersion) {
        logger.warn(`spec version mismatch: got v=${v}, expected v=${config.specVersion}`);
    }

    const seq     = readNum(root, 'seq') ?? 0;
    const channel = root.getAttribute('channel') || '_meta';
    const ts      = readNum(root, 'ts') ?? Date.now();

    const frame = { v: v ?? config.specVersion, seq, channel, type, ts };

    switch (type) {
        case FRAME_TYPES.FRAGMENT:
            frame.target = root.getAttribute('target') || '';
            frame.swap   = root.getAttribute('swap')   || 'inner';
            frame.html   = root.innerHTML;
            break;

        case FRAME_TYPES.MULTI:
        case FRAME_TYPES.ATOMIC:
            frame.fragments = readChildFragments(root);
            break;

        case FRAME_TYPES.PARTIAL:
            frame.target       = root.getAttribute('target') || '';
            frame.suspense_id  = root.getAttribute('suspense-id') || '';
            frame.chunk        = root.innerHTML;
            frame.final        = root.getAttribute('final') === 'true';
            break;

        case FRAME_TYPES.SUBSCRIBE_ACK: {
            const list = (root.getAttribute('channels') || '').trim();
            frame.channels = list ? list.split(/\s+/) : [];
            break;
        }

        case FRAME_TYPES.CLOSE:
            frame.code   = readNum(root, 'code') ?? 1000;
            frame.reason = root.getAttribute('reason') || '';
            break;
    }

    return { ok: true, frame };
}

/** Validate a fragment shape (used by fragment, multi, atomic). */
export function validateFragment(f) {
    if (!f || typeof f !== 'object') return 'fragment must be object';
    if (typeof f.target !== 'string' || !f.target) return 'fragment.target must be non-empty string';
    if (typeof f.swap !== 'string') return 'fragment.swap must be string';
    if (!SWAP_STYLES.includes(f.swap)) return `unknown swap style: ${f.swap}`;
    if (f.swap !== 'delete' && typeof f.html !== 'string') {
        return 'fragment.html required unless swap=delete';
    }
    return null;
}
