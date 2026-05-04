---
"@vex-chat/spire": minor
---

Optionally serve the WebAuthn well-known association files
(`/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`)
directly from spire so operators whose RP host already routes to the
container can publish app↔domain associations without standing up a
separate static site. Gated on three env vars
(`SPIRE_PASSKEY_IOS_APP_IDS`, `SPIRE_PASSKEY_ANDROID_PACKAGE`,
`SPIRE_PASSKEY_ANDROID_FINGERPRINTS`); 404 when unset and mounted
ahead of the per-IP rate limiter so periodic platform fetches are
never 429'd.
