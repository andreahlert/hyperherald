// _hyperherald transport picker — heuristic SSE vs WS
'use strict';

/**
 * Pick a transport adapter given a desired choice and URL.
 * Returns 'sse' or 'ws'.
 *
 * Rules:
 *   - 'sse' or 'ws' explicit → returned as-is
 *   - 'auto':
 *       - ws://, wss:// → ws
 *       - everything else → sse
 */
export function pickTransport(desired, url) {
    if (desired === 'sse' || desired === 'ws') return desired;
    if (typeof url === 'string') {
        const lower = url.toLowerCase();
        if (lower.startsWith('ws://') || lower.startsWith('wss://')) return 'ws';
    }
    return 'sse';
}
