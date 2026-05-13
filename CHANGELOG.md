# Changelog

## [0.0.1-alpha0] - 2026-05-13

### Added

- Client-side QoS: `_herald-coalesce="window:Nms strategy:last|first key:..."` collapses fragment bursts keyed by target; `_herald-buffer="max:N drop:oldest|newest"` caps queue length and flushes per animation frame. Multi/atomic frames pass through unchanged.
- QoS integration tests (`test/integration/qos.spec.js`): coalesce window collapse, per-target key isolation, buffer cap + drop-oldest
- `PRINCIPLES.md`, constitutional design rules of the project (18 principles)
- `hyperherald:gone` event dispatched on `<hh-close code="4001">` so apps can recover from cursor-expired
- Suspense slot registry: `<hh-partial>` chunks dedupe by seq per `suspense-id`, sealed on `final="true"`, dispatch `hyperherald:suspense:done`
- `ext/morph.js` now wires `swap="morph"` to `window.Idiomorph` when present, with `outer` fallback and warning
- WS integration test suite (`test/integration/ws.spec.js`): connect, fragment, multi, append, replay on reconnect
- Suspense + gone integration suite (`test/integration/spec-extras.spec.js`)
- CI workflow (`.github/workflows/test.yml`) running `npm test` on PR and push to `main`

### Changed

- Reference server no longer resolves a sibling `htmx4/dist` path. Filesystem coupling removed.
- Auction demo bids now serialize through a promise queue, eliminating compare-and-set race.

### Removed

- `ext/atomic.js` stub. Atomic semantics live in the core via `<hh-atomic>` envelope; the empty extension was redundant.
- README claim of `~5KB target`. Replaced with the honest `small`.

## [Pre-unreleased snapshot]

Spec v0 wired end-to-end. SSE and WS transports, envelope dispatcher, swap targets, and a zero-deps reference server.

- `core/envelope.js` parses the v0 wire envelope (`v`, `seq`, `type`, `channel`, `ts`) and validates fragments against the swap whitelist
- `core/target.js` resolves selectors with `this`, `closest <css>`, `find <css>`, and bare CSS
- `core/swap.js` dispatches `inner | outer | replace | before | after | append | prepend | delete | morph` plus multi and atomic (rAF-batched)
- `core/attributes.js` reads `_herald`, `_herald-subscribe`, `_herald-coalesce`, `_herald-buffer`, `_herald-transport`, `_herald-suspense`, `_herald-debug`
- `core/cursor.js` tracks `(url, channel) -> seq` in `sessionStorage` for monotonic replay
- `core/subscriptions.js` registers elements per connection per channel (one connection per URL, fan-out to all subscribers)
- `transport/sse.js` lifts the hyperscript event-source parser; reconnect with exponential backoff + jitter, `Last-Event-ID` on resume, pause-on-background
- `transport/ws.js` raw WebSocket client with reconnect, subscribe handshake (channels + cursors), `updateChannels()` API
- `transport/pick.js` picks SSE vs WS from `_herald-transport` or URL scheme
- `core/runtime.js` scans `[_herald]`, opens transports, routes envelopes through swap dispatcher; MutationObserver for late-mounted elements
- `test/manual/server.js` zero-deps reference server: SSE + raw WS + `/publish` + per-channel replay buffer
- `test/manual/auction.html` + `auction-server.js` killer demo, atomic swap on bid (price + leader + countdown)
- 5 Playwright integration specs covering fragment, multi, atomic, append, and replay-on-reconnect
- Bundle: 14 KB min, 4.7 KB brotli

## [0.0.1] - 2026-05-08

First heartbeat. Repo skeleton, build pipeline, smoke test, and stub runtime.

- Repo bootstrap mirroring `_hyperscript` conventions
- esbuild config producing IIFE + ESM in normal + minified variants, brotli compressed
- Playwright smoke test verifying bundle loads and exposes `window._hyperherald`
- Stub `Runtime`, `config`, `logger`, and two extension stubs (`atomic`, `morph`)
- 0BSD license
