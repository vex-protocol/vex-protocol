---
"@vex-chat/libvex": patch
"@vex-chat/spire": patch
---

Add a batched mail delivery endpoint and have libvex coalesce concurrent mail sends through it, falling back to the existing WebSocket send path when batching is unavailable.
