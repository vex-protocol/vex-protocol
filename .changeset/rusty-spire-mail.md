---
"@vex-chat/spire": major
"@vex-chat/libvex": patch
---

Port Spire's default runtime to Rust for the Spire REST/WebSocket surface, including tweetnacl/Ed25519, FIPS/P-256 request verification, passkey WebAuthn routes, device recovery, files, avatars, emoji, docs, and notification subscription endpoints.

Docker Compose nginx now serves passkey platform association files from the configured `SPIRE_PASSKEY_*` environment.

Also make libvex mail handling more deterministic under Rust-backed realtime delivery by coalescing concurrent inbox syncs, accepting direct mail notify payloads, serializing direct mail decrypts, and avoiding fragile self-delivery races.
