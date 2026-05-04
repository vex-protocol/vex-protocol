---
"@vex-chat/libvex": patch
---

fix(libvex): silence WebSocket teardown races in OPEN handler and message dispatcher

The 6.2.1 fix wrapped fire-and-forget `Client.send` callsites with
`ignoreSocketTeardown`, but two paths still let `WebSocketNotOpenError`
escape and surface as a red-screen error in React Native dev builds:

- The `socket.on("open", ...)` listener calls `this.socket.send(authMsg)`
  _synchronously_. When a flaky network or 502-prone proxy cycles a
  connection rapidly, the queued OPEN event can dispatch after the
  socket has already started its next CONNECTING phase (or transitioned
  to CLOSING). The throw escapes the listener and React's
  `reactConsoleErrorHandler` reports it.
- The `socket.on("message", ...)` listener used `void this.respond(msg)`,
  `void this.handleNotify(msg)`, and `void this.postAuth()` — discarding
  the returned promise. Any rejection (including the typed teardown
  error) became an unhandled rejection.

This patch:

1. Wraps the auth send in the OPEN handler with a try/catch that
   swallows `WebSocketNotOpenError` and lets the close handler drive
   recovery. Other errors still propagate.
2. Replaces `void this.respond(msg)` / `void this.handleNotify(msg)` /
   `void this.postAuth()` with `.catch(ignoreSocketTeardown)` so the
   typed error is dropped silently and any other failure re-throws as
   before.

No behavior change for healthy connections; only suppresses noise on
mid-connection teardowns.
