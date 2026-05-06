---
"@vex-chat/crypto": patch
"@vex-chat/libvex": patch
"@vex-chat/types": patch
---

Tighten local ratchet/X3DH secret persistence by HKDF-deriving TweetNaCl at-rest keys, reading legacy at-rest stores during migration, sealing persisted skipped message keys, and retiring the persisted X3DH shared secret column on new SQLite session writes.
