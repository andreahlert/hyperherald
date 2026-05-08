# Changelog

## [Unreleased] — M1

Spec v0 wired end-to-end. SSE and WS transports, envelope dispatcher, swap targets, and a zero-deps reference server.

- `core/envelope.js` parses the v0 wire envelope (`v`, `seq`, `type`, `channel`, `ts`) and validates fragments against the swap whitelist
- `core/target.js` resolves selectors with `this`, `closest <css>`, `find <css>`, and bare CSS
- `core/swap.js` dispatches `inner | outer | replace | before | after | append | prepend | delete | morph` plus multi and atomic (rAF-batched)
- `core/attributes.js` reads `_stream`, `_stream-subscribe`, `_stream-coalesce`, `_stream-buffer`, `_stream-transport`, `_stream-suspense`, `_stream-debug`
- `core/cursor.js` tracks `(url, channel) -> seq` in `sessionStorage` for monotonic replay
- `core/subscriptions.js` registers elements per connection per channel (one connection per URL, fan-out to all subscribers)
- `transport/sse.js` lifts the hyperscript event-source parser; reconnect with exponential backoff + jitter, `Last-Event-ID` on resume, pause-on-background
- `transport/ws.js` raw WebSocket client with reconnect, subscribe handshake (channels + cursors), `updateChannels()` API
- `transport/pick.js` picks SSE vs WS from `_stream-transport` or URL scheme
- `core/runtime.js` scans `[_stream]`, opens transports, routes envelopes through swap dispatcher; MutationObserver for late-mounted elements
- `test/manual/server.js` zero-deps reference server: SSE + raw WS + `/publish` + per-channel replay buffer
- `test/manual/auction.html` + `auction-server.js` killer demo, atomic swap on bid (price + leader + countdown)
- 5 Playwright integration specs covering fragment, multi, atomic, append, and replay-on-reconnect
- Bundle: 14 KB min, 4.7 KB brotli

## [0.0.1] - 2026-05-08

First heartbeat. Repo skeleton, build pipeline, smoke test, and stub runtime.

- Repo bootstrap mirroring `_hyperscript` conventions
- esbuild config producing IIFE + ESM in normal + minified variants, brotli compressed
- Playwright smoke test verifying bundle loads and exposes `window._hyperstream`
- Stub `Runtime`, `config`, `logger`, and two extension stubs (`atomic`, `morph`)
- 0BSD license
- Plan and milestone breakdown documented internally
