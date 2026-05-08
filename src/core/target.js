// _hyperstream target resolution — selector → Element
'use strict';

/**
 * Resolve a target selector string against the document, scoped by source element.
 * Supports:
 *   - "this" → source element
 *   - "closest <selector>" → ancestor walk
 *   - "find <selector>" → descendant query within source
 *   - any CSS selector → document-wide query
 */
export function resolveTarget(selector, sourceElement) {
    if (!selector) return sourceElement || null;

    if (selector === 'this' || selector === 'self') {
        return sourceElement || null;
    }

    if (selector.startsWith('closest ')) {
        const css = selector.slice(8).trim();
        return sourceElement ? sourceElement.closest(css) : null;
    }

    if (selector.startsWith('find ')) {
        const css = selector.slice(5).trim();
        return sourceElement ? sourceElement.querySelector(css) : null;
    }

    return document.querySelector(selector);
}
