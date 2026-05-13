// _hyperstream ext: atomic, batch swap helper
'use strict';

(function () {
    if (typeof self === 'undefined' || !self._hyperstream) {
        console.warn('[_hyperstream/atomic] _hyperstream not loaded');
        return;
    }
    self._hyperstream.use((hs) => {
        hs.logger.debug('atomic ext loaded');
    });
})();
