---
"@vex-chat/spire": major
"@vex-chat/libvex": major
"@vex-chat/cli": minor
"@vex-chat/types": patch
---

New account registration requires an explicit password again; passkeys are optional credentials that can be enrolled after signup. Call `client.register(username, password)` for new accounts, and use `vex auth register <username> <password>` or `--password` in the CLI. New-device requests use the explicit `requestDeviceEnrollment(username, password)` API, or `requestDeviceEnrollmentWithPasskey(username)` after a fresh passkey ceremony, so a mistyped sign-in can never create an account. Account owners can replace a password with `client.me.changePassword(currentPassword, newPassword)`, while a fresh passkey recovery session can call `client.passkeys.resetPassword(newPassword)`.
