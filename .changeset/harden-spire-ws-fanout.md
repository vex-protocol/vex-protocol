---
"@vex-chat/spire": patch
"@vex-chat/libvex": patch
---

Fixes FIPS-mode realtime delivery spottiness by making Spire WebSocket fanout tolerant of stale clients and making libvex drain mailbox batches in send order. Mail fetches are now serialized by a single owner, and ratchet session healing waits for repeated decrypt failures instead of resetting a live session on the first mismatch.
