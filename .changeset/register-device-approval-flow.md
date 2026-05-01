---
"@vex-chat/libvex": patch
"@vex-chat/spire": patch
---

Treat duplicate-username `/register` attempts as pending device-approval requests so second devices can be confirmed from an existing session, and add SDK decoding support for the pending approval register response.
