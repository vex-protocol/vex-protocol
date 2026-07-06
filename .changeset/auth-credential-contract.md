---
"@vex-chat/spire": patch
"@vex-chat/types": patch
---

Fixes the auth credential contract: spire no longer enforces passkey second-factor verification for accounts that have passkeys enrolled, and no longer blocks deletion of the last passkey on an account. The `RegistrationPayload.password` description and OpenAPI spec are updated to accurately reflect when a password is required for device approval requests.
