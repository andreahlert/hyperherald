// _hyperstream site + auction server — Railway entry.
// Wraps the reference impl, sets staticRoot to www/, and adds the /bid endpoint.
'use strict';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, publish } from '../test/manual/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const state = {
    item: 'lot-1',
    title: 'Vintage Big Sky Software T-Shirt (size M)',
    price: 100,
    leader: 'nobody yet',
    endsAt: Date.now() + 60_000,
};

function broadcastState() {
    publish('auction:lot-1', 'atomic', {
        fragments: [
            {
                target: '#price',
                swap: 'inner',
                html: `<strong>$${state.price}</strong>`,
            },
            {
                target: '#leader',
                swap: 'inner',
                html: `<em>${state.leader}</em>`,
            },
            {
                target: '#countdown',
                swap: 'inner',
                html: String(Math.max(0, Math.round((state.endsAt - Date.now()) / 1000))),
            },
        ],
    });
}

function tickCountdown() {
    publish('auction:lot-1', 'fragment', {
        target: '#countdown',
        swap: 'inner',
        html: String(Math.max(0, Math.round((state.endsAt - Date.now()) / 1000))),
    });
}

let bidQueue = Promise.resolve();

function processBid({ amount, bidder }) {
    if (isNaN(amount) || amount <= state.price) {
        return { ok: false, html: `<p style="color:red">bid must beat current $${state.price}</p>` };
    }
    state.price = amount;
    state.leader = bidder;
    state.endsAt = Date.now() + 30_000;
    broadcastState();
    return { ok: true, html: `<p>bid $${amount} accepted</p>` };
}

function handleBid(req, res) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
        bidQueue = bidQueue.then(() => {
            try {
                const params = new URLSearchParams(body);
                const amount = parseInt(params.get('amount'), 10);
                const bidder = (params.get('bidder') || 'anon').slice(0, 32);
                const result = processBid({ amount, bidder });
                res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'text/html' });
                res.end(result.html);
            } catch (e) {
                res.writeHead(400);
                res.end('bad bid');
            }
        });
    });
}

const server = createServer({
    staticRoot: __dirname,
    handler(req, res, url) {
        if (url.pathname === '/' && req.method === 'GET') {
            res.writeHead(302, { Location: '/retro.html' });
            res.end();
            return true;
        }
        if (url.pathname === '/bid' && req.method === 'POST') {
            handleBid(req, res);
            return true;
        }
        return false;
    },
});

setInterval(tickCountdown, 1000);

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
server.listen(port, () => {
    console.log(`hyperstream listening on http://localhost:${port}/`);
    broadcastState();
});
