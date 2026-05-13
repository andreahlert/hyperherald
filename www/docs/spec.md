# _hyperstream wire spec, v0 (DRAFT)

This document is the source of truth for the `_hyperstream` protocol. Client and server implementations MUST follow it. While the project is `0.x`, breaking changes are allowed and will be accompanied by a bump in the envelope `v` attribute.

## Philosophy

`_hyperstream` is hypermedia all the way down. The wire format is HTML, not JSON. Each frame is a self-describing custom element. Servers write HTML to a stream; clients parse HTML and apply swaps. There is no client-side template engine, no signal graph, no JSON envelope, and no out-of-band metadata layer between hypermedia and routing.

## Transport

`_hyperstream` v0 supports two transports. Servers SHOULD support at least one; SSE is the simpler path.

- **SSE**, `Content-Type: text/event-stream`, GET request to the URL declared in `_stream`. The browser's `EventSource` is NOT used; the client uses `fetch` plus `ReadableStream` to support custom headers and POST bodies in future versions. Each SSE event's `data:` field carries one HTML envelope.
- **WebSocket**, opened to the URL declared in `_stream`, with a query parameter `?channels=topic-a,topic-b` and an optional repeated `?cursor=<channel>:<seq>` for replay on reconnect. Each text frame carries one HTML envelope.

## Envelope

Every frame is an HTML element whose tag name encodes the frame type. Required attributes on the root:

| attribute | type | meaning |
|---|---|---|
| `v` | integer | Spec version. Always `0` for v0. |
| `seq` | integer | Monotonic sequence number per channel. Used for replay on reconnect. |
| `channel` | string | Logical channel name. Server uses this to route. |
| `ts` | integer | Server timestamp in ms since epoch. |

Unknown attributes and unknown nested elements MUST be ignored by the client.

The inner HTML of an envelope is the payload. Servers MUST escape any literal `</hs-fragment>`, `</hs-multi>`, `</hs-atomic>`, `</hs-partial>` substrings inside the payload (e.g. by writing `<\/hs-fragment>`); otherwise the parser will terminate the envelope early.

## Frame types (v0)

### `<hs-fragment>`, single swap

```html
<hs-fragment v="0" channel="orders/123" seq="7" ts="1730000000"
             target="[data-order='123']" swap="outer">
  <div data-order="123">...</div>
</hs-fragment>
```

| attribute | required | meaning |
|---|---|---|
| `target` | yes | CSS selector resolved within the document, OR `this` for the element that opened the stream, OR `closest <css>` / `find <css>` scoped variants. |
| `swap` | yes | One of `inner`, `outer`, `before`, `after`, `append`, `prepend`, `delete`, `replace`. (`morph` opt-in via the `morph` extension.) |

The element's inner HTML is the payload to apply. Required unless `swap="delete"`.

### `<hs-multi>`, array of fragments, applied sequentially, NOT atomic

```html
<hs-multi v="0" channel="orders/123" seq="8" ts="1730000001">
  <hs-fragment target="#count" swap="inner">5</hs-fragment>
  <hs-fragment target="#last-order" swap="outer"><li>...</li></hs-fragment>
</hs-multi>
```

Children are `<hs-fragment>` elements with `target` and `swap` attributes only (no `v`/`seq`/`channel`/`ts`, those are inherited from the wrapper). Each child is applied in order. If any fragment errors, the rest still apply. For atomic semantics use `<hs-atomic>`.

### `<hs-atomic>`, array of fragments, applied as one DOM mutation

```html
<hs-atomic v="0" channel="orders/123" seq="9" ts="1730000002">
  <hs-fragment target="#price" swap="inner"><strong>$120</strong></hs-fragment>
  <hs-fragment target="#leader" swap="inner"><em>alice</em></hs-fragment>
</hs-atomic>
```

Same child shape as `<hs-multi>`, but the client buffers all fragments and applies them inside a single `requestAnimationFrame`, so layout and paint see them together.

### `<hs-partial>`, streaming partial content

```html
<hs-partial v="0" channel="llm/abc" seq="10" ts="1730000003"
            target="#answer" suspense-id="answer-1" final="false">
  Hello,
</hs-partial>
```

| attribute | meaning |
|---|---|
| `target` | selector for the suspense slot |
| `suspense-id` | opaque ID grouping chunks of one logical stream |
| `final` | when `"true"`, the suspense slot is sealed |

Inner HTML is the chunk text or HTML appended to the slot.

### `<hs-subscribe-ack>`, server confirms subscriptions

```html
<hs-subscribe-ack v="0" channel="_meta" seq="0" ts="1730000000"
                  channels="orders/123 user/me"></hs-subscribe-ack>
```

Sent once per (re)connect after the server has registered the client's channel list. The `channels` attribute is a space-separated list.

### `<hs-close>`, graceful close

```html
<hs-close v="0" channel="_meta" seq="99" ts="1730000004"
          code="1000" reason="session ended"></hs-close>
```

- `code`, close code. `1000` means the client SHOULD NOT auto-reconnect. Other codes are transient: client SHOULD reconnect with backoff.
- `reason`, human readable.

### `<hs-subscribe>`, client subscribe (WebSocket only)

Client to server, used over a single open WebSocket to add or change subscriptions:

```html
<hs-subscribe v="0" channels="orders/123 user/me"
              cursors="orders/123:42 user/me:0" ts="1730000005"></hs-subscribe>
```

- `channels`, space-separated list. Replaces the current subscription set.
- `cursors`, optional, space-separated `<channel>:<seq>` tokens. Server SHOULD replay everything strictly greater than the cursor for that channel.

For SSE, channel selection is via URL query (`?channels=`); subscription is fixed for the lifetime of the SSE response. Use `Last-Event-ID` for resume.

## Client attributes

Authored on HTML elements:

| attribute | meaning | example |
|---|---|---|
| `_stream` | URL to open. Multiple elements with the same URL share one connection. | `_stream="/events"` |
| `_stream-subscribe` | space-separated channel list to subscribe to | `_stream-subscribe="orders/123 user/me"` |
| `_stream-coalesce` | drop intermediate frames within a window | `_stream-coalesce="window:200ms strategy:last"` |
| `_stream-buffer` | bound the per-element queue | `_stream-buffer="max:50 drop:oldest"` |
| `_stream-suspense` | declare a suspense slot ID for `hs-partial` chunks | `_stream-suspense="answer-1"` |
| `_stream-debug` | verbose logging on the client | `_stream-debug="true"` |
| `_stream-transport` | force a transport | `_stream-transport="sse"` |

## Reconnect and replay

On reconnect the client sends, for each subscribed channel, the last `seq` it received. SSE uses the standard `Last-Event-ID` header where the ID is `<channel>:<seq>`. WebSocket uses a `<hs-subscribe>` envelope with the `cursors` attribute. Servers SHOULD honor the cursor and replay frames `cursor + 1 .. now` from a per-channel buffer. If the cursor is older than the buffer's retention window, the server sends `<hs-close code="4001" reason="gone">` and the client signals a `hyperstream:gone` event so the application can recover (e.g. force a refresh).

## Versioning

While the spec is `v="0"`, breaking changes can land between minor versions. Implementations MUST inspect the `v` attribute on every envelope and reject mismatched versions with a console warning.
