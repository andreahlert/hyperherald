// _hyperstream — declarative server-push hypermedia
// https://hyperstream.org
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

const VERSION = '0.0.1';

const globalScope = typeof self !== 'undefined'
    ? self
    : (typeof global !== 'undefined' ? global : this);

const runtime = new Runtime({ config, logger });

const _hyperstream = {
    version: VERSION,
    config,
    runtime,
    logger,

    process: (root) => runtime.process(root),
    cleanup: (root) => runtime.cleanup(root),

    // extension hooks
    use(plugin) {
        plugin(_hyperstream);
    },

    // internals (advanced / debugging)
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
        logger.info(`_hyperstream ${VERSION}`);
        runtime.process(document.documentElement);
        document.dispatchEvent(new Event('hyperstream:ready'));
    });
}

if (typeof self !== 'undefined') {
    self._hyperstream = _hyperstream;
}

export default _hyperstream;
export { _hyperstream };
