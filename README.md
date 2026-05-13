# _hyperstream

> declarative server-push hypermedia for the web

`_hyperstream` is the third leg of the [Big Sky](https://bigsky.software) hypermedia stack, alongside [htmx](https://htmx.org) and [_hyperscript](https://hyperscript.org).

| Project | Domain |
|---|---|
| **htmx** | request/response hypermedia |
| **_hyperscript** | client-side behavior |
| **_hyperstream** | server-push hypermedia |

It defines a small wire protocol and a tiny JavaScript client (~5KB target) that lets the server push HTML fragments to the browser, without forcing you to duplicate state on the client. **HTML is state. Server is source of truth. Client is projection.**

## Status

`0.0.1` — bootstrap. Spec and client are under active development. Not for production use.

## Quickstart

```html
<script src="https://unpkg.com/hyperstream.org@0.1/dist/_hyperstream.min.js"></script>

<div _stream="/events" _stream-subscribe="orders/123">
    <!-- server pushes fragments scoped to channel "orders/123" -->
</div>
```

ESM:

```js
import _hyperstream from 'hyperstream.org';
```

## Why

Real-time hypermedia in htmx today (SSE/WS extensions) is bolt-on. There is no native model for:

- Declarative subscription to topics
- Replay-with-cursor on reconnect (over WebSocket)
- Multi-element fan-out from a single server message
- Coalesce / throttle by key
- Backpressure
- Multiplexed channels in one connection
- Out-of-order rendering / suspense
- Atomic batch swaps

`_hyperstream` is a separate, server-agnostic project that adds these primitives without changing htmx core.

## Non-goals

- No client-side signals or reactive state
- No template engine on the client
- No reconnect logic exposed in user code
- No coupling to a server framework (Node ref impl is example only; spec is the contract)

## Contributing

`_hyperstream` aims to be small, correct, and predictable. Bug reports and PRs welcome via GitHub issues. See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
npm install
npm run build       # produces dist/
npm test            # runs Playwright smoke + unit tests
npm run test:manual # boots the manual demo server
```

## License

[0BSD](LICENSE)
