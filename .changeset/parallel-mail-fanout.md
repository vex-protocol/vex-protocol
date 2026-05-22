---
"@vex-chat/libvex": patch
---

Reduce client-side send latency for large recipient fanout by sending mail to devices with bounded concurrency while preserving per-device encryption and recovery behavior.
