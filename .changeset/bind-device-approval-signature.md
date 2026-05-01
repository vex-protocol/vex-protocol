---
"@vex-chat/libvex": patch
"@vex-chat/spire": patch
---

Harden multi-device enrollment by binding approval signatures to both the pending request ID and requesting device signKey, and improve `/register` duplicate-constraint detection so existing-account enrollments return pending approval instead of an internal server error.
