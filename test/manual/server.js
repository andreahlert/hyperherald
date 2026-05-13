// _hyperstream reference server — zero deps, http + raw WS + SSE.
// Exposes: GET /sse, WS /ws, POST /publish, GET / static (test/manual).
//
// Channels keep an in-memory replay buffer (last N envelopes by seq).
// Clients subscribe via ?channels=a,b and ?cursor=ch:seq for replay.
'use strict';

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname);
const DEFAULT_DIST = path.resolve(__dirname, '../../dist');

const REPLAY_MAX = 200;
const SPEC_VERSION = 0;

// ───────────────────────────── channel registry ─────────────────────────────
const channels = new Map(); // name -> { seq, buffer:[{seq,wire}...], subscribers:Set<sub> }

function getChannel(name) {
    let c = channels.get(name);
    if (!c) {
        c = { seq: 0, buffer: [], subscribers: new Set() };
        channels.set(name, c);
    }
    return c;
}

// ───────────────────────────── HTML envelope serializer ─────────────────────
function attrEscape(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Inner HTML payload: only neutralize literal closing tags that would terminate
// our envelope wrappers prematurely. Server is trusted to produce coherent HTML.
function neutralizeInnerHTML(html) {
    return String(html).replace(/<\/(hs-fragment|hs-multi|hs-atomic|hs-partial)\b/gi, '<\\/$1');
}

function fragmentTag(f) {
    if (f.swap === 'delete' && f.html == null) {
        return `<hs-fragment target="${attrEscape(f.target)}" swap="delete"></hs-fragment>`;
    }
    return `<hs-fragment target="${attrEscape(f.target)}" swap="${attrEscape(f.swap || 'inner')}">${neutralizeInnerHTML(f.html ?? '')}</hs-fragment>`;
}

function buildEnvelope(channelName, seq, type, body) {
    const head = `v="${SPEC_VERSION}" channel="${attrEscape(channelName)}" seq="${seq}" ts="${Date.now()}"`;
    switch (type) {
        case 'fragment':
            return `<hs-fragment ${head} target="${attrEscape(body.target)}" swap="${attrEscape(body.swap || 'inner')}">${neutralizeInnerHTML(body.html ?? '')}</hs-fragment>`;
        case 'multi':
        case 'atomic': {
            const inner = (body.fragments || []).map(fragmentTag).join('');
            return `<hs-${type} ${head}>${inner}</hs-${type}>`;
        }
        case 'partial': {
            const final = body.final ? ' final="true"' : '';
            const sid = body.suspense_id ? ` suspense-id="${attrEscape(body.suspense_id)}"` : '';
            return `<hs-partial ${head} target="${attrEscape(body.target)}"${sid}${final}>${neutralizeInnerHTML(body.chunk ?? '')}</hs-partial>`;
        }
        case 'subscribe-ack': {
            const ch = (body.channels || []).map(attrEscape).join(' ');
            return `<hs-subscribe-ack ${head} channels="${ch}"></hs-subscribe-ack>`;
        }
        case 'close': {
            const reason = body.reason ? ` reason="${attrEscape(body.reason)}"` : '';
            return `<hs-close ${head} code="${body.code ?? 1000}"${reason}></hs-close>`;
        }
        default:
            throw new Error(`unknown envelope type: ${type}`);
    }
}

export function publish(channelName, type, body = {}) {
    const c = getChannel(channelName);
    c.seq++;
    const wire = buildEnvelope(channelName, c.seq, type, body);
    const entry = { seq: c.seq, channel: channelName, type, wire };
    c.buffer.push(entry);
    if (c.buffer.length > REPLAY_MAX) c.buffer.shift();
    for (const sub of c.subscribers) {
        try { sub.send(entry); } catch (e) { /* ignore */ }
    }
    return entry;
}

function replay(channelName, fromSeq, sink) {
    const c = getChannel(channelName);
    for (const env of c.buffer) {
        if (env.seq > fromSeq) sink.send(env);
    }
}

// ───────────────────────────── parsing helpers ─────────────────────────────
function decodeAttr(s) {
    return String(s).replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function parseAttrs(attrString) {
    const out = {};
    const re = /([a-zA-Z_:-][\w:-]*)\s*=\s*"([^"]*)"/g;
    let m;
    while ((m = re.exec(attrString)) !== null) out[m[1]] = decodeAttr(m[2]);
    return out;
}

