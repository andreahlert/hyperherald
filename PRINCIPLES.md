# _hyperstream Design Principles

These principles are constitutional. If any future design decision contradicts a principle, the principle wins. The spec, the client, and any reference server implementation are downstream of this document.

## 0. HTML is the wire

The transport carries HTML, not JSON, not protobuf, not a bespoke binary frame. Every envelope is a custom element the browser already knows how to parse. Servers write HTML to a stream, clients parse HTML and apply swaps. There is no second serialization format between the application and the screen.

## 1. The server is the source of truth, the client is a projection

State lives on the server. The DOM is the current rendering of that state. The client does not maintain a parallel model, does not reconcile a virtual tree, does not own truth. If the server says it, the DOM becomes it.

## 2. No client-side reactive layer

`_hyperstream` does not ship signals, stores, observables, or a reactive graph. The reactivity primitive is "the server pushes a fragment, the client swaps it in". Anything beyond that belongs to the application, not to the library.

## 3. Declarative subscription, imperative escape hatch

Subscribing to a channel is an attribute on an element. Opening a connection is an attribute on an element. Reconnect, replay, and cursor management happen because attributes exist, not because the user wrote lifecycle code. Imperative APIs exist for extensions and tests, never as the primary path.

## 4. The DOM is dynamic, connections follow it

The page rarely loads in one shot and stays still. htmx swaps regions, scripts inject panels, routers replace views. `_hyperstream` treats this as the default case. Any element with a `_stream` attribute mounted at any time after page load connects on its own, with no imperative call from the application. Elements removed from the DOM release their share of the connection. The application never calls "scan" or "rescan". Living next to htmx is the natural condition, not a special mode.

## 5. The spec is the contract, not the implementation

`_hyperstream` is a wire protocol with a reference client. Any server in any language that speaks the envelope is a valid `_hyperstream` server. The Node reference server is an example, not the product. Coupling to one runtime, one framework, or one language is forbidden.

## 6. Replay is the responsibility of the protocol

Reconnects happen. Networks drop. The client tracks `(url, channel) -> seq` and resumes with a cursor. The application never sees this. The user never writes "on reconnect, do X". If reconnect logic leaks into user code, the design has failed.

## 7. Channels are first-class, not a convention

One connection carries many channels. Subscriptions are declarative. Fan-out from one server message to many client elements is built in. Multiplexing is not an extension on top of point-to-point streaming, it is the default model.

## 8. One connection per origin, always multiplexed

Many elements on a page can listen to many channels, but they share transport. If two or more elements declare the same `_stream` URL, they ride a single connection and the library routes envelopes by channel to the right element. The browser's connection budget is small and finite. The library spends it once per URL, never per element. A future change that opens a connection per element, per channel, or per subscription violates this principle even if the call site looks simpler.

## 9. Atomicity is opt-in and frame-aligned

A single swap mutates one place. A multi swap mutates many places in order. An atomic swap mutates many places inside one animation frame so layout and paint see them together. The user picks the guarantee they need by picking the frame type, not by writing coordination code.

## 10. Small surface, small bundle

The client targets a tiny footprint. Every kilobyte added must justify itself against an attribute, a frame type, or a transport that an application cannot reasonably implement on its own. Features that belong in user code stay in user code.

## 11. Extensions add capability, never change semantics

`morph`, `atomic`, future transports, future swap styles ship as opt-in extensions. An extension may add a new behavior. An extension MUST NOT silently change the behavior of an existing attribute, frame type, or swap. Backwards compatibility is a property of the core, not a hope.

## 12. Versioning lives on the envelope

The wire format carries a version attribute. Breaking changes bump it. Clients and servers negotiate by reading it. There is no out-of-band capability handshake, no content negotiation header, no implicit upgrade. The frame announces what it is.

## 13. Unknown is ignored, not fatal

Unknown attributes, unknown nested elements, unknown frame types within a known channel: ignored. Forward compatibility is built in so newer servers can talk to older clients without breaking them. The only fatal envelope is a malformed one.

## 14. Backpressure and coalescing belong in the protocol, not the app

When the server outpaces the client, the system has primitives for it: coalesce by key, buffer with a bound, throttle by channel. The application declares intent. The library enforces it. Dropping frames silently or piling them up unbounded are not acceptable defaults.

## 15. The third leg of Big Sky, never a replacement

[htmx](https://htmx.org) covers request and response. [_hyperscript](https://hyperscript.org) covers client behavior. `_hyperstream` covers server push. It composes with both, depends on neither, and does not absorb their concerns. A project that pulls htmx into the runtime, or that grows a scripting language on top of envelopes, has stopped being `_hyperstream`.

## 16. Security is the server's job, and the protocol makes that honest

The wire is HTML. HTML on the wire from a hostile publisher is an XSS vector. The protocol does not pretend otherwise. The server is the trust boundary. Authentication, authorization, rate limiting, payload validation belong on the publish side. The library does not invent a sandbox that hides this fact.

This stance assumes publishers are trusted. Multi-tenant scenarios where one tenant's content reaches another tenant's browser must sanitize on the server before publishing. Pushing that work onto the client would be dishonest about where the trust boundary actually sits.

## 17. Bug or spec ambiguity, the spec is the ground

If the reference client and the spec disagree, the spec is right and the client is broken. If two implementations disagree, the spec is read again. Ambiguity in the spec is itself a bug, fixed in the document before any implementation moves.
