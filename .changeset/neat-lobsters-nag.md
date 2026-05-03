---
"@vex-chat/libvex": patch
---

Fallback avatar uploads to JSON/base64 when Blob(ArrayBufferView) is unsupported at runtime (notably React Native/Hermes), while preserving multipart uploads where supported.
