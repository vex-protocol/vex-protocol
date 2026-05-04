---
"@vex-chat/libvex": patch
---

Fix group DM delivery and inbound mail acknowledgements. Group messages now exclude the sender's own devices from the fan-out (preventing X3DH races that caused flaky early delivery), and throw when all peer devices fail rather than silently dropping the send. Read receipts are now sent only after a message is successfully decrypted, not on first receipt.
