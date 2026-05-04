---
"@vex-chat/libvex": patch
---

Stop leaking `INVALID_STATE_ERR` from teardown races as unhandled
promise rejections. The transport adapter now gates `send()` on
`readyState`, throws a typed `WebSocketNotOpenError` when the socket
isn't OPEN, and translates the platform's opaque
`DOMException("INVALID_STATE_ERR")` into the same typed error when
native state transitions inside the synchronous send call. All
fire-and-forget callsites (`ping`, `pong`, auth challenge
`response`, mail receipts) now `.catch()` that typed error and drop
the frame; request/response callsites (mail handshake,
`sendMessage`) forward it to the outer promise so callers don't
hang for the 30s send-loop timeout.

Fixes the "entire app freezes during passkey registration / app
foregrounding / network swap" UX where the OS pauses the radio,
React Native's bridge dispatches a queued `websocketMessage` and
`websocketClosed` back-to-back, our `ping`/`pong` runs against the
already-CLOSING socket, and the resulting unhandled rejection
red-screens the dev build (and shows up as a noisy `console.error`
in production). The socket itself is unaffected — the recovery
loop in the consumer (vex-ui store) continues to handle the
disconnect; we just stop logging the inevitable race as a fatal
error.
