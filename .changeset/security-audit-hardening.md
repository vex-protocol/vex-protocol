---
"@vex-chat/crypto": major
"@vex-chat/libvex": major
"@vex-chat/spire": major
"@vex-chat/types": patch
"@vex-chat/cli": minor
---

Harden authentication, key handling, and server authorization for the greenfield protocol. Passwords use Argon2id server-side with a modern length and blocklist policy, current-password changes and fresh-passkey resets have explicit proof requirements, bearer sessions are scope-bound and shorter lived, passkeys require user verification, device clusters are bounded and revalidated, and legacy credential and wire fallbacks are removed. The CLI now requests explicit password-backed enrollment for new devices and redacts unexpected command failures.

Domain-separate X3DH prekey signatures, derive independent message encryption and authentication subkeys, use fresh local-storage nonces with purpose-separated at-rest keys, validate encrypted key envelopes before PBKDF2, run async key wrapping through native Web Crypto where available, redact credentials from HTTP errors, and update vulnerable production dependencies.
