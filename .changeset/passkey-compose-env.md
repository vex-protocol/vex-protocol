---
"@vex-chat/spire": patch
---

Make Spire's Docker Compose env handling robust for passkey deployments by
normalizing quoted `.env` values, validating that `SPK` matches `SPIRE_FIPS`,
and emitting compose-safe unquoted key lines from the key generators.
