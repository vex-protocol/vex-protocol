---
"@vex-chat/spire": major
"@vex-chat/libvex": major
"@vex-chat/cli": minor
"@vex-chat/types": patch
---

New account registration requires an explicit password again; passkeys are optional credentials that can be enrolled after signup. Call `client.register(username, password)` for new accounts, and use `vex auth register <username> <password>` or `--password` in the CLI. Spire no longer blocks device connect while an account has no passkeys, but existing accounts can still request device approval without supplying a password.
