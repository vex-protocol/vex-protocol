---
"@vex-chat/spire": minor
"@vex-chat/libvex": minor
"@vex-chat/types": minor
---

Add passkey (WebAuthn) support for account-recovery and device
management. A passkey can authenticate a user without any device
key on hand and grants the same admin permissions as a device:
list/delete devices and approve/reject pending device-enrollment
requests. Passkeys cannot send or receive messages — they're
strictly second-class admin credentials.

Operators must set `SPIRE_PASSKEY_RP_ID` and `SPIRE_PASSKEY_ORIGINS`
to enable the new endpoints. Clients drive the ceremony with
`@simplewebauthn/browser` (web) or `react-native-passkey` (mobile).
