---
"@vex-chat/types": minor
"@vex-chat/libvex": minor
"@vex-chat/spire": minor
---

`username` and `password` are now optional for registration. Clients can call `client.register()` with no arguments to register via keypair alone — a username is auto-generated from the signing key if omitted. `DevicePayload.username` and `RegistrationPayload.password` are now `string | undefined` in `@vex-chat/types`; update any code that assumed these fields are always present.
