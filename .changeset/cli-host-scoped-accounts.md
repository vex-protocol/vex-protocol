---
"@vex-chat/cli": patch
---

Accounts are now stored and resolved by `username@host` key, so credentials for one server are never reused when connecting to a different host. Existing accounts are migrated automatically on first use.
