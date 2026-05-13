// _hyperstream ext: morph, idiomorph passthrough (optional peer dep)
'use strict';

(function () {
    if (typeof self === 'undefined' || !self._hyperstream) {
        console.warn('[_hyperstream/morph] _hyperstream not loaded');
        return;
    }
    self._hyperstream.use((hs) => {
        hs.logger.debug('morph ext loaded');
    });
})();
