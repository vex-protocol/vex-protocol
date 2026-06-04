---
"@vex-chat/types": minor
"@vex-chat/libvex": minor
"@vex-chat/spire": minor
---

Adds one-to-one voice call signaling across the stack. `@vex-chat/types` exports new call schemas (`CallSession`, `CallEvent`, `IceServerConfig`, and related types/validators); `@vex-chat/libvex` exposes a `Calls` API on the `Client` for initiating and managing calls; `@vex-chat/spire` gains a `CallManager` and TURN credential support to broker WebRTC signaling between peers.
