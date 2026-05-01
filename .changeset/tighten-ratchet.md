---
"@vex-chat/libvex": patch
---

The Double Ratchet implementation now enforces a maximum skip window of 1,024 messages and caps stored skipped keys at 4,096 entries; attempts to advance the ratchet beyond these bounds throw an error instead of accumulating unbounded state. Skipped-key parsing is also stricter, rejecting entries with malformed hex or key-ID format.
