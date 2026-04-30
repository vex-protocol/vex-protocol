---
"@vex-chat/libvex": patch
---

Session-heal retry signals now emit through a dedicated `retryRequest` client event instead of the chat `message` stream. This prevents decrypt-failure recovery paths from surfacing as empty chat messages in client UIs.