/** Parse a <hs-subscribe ...> wire string into { channels, cursors } or null. */
function parseSubscribeWire(text) {
    const m = text.match(/^<hs-subscribe\b([^>]*)>(?:[\s\S]*<\/hs-subscribe>)?$/i);
    if (!m) return null;
    const attrs = parseAttrs(m[1]);
    const channels = (attrs.channels || '').trim().split(/\s+/).filter(Boolean);
    const cursors = {};
    if (attrs.cursors) {
        for (const tok of attrs.cursors.trim().split(/\s+/)) {
            const i = tok.lastIndexOf(':');
            if (i > 0) {
                const ch = tok.slice(0, i);
                const seq = parseInt(tok.slice(i + 1), 10);
                if (!isNaN(seq)) cursors[ch] = seq;
            }
        }
    }
    return { channels, cursors };
}

function parseChannelsParam(searchParams) {
    const raw = searchParams.get('channels') || '';
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseCursorsParam(searchParams) {
    const out = {};
    for (const v of searchParams.getAll('cursor')) {
        const i = v.indexOf(':');
        if (i < 0) continue;
        const ch = v.slice(0, i);
        const seq = parseInt(v.slice(i + 1), 10);
        if (!isNaN(seq)) out[ch] = seq;
    }
    return out;
}

// ───────────────────────────── SSE transport ─────────────────────────────
function handleSSE(req, res, url) {
    const channels = parseChannelsParam(url.searchParams);
    let cursors = parseCursorsParam(url.searchParams);

    const lastEventId = req.headers['last-event-id'];
    if (lastEventId) {
        // Format: "ch:seq" — single-channel resume helper.
        const i = lastEventId.indexOf(':');
        if (i > 0) {
            const ch = lastEventId.slice(0, i);
            const seq = parseInt(lastEventId.slice(i + 1), 10);
            if (!isNaN(seq)) cursors[ch] = Math.max(cursors[ch] ?? 0, seq);
        }
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.write(': hyperstream sse\n\n');

    function writeWire(channel, seq, wire) {
        const id = `${channel}:${seq}`;
        res.write(`id: ${id}\n`);
        // SSE data lines are line-oriented; HTML payload may contain newlines.
        const lines = wire.split('\n');
        for (const ln of lines) res.write(`data: ${ln}\n`);
        res.write('\n');
    }

    const sub = {
        send(entry) {
            writeWire(entry.channel, entry.seq, entry.wire);
        },
    };
    for (const name of channels) getChannel(name).subscribers.add(sub);

    // subscribe-ack envelope (HTML)
    const ackWire = buildEnvelope('_meta', 0, 'subscribe-ack', { channels });
    writeWire('_meta', 0, ackWire);

    for (const name of channels) {
        const fromSeq = cursors[name] ?? 0;
        replay(name, fromSeq, sub);
    }

    const ping = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
        clearInterval(ping);
        for (const name of channels) getChannel(name).subscribers.delete(sub);
    });
}

// ───────────────────────────── WS transport (raw RFC 6455) ─────────────────────────────
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function wsAccept(key) {
    return crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
}

function wsEncodeText(text) {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x81; // FIN + text
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
}

function wsCloseFrame(code = 1000) {
    const buf = Buffer.alloc(4);
    buf[0] = 0x88; buf[1] = 0x02;
    buf.writeUInt16BE(code, 2);
    return buf;
}

