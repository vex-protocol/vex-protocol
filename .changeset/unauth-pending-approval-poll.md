---
"@vex-chat/libvex": patch
"@vex-chat/spire": patch
---

Add an unauthenticated path for a pending device-enrollment requester to learn its own approval status.

A new device that registers against an existing username gets back a 202 with `{ requestID, challenge }` but cannot authenticate until an existing signed-in device approves it. Previously the only status endpoint required a user token, so the new device had no way to learn it had been approved.

- spire: new `POST /user/devices/requests/:requestID/poll` accepts `{ signed }` (the requesting device's signature over the original challenge), opens it with the pending request's stored `signKey`, and returns the request status (and `approvedDeviceID` once approved). No token required.
- libvex: `Client.register` now throws a typed `DeviceApprovalRequiredError` (carrying `requestID`, `challenge`, and `expiresAt`) when the server returns a pending-approval response, and `Client.devices.pollPendingRegistration({ requestID, challenge })` calls the new endpoint, signing the challenge with the local secret signing key.

The new device can then loop on `pollPendingRegistration` and, once status flips to `approved`, call the existing `loginWithDeviceKey(approvedDeviceID)` to complete login.
