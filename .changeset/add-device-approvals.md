---
"@vex-chat/spire": minor
---

Adding a second device to an account now requires approval from an existing device. `POST /:id/devices` returns `202` with a `requestID` and `challenge` when the user already has enrolled devices; the first device enrolled on a fresh account is still created immediately. New endpoints — `GET /:id/devices/requests`, `GET /:id/devices/requests/:requestID`, `POST /:id/devices/requests/:requestID/approve`, and `POST /:id/devices/requests/:requestID/reject` — let existing devices list, approve, or reject pending enrollment requests. Enrollment requests expire after 10 minutes; resolved requests are pruned after 30 minutes.
