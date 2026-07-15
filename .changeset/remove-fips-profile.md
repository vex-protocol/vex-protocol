---
"@vex-chat/crypto": major
"@vex-chat/libvex": major
"@vex-chat/spire": major
---

Remove the incomplete FIPS crypto profile and its P-256/AES-GCM wire paths. Vex now exposes a single TweetNaCl-based Ed25519, X25519, and XSalsa20-Poly1305 protocol mode.
