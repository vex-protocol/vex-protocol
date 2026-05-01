---
"@vex-chat/libvex": patch
---

Harden the Double Ratchet skipped-key handling by enforcing bounded skip windows and capped skipped-key storage.
Also sanitize persisted skipped-key parsing so malformed or non-hex entries are discarded during session hydration.
