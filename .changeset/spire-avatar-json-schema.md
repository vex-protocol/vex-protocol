---
"@vex-chat/spire": patch
---

Fix `POST /avatar/:userID/json` rejecting every JSON-fallback avatar upload with `400 Invalid file payload`. The route was reusing `FilePayloadSchema` (the schema for encrypted user-file uploads, which requires `nonce`/`owner`/`signed`) to validate avatar bodies. The libvex client only sends `{ file: <base64> }` for avatars, so Zod always rejected the body. Replaced it with an avatar-specific `{ file: string.min(1) }` schema, matching the actual contract used by libvex's `client.me.setAvatar(...)` JSON path on runtimes without `FormData`/`Blob(Uint8Array)` (React Native/Hermes).
