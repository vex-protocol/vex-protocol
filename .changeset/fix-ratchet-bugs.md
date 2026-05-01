---
"@vex-chat/libvex": patch
---

Fix Double Ratchet session initialization and message emission: both initiator and receiver now derive the initial chain key from the same HKDF label, the receiver's `CKr` is correctly seeded on session start, DHr is set on the first inbound ratchet step, and empty handshake payloads no longer surface as spurious entries in the `message` event stream.
