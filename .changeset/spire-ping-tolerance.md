---
"@vex-chat/spire": patch
---

Allow up to three missed pongs (~15s) before declaring a WebSocket
session dead. The previous heartbeat loop killed the socket after
**a single** missed pong (~5s window), which is far too aggressive
for mobile clients: any normal native modal that pauses the JS
thread for more than five seconds — Android biometric prompt
during passkey registration, file picker, share sheet, expensive
Noise/crypto cycle — would push the pong handler past the budget
and the server would tear the connection down out from under the
user.

Fixes the cascade of `ws:disconnect` →
`connection:recover:start` → `INVALID_STATE_ERR` cycles seen
during routine mobile flows. The new tolerance still detects a
genuinely dead TCP flow within a couple of pings, well inside the
upstream proxy's idle window.
