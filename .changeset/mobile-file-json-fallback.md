---
"@vex-chat/libvex": patch
"@vex-chat/spire": patch
"@vex-chat/types": patch
---

Keep encrypted file uploads working on React Native by probing multipart Blob support before choosing the upload path, and allow Spire's JSON file-upload fallback to omit the legacy signed field that libvex no longer sends.
