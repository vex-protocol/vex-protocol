---
"@vex-chat/crypto": patch
"@vex-chat/libvex": patch
"@vex-chat/spire": patch
---

Add re-entrant `enterCryptoProfileScope` / `leaveCryptoProfileScope` so overlapping FIPS `readMail` work cannot reset the process-wide profile mid-await. Yield the JS thread while bulk-decrypting SQLite message history. Harden Spire stress integration (WS budgets, CI workflow) and trim integration client count for more reliable Actions runs.
