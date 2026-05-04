---
"@vex-chat/spire": patch
"@vex-chat/libvex": patch
---

Pending device-approval responses now include the existing user's `userID`. Spire returns it from `createPendingDeviceEnrollmentRequest`, the `RegisterPendingApprovalCodec` accepts it (optional for back-compat with older servers), and `DeviceApprovalRequiredError` / `PendingDeviceRegistration` expose it as `userID`. This lets a new, still-unauthenticated device fetch the public avatar via `/avatar/:userID` and surface an "is this you?" confirmation before continuing the approval dance. Purely additive; older servers/clients that omit the field continue to work.
