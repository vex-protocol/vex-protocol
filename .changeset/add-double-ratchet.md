---
"@vex-chat/types": minor
"@vex-chat/libvex": minor
"@vex-chat/spire": minor
---

Messaging sessions now use a Double Ratchet algorithm for per-message forward secrecy. `@vex-chat/types` exports `RatchetHeader` and `RatchetHeaderSchema` for the new subsequent-mail header format; `@vex-chat/libvex`'s `SessionCrypto` gains ratchet state fields (`RK`, `CKs`, `CKr`, `DHsPublic`, `DHsPrivate`, `DHr`, `Ns`, `Nr`, `PN`, `skippedKeys`, `verified`).
