---
"@vex-chat/spire": minor
---

Auto-derive the native-Android WebAuthn origin
(`android:apk-key-hash:<base64url>`) from the
`SPIRE_PASSKEY_ANDROID_FINGERPRINTS` env var that already populates
`/.well-known/assetlinks.json`. The derived entries are merged into
the `expectedOrigin` allowlist on every passkey verify.

Fixes a sharp edge that bites every operator on first run: native
Android Credential Manager sets `clientDataJSON.origin` to that
exact `android:apk-key-hash:...` string instead of the RP host, and
without the matching entry in `SPIRE_PASSKEY_ORIGINS` simplewebauthn
rejects the assertion at the origin check. The mobile UI surfaces
that as a generic "RP failed" error even though the assetlinks file
is correctly served and Google has already validated the
app↔domain link. Operators only ever set the cert fingerprints; the
base64url math is handled server-side and the assetlinks file and
WebAuthn origin allowlist stay in lock-step from one source of
truth.
