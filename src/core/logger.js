// _hyperherald logger — gated by config.debug
'use strict';

import { config } from './config.js';

function fmt(args) {
    return ['[_hyperherald]', ...args];
}

export const logger = {
    info: (...args) => console.log(...fmt(args)),
    warn: (...args) => console.warn(...fmt(args)),
    error: (...args) => console.error(...fmt(args)),
    debug: (...args) => {
        if (config.debug) console.debug(...fmt(args));
    },
};
