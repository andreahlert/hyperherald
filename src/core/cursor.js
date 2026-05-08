// _hyperstream cursor tracking — sessionStorage-backed seq per (url, channel)
'use strict';

import { logger } from './logger.js';

const STORAGE_KEY = '_hyperstream:cursor';

function loadAll() {
    if (typeof sessionStorage === 'undefined') return {};
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (e) {
        logger.warn('cursor: failed to read sessionStorage', e);
        return {};
    }
}

function saveAll(map) {
    if (typeof sessionStorage === 'undefined') return;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (e) {
        logger.warn('cursor: failed to write sessionStorage', e);
    }
}

function key(url, channel) {
    return `${url}::${channel}`;
}

export const cursor = {
    get(url, channel) {
        const map = loadAll();
        return map[key(url, channel)] ?? null;
    },
    set(url, channel, seq) {
        const map = loadAll();
        const k = key(url, channel);
        // Only advance forward
        if (map[k] != null && map[k] >= seq) return;
        map[k] = seq;
        saveAll(map);
    },
    clear(url, channel) {
        const map = loadAll();
        delete map[key(url, channel)];
        saveAll(map);
    },
    /** Snapshot of all cursors for a given URL — for sending in handshake. */
    forUrl(url) {
        const map = loadAll();
        const out = {};
        const prefix = `${url}::`;
        for (const k of Object.keys(map)) {
            if (k.startsWith(prefix)) {
                out[k.slice(prefix.length)] = map[k];
            }
        }
        return out;
    },
};
