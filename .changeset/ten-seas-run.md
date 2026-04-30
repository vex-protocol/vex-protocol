---
"@vex-chat/libvex": major
"@vex-chat/types": major
"@vex-chat/spire": patch
---

Add Signal-style Double Ratchet support for post-X3DH direct messages.

`@vex-chat/libvex` now uses per-message ratchet keys and persists ratchet state
(root key, chain keys, DH ratchet state, counters, skipped keys). `@vex-chat/types`
adds ratchet header/session fields required by this strict protocol break.

`@vex-chat/spire` continues to store and forward `mail.extra` as opaque client
metadata to support ratchet and future protocol extensions.
