---
"@vex-chat/libvex": patch
"@vex-chat/spire": patch
---

Keep direct-message delivery successful when best-effort forwarding to the sender's other devices hits a bad self-device key bundle, force those self-device copies through a fresh session, and let connected clients repair stale signed prekeys without blocking registration.
