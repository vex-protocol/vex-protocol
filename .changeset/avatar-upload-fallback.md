---
"@vex-chat/libvex": patch
---

Fix avatar upload in React Native/Hermes and other runtimes where `new Blob([Uint8Array])` throws. The SDK now detects the failure and falls back to the JSON/base64 avatar endpoint automatically — no changes required on your end.
