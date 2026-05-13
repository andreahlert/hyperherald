// _hyperherald attribute parser — DOM element → config object
'use strict';

const PREFIX = '_herald';

/** Get the value of `_herald*` attributes from an element, supporting hyphen variants. */
export function attr(el, name) {
    if (!el || !el.getAttribute) return null;
    const direct = el.getAttribute(name);
    if (direct != null) return direct;
    return null;
}

/** Parse `_herald-coalesce="window:200ms strategy:last key:foo"` into { window, strategy, key }. */
export function parseKVString(value) {
    if (!value) return {};
    const out = {};
    for (const part of value.split(/\s+/)) {
        const idx = part.indexOf(':');
        if (idx < 0) continue;
        out[part.slice(0, idx)] = part.slice(idx + 1);
    }
    return out;
}

/** Parse a duration string like "200ms", "1s", "500" (ms) into milliseconds. */
export function parseDuration(s) {
    if (s == null) return null;
    const str = String(s).trim();
    if (str.endsWith('ms')) return parseInt(str.slice(0, -2), 10);
    if (str.endsWith('s'))  return parseInt(str.slice(0, -1), 10) * 1000;
    const n = parseInt(str, 10);
    return isNaN(n) ? null : n;
}

/**
 * Read the full _hyperherald attribute set from a connection element.
 * Returns null if the element has no `_herald` attribute.
 */
export function readElementConfig(el) {
    const url = attr(el, PREFIX);
    if (url == null) return null;

    const subscribe = (attr(el, `${PREFIX}-subscribe`) || '')
        .split(/\s+/)
        .filter(Boolean);

    const coalesce = parseKVString(attr(el, `${PREFIX}-coalesce`));
    if (coalesce.window) coalesce.windowMs = parseDuration(coalesce.window);

    const buffer = parseKVString(attr(el, `${PREFIX}-buffer`));
    if (buffer.max) buffer.max = parseInt(buffer.max, 10);

    const transport = attr(el, `${PREFIX}-transport`) || 'auto';
    const debug = attr(el, `${PREFIX}-debug`) === 'true';
    const suspense = attr(el, `${PREFIX}-suspense`) || null;

    return {
        url,
        subscribe,
        coalesce,
        buffer,
        transport,
        debug,
        suspense,
    };
}

/** Find all elements with a `_herald` attribute under root (inclusive). */
export function findStreamElements(root) {
    if (!root || !root.querySelectorAll) return [];
    const out = [];
    if (root.nodeType === 1 && root.hasAttribute && root.hasAttribute(PREFIX)) {
        out.push(root);
    }
    out.push(...root.querySelectorAll(`[${PREFIX}]`));
    return out;
}
