# _hyperherald

> declarative server-push hypermedia for the web

`_hyperherald` is designed to compose with [htmx](https://htmx.org) and [_hyperscript](https://hyperscript.org), covering a domain neither owns: server-push hypermedia. It draws from the [Big Sky](https://bigsky.software) tradition of small, composable hypermedia tools, in the same spirit, with no formal affiliation.

| Project | Domain |
|---|---|
| **htmx** | request/response hypermedia |
| **_hyperscript** | client-side behavior |
| **_hyperherald** | server-push hypermedia |

It defines a small wire protocol and a small JavaScript client that lets the server push HTML fragments to the browser, without forcing you to duplicate state on the client. **HTML is state. Server is source of truth. Client is projection.**

See [PRINCIPLES.md](PRINCIPLES.md) for the constitutional design rules of the project.

## Status

`0.0.1-alpha0` — bootstrap. Spec and client are under active development. Not for production use.

## Quickstart

```html
<script src="https://unpkg.com/hyperherald.org/dist/_hyperherald.min.js"></script>

<div _herald="/events" _herald-subscribe="orders/123">
    <!-- server pushes fragments scoped to channel "orders/123" -->
</div>
```

ESM:

```js
import _hyperherald from 'hyperherald.org';
```

> Note: the package is not yet on npm. Until first publish, install from this repo or vendor `dist/_hyperherald.min.js` directly.

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

`_hyperherald` is a separate, server-agnostic project that adds these primitives without changing htmx core.

## Non-goals

- No client-side signals or reactive state
- No template engine on the client
- No reconnect logic exposed in user code
- No coupling to a server framework (Node ref impl is example only; spec is the contract)

## Contributing

`_hyperherald` aims to be small, correct, and predictable. Bug reports and PRs welcome via GitHub issues. See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
npm install
npm run build       # produces dist/
npm test            # runs Playwright smoke + unit tests
npm run test:manual # boots the manual demo server
```

## License

[0BSD](LICENSE)
