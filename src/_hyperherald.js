// _hyperherald — declarative server-push hypermedia
// https://hyperherald.org
'use strict';

import { config } from './core/config.js';
import { Runtime } from './core/runtime.js';
import { logger } from './core/logger.js';
import { parseEnvelope, validateFragment, FRAME_TYPES, SWAP_STYLES } from './core/envelope.js';
import { applySwap, applyMulti, applyAtomic } from './core/swap.js';
import { resolveTarget } from './core/target.js';
import { cursor } from './core/cursor.js';
import { openSSE } from './transport/sse.js';
import { openWS } from './transport/ws.js';
import { pickTransport } from './transport/pick.js';

const VERSION = '0.0.1-alpha0';

const globalScope = typeof self !== 'undefined'
    ? self
    : (typeof global !== 'undefined' ? global : this);

const runtime = new Runtime({ config, logger });

const _hyperherald = {
    version: VERSION,
    config,
    runtime,
    logger,

    process: (root) => runtime.process(root),
    cleanup: (root) => runtime.cleanup(root),

    // extension hooks
    use(plugin) {
        plugin(_hyperherald);
    },

    /**
     * Internal modules exposed for advanced users, debugging, and extensions.
     *
     * UNSTABLE: anything under `internals` is not covered by semver. Names,
     * shapes, and presence may change in any minor release while the library
     * is < 1.0. Build against the documented top-level API (process, cleanup,
     * use, config, version, logger) and the spec, not against internals.
     */
    internals: {
        runtime,
        parseEnvelope,
        validateFragment,
        FRAME_TYPES,
        SWAP_STYLES,
        applySwap,
        applyMulti,
        applyAtomic,
        resolveTarget,
        cursor,
        openSSE,
        openWS,
        pickTransport,
    },
};

function ready(fn) {
    if (typeof document === 'undefined') return;
    if (document.readyState !== 'loading') {
        setTimeout(fn, 0);
    } else {
        document.addEventListener('DOMContentLoaded', fn);
    }
}

if (typeof document !== 'undefined') {
    ready(() => {
        logger.info(`_hyperherald ${VERSION}`);
        runtime.process(document.documentElement);
        document.dispatchEvent(new Event('hyperherald:ready'));
    });
}

if (typeof self !== 'undefined') {
    self._hyperherald = _hyperherald;
}

export default _hyperherald;
export { _hyperherald };
