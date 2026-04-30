---
"@vex-chat/libvex": patch
---

Session recovery after a failed subsequent-mail decrypt no longer puts a `RETRY_REQUEST:<mailID>` string in the healing initial message; the initial mail still re-establishes the session with empty plaintext.
