---
"@vex-chat/libvex": patch
---

Fix register/login compatibility across legacy and key-cluster Spire responses, including storing auth token/device from modern `/register` and falling back to legacy register+login when needed.
