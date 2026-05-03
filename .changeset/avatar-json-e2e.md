---
"@vex-chat/libvex": patch
---

Add an end-to-end harness test for `client.me.setAvatar(...)` that exercises the JSON/base64 upload path. Verifies the avatar upload keeps working in React Native/Hermes-style runtimes where `FormData` is unavailable, and guards against regressions on platforms that can't construct a `Blob` from an `ArrayBufferView`.
