---
"@vex-chat/libvex": patch
---

Fix RTC call signal signature verification by normalizing the call envelope body to its wire-format representation before signing, so the signed bytes match what is actually transmitted.
