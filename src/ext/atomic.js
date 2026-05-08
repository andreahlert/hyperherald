// _hyperstream ext: atomic — batch swap helper
// M0: stub. M3 will implement batched DOM mutation in single animation frame.
'use strict';

(function () {
    if (typeof self === 'undefined' || !self._hyperstream) {
        console.warn('[_hyperstream/atomic] _hyperstream not loaded');
        return;
    }
    self._hyperstream.use((hs) => {
        hs.logger.debug('atomic ext loaded (stub)');
    });
})();
