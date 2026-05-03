---
"@vex-chat/libvex": patch
---

Fix the WebSocket keep-alive detector so half-open sockets actually trigger a reconnect. `Client.ping()` already detected a missing pong (the `if (!this.isAlive)` branch), but the body was empty, so when a network path silently dropped the flow without a TCP FIN reaching the client (typical on Android emulators, sleeping mobile radios, and aggressive carrier-grade NAT) the SDK kept firing pings into a dead socket forever and never emitted the `disconnect` event consumers listen for. The branch now closes the socket so the existing `close` handler clears the ping interval and emits `disconnect`, restoring the recovery path. Also resets `isAlive` to `true` on every socket `open` so a reconnect doesn't inherit `false` from the previous session and tear itself down on the next ping cycle.
