// _hyperherald swap dispatcher — applies a fragment to a DOM target
'use strict';

import { logger } from './logger.js';

function parseHTML(html) {
    const tmpl = document.createElement('template');
    tmpl.innerHTML = html;
    return tmpl.content;
}

/**
 * Apply a single fragment to its target.
 * fragment: { target, swap, html, suspense_id?, chunk?, final? }
 * target:   resolved Element (caller resolves via target.js)
 */
export function applySwap(target, fragment) {
    if (!target) {
        logger.warn('swap: target not resolved', fragment);
        return false;
    }

    const { swap, html } = fragment;

    switch (swap) {
        case 'inner':
            target.innerHTML = html;
            return true;

        case 'outer': {
            const frag = parseHTML(html);
            target.replaceWith(frag);
            return true;
        }

        case 'replace':
            target.innerHTML = '';
            target.append(parseHTML(html));
            return true;

        case 'before':
            target.before(parseHTML(html));
            return true;

        case 'after':
            target.after(parseHTML(html));
            return true;

        case 'append':
            target.append(parseHTML(html));
            return true;

        case 'prepend':
            target.prepend(parseHTML(html));
            return true;

        case 'delete':
            target.remove();
            return true;

        case 'morph':
            // Optional ext. Falls back to outer if morph not loaded.
            if (typeof window !== 'undefined' && window._hyperherald?.morph) {
                window._hyperherald.morph(target, html);
                return true;
            }
            logger.warn('swap=morph requested but morph ext not loaded; falling back to outer');
            target.replaceWith(parseHTML(html));
            return true;

        default:
            logger.warn(`unknown swap style: ${swap}`);
            return false;
    }
}

/** Apply a list of fragments sequentially. Continues on per-fragment error. */
export function applyMulti(fragments, resolveTargetFn) {
    for (const f of fragments) {
        try {
            const t = resolveTargetFn(f.target);
            applySwap(t, f);
        } catch (e) {
            logger.error('multi-swap fragment failed', e, f);
        }
    }
}

/** Apply all fragments inside a single rAF for atomic visual update. */
export function applyAtomic(fragments, resolveTargetFn) {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            applyMulti(fragments, resolveTargetFn);
            resolve();
        });
    });
}
