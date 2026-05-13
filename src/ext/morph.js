// _hyperstream ext: morph
// Wires `swap="morph"` to Idiomorph if available on the page.
// Idiomorph: https://github.com/bigskysoftware/idiomorph
'use strict';

(function () {
    if (typeof self === 'undefined' || !self._hyperstream) {
        console.warn('[_hyperstream/morph] _hyperstream not loaded');
        return;
    }

    self._hyperstream.use((hs) => {
        hs.morph = function morph(target, html) {
            const Idiomorph = self.Idiomorph;
            if (!Idiomorph || typeof Idiomorph.morph !== 'function') {
                hs.logger.warn('morph ext active but window.Idiomorph not found; using outer fallback');
                const tmpl = document.createElement('template');
                tmpl.innerHTML = html;
                target.replaceWith(tmpl.content);
                return;
            }
            Idiomorph.morph(target, html);
        };
        hs.logger.debug('morph ext loaded');
    });
})();
