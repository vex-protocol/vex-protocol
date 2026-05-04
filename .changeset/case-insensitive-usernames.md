---
"@vex-chat/spire": patch
"@vex-chat/libvex": patch
---

Usernames are now case-insensitive: registration and login fold the provided username to lowercase, so `User` and `user` resolve to the same account. `client.randomUsername()` returns lowercase words to match the canonical form. No migration required — existing mixed-case rows remain accessible under any-case input.
