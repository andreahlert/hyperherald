// _hyperstream subscription registry — (connection → channels → elements)
'use strict';

/**
 * Tracks which elements are subscribed to which channels per connection URL.
 * One Connection object per URL; multiple elements may share it.
 */
export class SubscriptionRegistry {
    constructor() {
        this.connections = new Map(); // url -> Connection
    }

    register(url, element, channels) {
        let conn = this.connections.get(url);
        if (!conn) {
            conn = new Connection(url);
            this.connections.set(url, conn);
        }
        conn.addElement(element, channels);
        return conn;
    }

    unregister(url, element) {
        const conn = this.connections.get(url);
        if (!conn) return;
        conn.removeElement(element);
        if (conn.isEmpty()) {
            conn.close();
            this.connections.delete(url);
        }
    }

    getConnection(url) {
        return this.connections.get(url);
    }

    /** Find elements subscribed to a given channel on a given connection. */
    elementsFor(url, channel) {
        const conn = this.connections.get(url);
        if (!conn) return [];
        return conn.elementsForChannel(channel);
    }
}

export class Connection {
    constructor(url) {
        this.url = url;
        this.elements = new Map(); // element -> Set<channel>
        this.channels = new Map(); // channel -> Set<element>
        this.transport = null;     // attached transport instance (sse/ws)
        this.lastSeq = new Map();  // channel -> last seen seq
    }

    addElement(element, channels) {
        let set = this.elements.get(element);
        if (!set) {
            set = new Set();
            this.elements.set(element, set);
        }
        for (const ch of channels) {
            set.add(ch);
            let elts = this.channels.get(ch);
            if (!elts) {
                elts = new Set();
                this.channels.set(ch, elts);
            }
            elts.add(element);
        }
    }

    removeElement(element) {
        const channels = this.elements.get(element);
        if (!channels) return;
        for (const ch of channels) {
            const elts = this.channels.get(ch);
            if (elts) {
                elts.delete(element);
                if (elts.size === 0) this.channels.delete(ch);
            }
        }
        this.elements.delete(element);
    }

    elementsForChannel(channel) {
        const set = this.channels.get(channel);
        return set ? Array.from(set) : [];
    }

    allChannels() {
        return Array.from(this.channels.keys());
    }

    isEmpty() {
        return this.elements.size === 0;
    }

    setTransport(t) {
        this.transport = t;
    }

    close() {
        if (this.transport && typeof this.transport.close === 'function') {
            this.transport.close();
        }
        this.transport = null;
    }

    recordSeq(channel, seq) {
        const prev = this.lastSeq.get(channel) ?? -1;
        if (seq > prev) this.lastSeq.set(channel, seq);
    }
}
