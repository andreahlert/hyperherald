// _hyperstream config — overridable defaults
'use strict';

export const config = {
    // protocol
    specVersion: 0,

    // transport
    defaultTransport: 'auto', // 'sse' | 'ws' | 'auto'

    // reconnect
    reconnectDelay: 1000,
    reconnectMaxDelay: 30000,
    reconnectMaxAttempts: Infinity,
    reconnectJitter: 0.3,

    // visibility
    pauseOnBackground: true,

    // buffering defaults
    defaultBufferMax: 100,
    defaultBufferDropPolicy: 'oldest', // 'oldest' | 'newest'

    // coalesce defaults
    defaultCoalesceWindowMs: 0, // 0 = disabled by default

    // debug
    debug: false,

    // attribute prefix (mirror htmx/hyperscript flexibility)
    attributePrefix: '_stream',
};
