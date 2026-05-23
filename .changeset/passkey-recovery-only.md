---
"@vex-chat/libvex": major
"@vex-chat/spire": major
---

Passkey-authenticated device enrollment is now recovery-only. Use
`client.passkeys.recoverDeviceRequest(requestID)` and Spire's
`POST /user/:id/passkey/recover/devices/requests/:requestID` endpoint to
provision a new device from a passkey; the old passkey approval endpoint and
`client.passkeys.approveDeviceRequest()` API have been removed so recovery
always revokes previously trusted devices server-side.