function wsParseFrames(buffer) {
    const frames = [];
    let offset = 0;
    while (offset + 2 <= buffer.length) {
        const b0 = buffer[offset];
        const b1 = buffer[offset + 1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        const masked = (b1 & 0x80) !== 0;
        let len = b1 & 0x7f;
        let p = offset + 2;
        if (len === 126) {
            if (p + 2 > buffer.length) break;
            len = buffer.readUInt16BE(p); p += 2;
        } else if (len === 127) {
            if (p + 8 > buffer.length) break;
            len = Number(buffer.readBigUInt64BE(p)); p += 8;
        }
        let mask = null;
        if (masked) {
            if (p + 4 > buffer.length) break;
            mask = buffer.subarray(p, p + 4); p += 4;
        }
        if (p + len > buffer.length) break;
        let payload = buffer.subarray(p, p + len);
        if (masked) {
            const out = Buffer.alloc(len);
            for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
            payload = out;
        }
        frames.push({ fin, opcode, payload });
        offset = p + len;
    }
    return { frames, rest: buffer.subarray(offset) };
}

function handleWSUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { socket.destroy(); return; }
    const accept = wsAccept(key);
    socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const url = new URL(req.url, 'http://localhost');
    const initialChannels = parseChannelsParam(url.searchParams);
    const initialCursors = parseCursorsParam(url.searchParams);

    const subscribed = new Set();
    let buffer = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
    let textBuffer = '';

    const sub = {
        send(entry) {
            socket.write(wsEncodeText(entry.wire));
        },
        sendRaw(wire) {
            socket.write(wsEncodeText(wire));
        },
    };

    function subscribeTo(channels, cursors) {
        // Unsubscribe from removed
        for (const name of subscribed) {
            if (!channels.includes(name)) {
                getChannel(name).subscribers.delete(sub);
                subscribed.delete(name);
            }
        }
        for (const name of channels) {
            if (subscribed.has(name)) continue;
            getChannel(name).subscribers.add(sub);
            subscribed.add(name);
        }
        sub.sendRaw(buildEnvelope('_meta', 0, 'subscribe-ack', { channels }));
        for (const name of channels) {
            const fromSeq = cursors[name] ?? 0;
            replay(name, fromSeq, sub);
        }
    }

    if (initialChannels.length > 0) {
        subscribeTo(initialChannels, initialCursors);
    }

    socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        const { frames, rest } = wsParseFrames(buffer);
        buffer = rest;
        for (const f of frames) {
            if (f.opcode === 0x8) {
                socket.end(wsCloseFrame(1000));
                return;
            }
            if (f.opcode === 0x9) { // ping → pong
                const pong = Buffer.alloc(2 + f.payload.length);
                pong[0] = 0x8a; pong[1] = f.payload.length;
                f.payload.copy(pong, 2);
                socket.write(pong);
                continue;
            }
            if (f.opcode !== 0x1 && f.opcode !== 0x0) continue;
            textBuffer += f.payload.toString('utf8');
            if (!f.fin) continue;
            const text = textBuffer.trim();
            textBuffer = '';
            const msg = parseSubscribeWire(text);
            if (msg) subscribeTo(msg.channels, msg.cursors);
        }
    });

    const cleanup = () => {
        for (const name of subscribed) getChannel(name).subscribers.delete(sub);
        subscribed.clear();
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
}

// ───────────────────────────── publish endpoint ─────────────────────────────
function handlePublish(req, res) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        try {
            const { channel, type, ...rest } = JSON.parse(body);
            const entry = publish(channel, type, rest);
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(entry.wire);
        } catch (e) {
            res.writeHead(400);
            res.end(`bad publish: ${e.message}`);
        }
    });
}

// ───────────────────────────── static + dist ─────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function makeServeStatic({ staticRoot, distRoot }) {
    return function serveStatic(req, res, urlPath) {
        let base, rel;
        if (urlPath.startsWith('/dist/')) {
            base = distRoot;
            rel = urlPath.slice('/dist/'.length);
        } else {
            base = staticRoot;
            rel = urlPath === '/' ? 'index.html' : urlPath.slice(1);
        }
        const full = path.normalize(path.join(base, rel));
        if (!full.startsWith(base)) { res.writeHead(403); res.end(); return; }
        fs.readFile(full, (err, data) => {
            if (err) { res.writeHead(404); res.end('not found'); return; }
            const ext = path.extname(full).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            res.end(data);
        });
    };
}

// ───────────────────────────── server ─────────────────────────────
export function createServer(opts = {}) {
    const extra = typeof opts.handler === 'function' ? opts.handler : null;
    const staticRoot = opts.staticRoot ? path.resolve(opts.staticRoot) : DEFAULT_ROOT;
    const distRoot = opts.distRoot ? path.resolve(opts.distRoot) : DEFAULT_DIST;
    const serveStatic = makeServeStatic({ staticRoot, distRoot });
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (extra && extra(req, res, url) === true) return;
        if (url.pathname === '/sse' && req.method === 'GET') return handleSSE(req, res, url);
        if (url.pathname === '/publish' && req.method === 'POST') return handlePublish(req, res);
        return serveStatic(req, res, url.pathname);
    });
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/ws') return handleWSUpgrade(req, socket, head);
        socket.destroy();
    });
    return server;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    const server = createServer({ staticRoot: process.env.STATIC_ROOT });
    server.listen(port, () => {
        console.log(`hyperstream ref server listening on http://localhost:${port}`);
    });
}
