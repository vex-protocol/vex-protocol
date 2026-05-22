---
"@vex-chat/spire": major
"@vex-chat/types": major
---

Require passkey verification as a second factor for full account sessions once an account has enrolled passkeys. Accounts with no passkeys may still obtain a short account session by password or device key so they can enroll their first passkey, but device connect remains blocked until that first passkey exists. New registrations now receive a device-aware response, and the OpenAPI spec reflects the stricter auth contract.
