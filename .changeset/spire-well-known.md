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

The native Android `clientDataJSON.origin`
(`android:apk-key-hash:<base64url>`) is now derived from the same
`SPIRE_PASSKEY_ANDROID_FINGERPRINTS` and merged into the WebAuthn
`expectedOrigin` allowlist automatically, so operators don't have
to compute base64url of a SHA-256 cert by hand. Without this entry
simplewebauthn rejects every native-Android assertion at the origin
check, which surfaces in the mobile UI as a generic "RP failed"
error.
