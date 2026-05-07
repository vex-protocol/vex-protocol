---
"@vex-chat/libvex": patch
---

Fixes message sends on a closed or closing WebSocket: the client now automatically reconnects with exponential back-off (capped at 30 s) when a send is attempted on a broken connection, so consumers no longer need to call `reconnectWebsocket()` manually after a drop. Concurrent reconnect calls are also deduplicated — only one reconnect runs at a time.
