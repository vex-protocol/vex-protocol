---
"@vex-chat/crypto": patch
---

Remove runtime `Buffer` usage in browser/React Native code paths so crypto helpers no longer rely on Node globals.
