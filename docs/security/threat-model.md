# Vex protocol threat model

Last code audit: 2026-07-14. This is a living description of the current
`development` protocol rather than a compatibility promise for older clients.

This document describes what the protocol and server actually do in the current
codebase. It is intentionally conservative: when the code does not enforce a
property, this document treats that property as absent even if the architecture
could support it later.

## Scope

In scope:

- `packages/crypto`: crypto providers, key conversion, KDFs, signing, symmetric
  encryption and utility encodings.
- `packages/libvex`: client protocol flow, X3DH setup, Double Ratchet,
  local SQLite storage, message/file encryption, device enrollment client flows,
  and out-of-band session verification helpers.
- `packages/types`: wire schemas for devices, prekeys, sessions, mail, files,
  and websocket messages.
- `apps/spire`: account/device registry, key bundle publication, one-time prekey
  dispensing, mail storage/retrieval/deletion, websocket transport, HTTP
  transport, auth, passkey recovery, file storage, and rate limiting.

Out of scope:

- UI behavior in `vex-ui` or other clients built on top of `libvex`.
- Host OS keychain behavior, mobile secure enclave behavior, browser sandbox
  behavior, and notification-service behavior.
- Deployment hardening outside the app process, including TLS termination,
  reverse proxy configuration, container runtime confinement, disk encryption,
  backups, log shipping, and host compromise response.
- Formal cryptographic proof. This is a code-level threat model, not a proof of
  Signal Protocol equivalence.

## Assets

Primary assets:

- Message plaintext and file plaintext.
- File encryption keys returned by `client.files.create`.
- Device signing private keys.
- Device ECDH identity private keys.
- Signed prekey private keys and one-time prekey private keys.
- X3DH shared secrets before they are retired.
- Double Ratchet state: `RK`, `CKs`, `CKr`, `DHsPrivate`, counters, peer DH
  public keys, and skipped message keys.
- Session fingerprints and verification state.
- Spire JWT secret.
- Spire account credentials: Argon2id password hashes, passkey credential public
  keys, and device records.

Metadata assets:

- User IDs, usernames, device IDs, device ownership, device names, device public
  signing keys, last login, last seen, server/channel/group membership, mail
  sender, mail recipient, author, reader, group ID, mail type, nonce, timestamp,
  ciphertext length, file ID, file owner, file nonce, file size, avatar and emoji
  metadata, IP-level connection metadata, and websocket timing.

## Trust boundaries

### Client runtime

The client runtime is trusted with plaintext, private keys, session state, file
keys, and decrypted history. `libvex` exposes events such as `message` and
`session` to the host application, so the embedding app is inside the trusted
computing base.

The built-in SQLite storage encrypts message bodies and private session/prekey
fields at rest, but it does not protect against a compromised process that can
read the live identity key or call client APIs.

### Spire

Spire is not trusted with message or file plaintext when the normal client APIs
are used, but it is currently trusted for directory and policy decisions:

- It maps users to devices.
- It decides which devices are returned for a user.
- It decides which users are returned for a channel.
- It stores and dispenses key bundles.
- It consumes one-time prekeys.
- It stores pending mail ciphertext.
- It routes notifications.
- It enforces account auth, device enrollment, passkey recovery, server/channel
  permissions, and rate limits.

This means Vex currently provides content confidentiality against an
honest-but-curious Spire that follows the device directory honestly. A malicious
or fully compromised Spire can perform device substitution unless users verify
session fingerprints out of band and the host app treats unverified sessions as
unsafe.

### Network

The network is untrusted. `libvex` defaults to `https://` and `wss://`; it only
allows `unsafeHttp` when `NODE_ENV` is `development` or `test`. Spire itself
does not terminate TLS or force HTTPS. TLS, certificate validation, and proxy
hardening are deployment requirements.

### Peer devices

Peer devices are trusted only after their session fingerprint is verified out of
band. Before that, the client verifies that a prekey bundle is signed by the
device signing key returned by Spire, but it does not independently prove that
Spire returned the intended device for a user.

## Cryptographic primitives

Vex uses TweetNaCl primitives:

- X25519-style DH through `nacl.box.before`.
- XSalsa20-Poly1305 through `nacl.secretbox`.
- Ed25519 signed-message format through `nacl.sign`.
- Random bytes from `nacl.randomBytes`.
- HKDF-SHA512 for `xKDF`.
- HMAC-SHA256 over msgpack-encoded objects for `xHMAC`.

## Registration and device enrollment

Registration creates or uses an Ed25519 device signing key. The X25519 identity
key is derived from it through `ed2curve`.

The client registers a device payload containing:

- `deviceID`
- `deviceName`
- `signKey`
- signed prekey public bytes
- signed prekey index
- prekey signature
- registration token signed by the device signing key

Spire verifies:

- the registration token signature,
- the registration token scope,
- the device payload schema,
- the signed prekey signature,
- the prekey index shape, and
- the username rules.

Creating a new account requires a password. Spire stores an Argon2id encoded
hash using 64 MiB of memory, three iterations, and one lane. Authentication also
runs a dummy Argon2id verification for unknown usernames to reduce account
enumeration through response timing, and account/IP rate limits bound attempts.
New passwords must be 15 to 1024 characters, are checked against common and
account-derived values, and do not have character-class composition rules or
periodic rotation requirements. Password changes require both an authenticated,
currently registered device and the current password. Reusing the current
password is rejected.

Passkeys are optional supplementary authenticators. A fresh, user-verified
passkey ceremony can reset the password without the old password, but its
five-minute bearer is scoped to passkey administration and recovery, and the
credential is rechecked against the target account on every passkey-scoped
request. There is no bearer-only, email, phone, security-question, or legacy
password recovery path. An account that loses every approved device and every
passkey cannot be recovered by Spire.

The registration payload carries an explicit `create-account` or
`enroll-device` intent: account creation fails when the username already exists,
while enrollment fails when it does not. A mistyped sign-in identifier therefore
cannot silently create a different account.

For accounts that already have devices, new device enrollment becomes a pending
request only after the password has been verified, or after a fresh
passkey-scoped session has identified the account. It can then be approved by an
existing device signing a challenge based on `requestID` and the enrolling
device signing key. A passkey can instead recover the pending request. Pending
requests are in memory, expire after 10 minutes, and resolved requests are
retained in memory briefly for polling.

Current caveats:

- Device approval is a provisioning control, not a cryptographic transparency
  log. A malicious Spire can still lie about the device list it returns unless
  clients verify session fingerprints out of band.
- Device deletion removes prekeys and one-time keys, marks the device deleted,
  and HTTP device-token middleware re-checks the current non-deleted device row
  before hydrating `req.device`. A deleted device's old JWT no longer authorizes
  device-token HTTP paths.
- Passkey middleware re-checks that the credential still exists and belongs to
  the bearer account. Removing a passkey immediately invalidates its outstanding
  passkey-scoped JWTs.
- `POST /goodbye` is a local-session boundary; stateless bearer tokens are not
  added to a server-side revocation list.
- Changing or resetting a password does not revoke already issued device JWTs
  or remove approved devices. Device removal immediately blocks that device on
  routes that revalidate device state; other JWT revocation remains expiry-based.

## Prekeys and key bundles

Clients keep one local signed prekey and try to keep at least
`MIN_OTK_SUPPLY = 100` one-time prekeys available on Spire. Local prekey private
keys are sealed in SQLite storage. Spire stores only public prekeys and their
signatures.

When a sender requests `/device/:id/keyBundle`, Spire:

- looks up the recipient device,
- atomically selects and deletes the lowest-index one-time prekey if one is
  available,
- returns the device signed prekey,
- returns the consumed one-time prekey when available, and
- returns the device identity public key.

The client verifies the returned bundle:

- `keyBundle.signKey` must match the device signing key.
- signed prekey and one-time prekey signatures must open under the device
  signing key.
- each key entry must belong to the requested device ID.

Registration, OTK submission, and key-bundle verification require the
domain-separated V2 prekey payload:

- protocol string `vex:x3dh:prekey:v2`
- the literal `tweetnacl` protocol domain
- key type
- public key

## X3DH initial message flow

For initial mail, the sender retrieves the recipient device key bundle and
computes:

- `DH1 = DH(IK_A, SPK_B)`
- `DH2 = DH(EK_A, IK_B)`
- `DH3 = DH(EK_A, SPK_B)`
- `DH4 = DH(EK_A, OPK_B)` when a one-time prekey was available

The initial shared secret is:

- `SK = xKDF(DH1 || DH2 || DH3 || DH4)` when an OTK was present
- `SK = xKDF(DH1 || DH2 || DH3)` when no OTK was present

Independent payload-encryption and envelope-authentication keys are derived from
`SK` with HMAC-SHA256 labels. The initial plaintext is encrypted with the
encryption subkey, while the websocket/header field authenticates the mail and
its protocol metadata with the authentication subkey. The sender then rotates
its X3DH ephemeral key with `newEphemeralKeys()` and initializes a Double
Ratchet session from `SK`.

The initial `extra` field contains:

- sender signing/identity public material,
- sender ephemeral public key,
- a public key derived from `SK`,
- associated identity data, and
- the one-time prekey index, or zero when no OTK was used.

The initial `extra` uses a fixed layout.

The recipient:

- parses `extra`,
- looks up and uses the matching local OTK private key when the index is
  non-zero,
- recomputes the same DH values and `SK`,
- verifies the header HMAC,
- decrypts the ciphertext,
- deletes the local one-time prekey after successful decrypt,
- creates a receiver ratchet session,
- saves the session, and
- sends a best-effort receipt.

Current caveats:

- When no one-time prekey is available, X3DH falls back to the signed prekey
  path. That is necessary for asynchronous delivery, but it has weaker
  one-time-key freshness than the OTK path.
- There is no persisted replay ledger for initial mail. In-memory
  `seenMailIDs` and local duplicate-nonce handling reduce normal duplicates, and
  the ratchet handles most subsequent replays by key evolution, but initial
  replay behavior is not specified as a durable security property.

## Double Ratchet

The Double Ratchet is implemented in `packages/libvex/src/utils/ratchet.ts` and
used for `MailType.subsequent`.

Session initialization:

- `RK = xKDF(SK || "dr-root-v1")`
- a fresh local DH ratchet key pair is generated,
- `initialChain = xHMAC({ label: "init-chain", version: 1 }, RK)`
- initiators start with `CKs = initialChain`,
- receivers start with `CKr = initialChain`.

Sending:

- if no send chain exists, `ratchetStepSend` either bootstraps a send chain from
  the root key or creates a new DH ratchet key when a peer DH key exists,
- `takeSendMessageKey` derives `messageKey` and advances `CKs`,
- the ratchet header carries version, sender DH public key, previous-chain
  message count `PN`, and message number `N`,
- independent encryption and authentication subkeys are derived from the
  message key,
- the payload is encrypted with the encryption subkey,
- the mail envelope is HMACed with the authentication subkey,
- the advanced ratchet state is saved.

Receiving:

- the header is decoded and version/length checked,
- a changed remote DH key triggers `ratchetStepReceive`,
- skipped keys are generated for out-of-order messages,
- skipped keys are one-use and deleted from the in-memory skipped-key map when
  consumed,
- `takeReceiveMessageKey` advances `CKr` after deriving the message key,
- decrypted messages save the advanced session state.

Bounds:

- `MAX_SKIP_MESSAGE_GAP = 1024`
- `MAX_SKIPPED_KEYS = 4096`
- persisted skipped keys are parsed strictly and capped.

Current caveats:

- Message keys are not intentionally persisted except when they are skipped
  out-of-order keys. Skipped keys are persisted in sealed session storage until
  consumed or evicted.
- The implementation advances chain keys by replacing JavaScript `Uint8Array`
  references, but it does not reliably zero old chain keys or message keys.
  `XUtils.wipe` exists, but the code comments correctly state that JavaScript
  cannot guarantee memory zeroing because runtimes can copy, move, or retain
  data.
- The ratchet is pairwise. Group messages are sent as pairwise fan-out to member
  devices, not through Sender Keys, MLS, or another group ratchet.

## Mail transport and retention

Mail can enter Spire through authenticated websocket `resource` messages or
through authenticated `POST /mail`. Spire validates that:

- `mail.sender` equals the authenticated device ID,
- `mail.authorID` equals the authenticated user ID,
- `mail.recipient` exists as a device, and
- `mail.readerID` equals the recipient device owner.

Spire does not and cannot verify the end-to-end HMAC or decrypt the ciphertext.
It stores:

- `header`
- `cipher`
- `extra`
- `mailType`
- sender and recipient metadata
- group metadata
- timestamp
- nonce
- author and reader IDs

Clients retrieve mail through `/device/:id/mail`, but the route uses the
authenticated device from the device token rather than trusting the path
parameter. Retrieved rows are limited to the server retention cutoff.

After successful decryption, the client sends a websocket receipt containing the
mail nonce. Spire deletes rows where `nonce` matches and `recipient` equals the
authenticated websocket device. Receipts are best effort. If a receipt is lost,
the server may resend the same pending mail until a later receipt succeeds or
the server retention window expires.

Server-side undelivered mail retention is deployment-configurable:

- `SPIRE_MAIL_RETENTION_TTL` accepts duration strings such as `6h`, `24h`, or
  `30d`,
- `SPIRE_MAIL_RETENTION_DAYS` remains as a day-count compatibility setting,
- the default is 30 days,
- `retrieveMail` does not return rows older than the cutoff,
- `pruneExpiredMail` deletes rows older than the cutoff,
- pruning runs on database ready and then best-effort once per day.

Current caveats:

- Server mail TTL is deployment-wide, not per-group or per-conversation policy.
- Delivered means "the client decrypted and sent a receipt that Spire received."
  It does not mean the server can cryptographically prove user display or user
  acknowledgement.
- Deleting a device does not purge pending mail rows for that device. Those rows
  remain until receipt or retention expiry.
- Spire stores mail metadata in plaintext.
- There is no traffic padding, timing cover traffic, payload size
  normalization, mixnet behavior, or low-probability-of-detection transport.

## Local storage

The built-in SQLite storage stores both message history and cryptographic state
in one database.

Encrypted at rest:

- message bodies,
- prekey private keys,
- one-time prekey private keys,
- ratchet root and chain keys,
- local DH ratchet private key,
- skipped message keys.

Stored in plaintext:

- message metadata such as sender, recipient, group, mail ID, nonce, direction,
  timestamp, reader ID, and retention hint,
- device records and public keys,
- session public metadata such as device ID, user ID, peer DH public key,
  fingerprint, counters, mode, verification flag, and timestamps.

The at-rest key is derived from the local ECDH identity secret using HKDF-SHA256
with the profile-specific `vex:at-rest:3:<profile>` info string. Raw identity-key
bytes are never used directly as a storage key.

When sessions are saved, `SqliteStorage` seals `RK`, chain keys, `DHsPrivate`,
and skipped keys. The old X3DH `SK` column is intentionally retired on write:
the stored value becomes a sealed `retired:<sessionID>` sentinel, and tests
assert this behavior.

Local message retention:

- local messages are capped at 30 days,
- a client preference can reduce this cap,
- cooperative peers can include a `vex-retention:<days>` plaintext envelope,
- malicious peers can omit or forge that envelope,
- invalid or missing hints behave like 30 days.

Current caveats:

- The at-rest key is identity-key-derived. If the identity private key is
  compromised, local sealed storage is decryptable.
- SQLite file deletion, WAL behavior, filesystem remnants, backups, and OS-level
  swap are not handled by the library.
- The default storage does not split crypto state from message history.
- The host application can observe plaintext through events and APIs.

## Files

`client.files.create` encrypts file bytes client-side with a fresh file key and
nonce before upload. The file key is returned to the caller and must be shared
inside an encrypted message or another secure channel. `client.files.retrieve`
downloads the stored bytes and decrypts with the supplied key.

Spire stores uploaded file bytes under a random file ID and stores file metadata
containing file ID, owner device ID, and nonce.

Current caveats:

- Spire does not validate that uploaded file bytes are ciphertext.
- Any authenticated user can fetch a file by ID. File confidentiality relies on
  client-side encryption and secrecy of the file key, not server-side file ACLs.
- File ciphertexts do not have the same 30-day retention policy as mail.
- File metadata and file sizes are visible to Spire.

## Out-of-band verification

`libvex` exposes session verification helpers:

- sessions contain a `fingerprint`,
- `client.sessions.verify(session)` returns a mnemonic derived from
  `xKDF(fingerprint)`,
- `client.sessions.markVerified(sessionID)` marks the session verified in local
  storage.

Current security meaning:

- Verification is local state.
- Spire does not store or enforce session verification.
- The current message send/decrypt path does not require `verified === true`.
- The host app must decide how prominently to warn on unverified sessions and
  whether to block sensitive sends until verification.

This is the main mitigation against malicious-directory attacks. Without
out-of-band verification, a malicious Spire can substitute devices and cause a
sender to encrypt to the wrong device.

## Server auth and transport controls

HTTP auth:

- user JWTs are signed with `JWT_SECRET`;
- device JWTs are issued after a device signing-key challenge;
- passkey JWTs are scoped to passkey admin/recovery routes and expire after 5
  minutes;
- device auth JWTs and user JWTs expire after 1 hour.

Websocket auth:

- the first websocket message must contain a user JWT;
- Spire then sends a random challenge;
- the client signs it with a device signing key;
- Spire searches the user's current non-deleted device list for a verifying
  key;
- the websocket is authorized only after that challenge succeeds.

HTTP hardening in code:

- global per-IP rate limit;
- stricter auth rate limit;
- upload-specific rate limit before multer;
- `helmet`;
- body limits;
- msgpack parser with schema validation;
- configurable CORS allowlist.

Current caveats:

- Outside production, an unset `CORS_ORIGINS` permits only localhost, loopback,
  Tauri, and Capacitor origins. In `NODE_ENV=production`, browser CORS is
  disabled unless an explicit `CORS_ORIGINS` allowlist is configured.
- Spire accepts websocket upgrades and authenticates after connection.
- TLS is not enforced inside Spire.
- JWT revocation is expiry-based; there is no token revocation list.
- `DEV_API_KEY` and `SPIRE_DISABLE_RATE_LIMITS` are ignored by the rate limiter
  in `NODE_ENV=production`; `loadEnv` also refuses production startup when those
  dev-only bypass variables are set.

## Group messaging

Group messages are implemented as client-side fan-out:

- the client asks Spire for users in a channel,
- asks Spire for devices for those users,
- sends separate pairwise encrypted mail to each target device,
- sets the same group/channel ID in the mail metadata.

Security consequences:

- Group content is still encrypted pairwise.
- Spire sees the group ID, target devices, timing, and fan-out pattern.
- Group membership is server-authoritative.
- A malicious Spire can add an unintended device to the returned group/device
  set unless the sending client has an independent membership verification
  mechanism.
- There is no cryptographic group transcript, group ratchet, sender key, MLS
  epoch, or cryptographic membership proof.

## Threat coverage

| Threat                                                   | Current coverage                                                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Passive network observer reads message content           | Covered when TLS is used and endpoint keys are uncompromised; message payloads are end-to-end encrypted.                                                        |
| Honest-but-curious Spire reads message content           | Covered for normal messages and files created through `client.files.create`; Spire stores ciphertext and metadata.                                              |
| Malicious Spire tampers with ciphertext or mail metadata | Mostly covered by header HMAC plus AEAD, because recipients recompute the secret and reject mismatches.                                                         |
| Malicious Spire substitutes devices                      | Not fully covered. Out-of-band verification can detect this, but it is local and not enforced by protocol flow.                                                 |
| Server database capture after receipt                    | Mail content should be absent for acknowledged mail; pending mail ciphertext and plaintext metadata may remain.                                                 |
| Server database capture before receipt                   | Pending ciphertext, header, extra, and plaintext metadata are exposed. Plaintext should remain protected if endpoints and keys are safe.                        |
| Endpoint compromise                                      | Not covered. A compromised client can read plaintext and keys.                                                                                                  |
| Deleted device continues using existing tokens           | Covered for current HTTP device-token middleware and websocket auth by re-checking the current non-deleted device. Broader JWT revocation remains expiry-based. |
| One-time prekey replay by concurrent bundle requests     | Covered by atomic select-then-delete for OTK dispensing.                                                                                                        |
| OTK exhaustion                                           | Partially covered by replenishment to 100 and fallback to signed prekey. Exhaustion still weakens initial-session freshness.                                    |
| Out-of-order delivery                                    | Covered within bounded skipped-key windows.                                                                                                                     |
| Replay                                                   | Partially covered by ratchet key evolution, local duplicate handling, and receipts. No explicit durable replay ledger exists for initial mail.                  |
| Traffic analysis                                         | Not covered. Timing, sizes, parties, and group fan-out are visible to Spire and network metadata observers.                                                     |
| Transport metadata privacy                               | Not covered. There is no padding, cover traffic, batching, or transport obfuscation.                                                                            |
| JS memory extraction after key deletion                  | Not covered as a hard guarantee. The code can overwrite some arrays, but JS memory zeroing is not reliable.                                                     |

## Highest-impact hardening work

1. Make out-of-band verification operationally meaningful.

   Add identity pinning, key-change warnings, and host-app policy hooks that can
   block sends to unverified or changed sessions. Longer term, add key
   transparency or an append-only device log so Spire cannot silently substitute
   devices.

2. Finish revocation semantics beyond the MVP fix.

   Device-token HTTP paths now re-check current device state. Longer term,
   shorten device JWT TTLs if needed, add token versioning or revocation state,
   and purge pending mail for deleted devices when policy requires it.

3. Replace process-wide crypto profile state.

   Pass providers explicitly or use async-local context. The current global
   profile stack is a compatibility bridge, not an ideal isolation boundary.

4. Add a durable replay story.

   Persist a compact replay/seen ledger for initial mail, define duplicate
   behavior explicitly, and avoid mutating ratchet state before authentication
   failures can be safely discarded.

5. Add transport metadata hardening.

   Start with message size buckets and optional padding. Later work could add
   batching, store-and-forward delay, or pluggable transports.

6. Improve group cryptography.

   Current group messaging is pairwise fan-out. For larger or higher-assurance
   groups, evaluate Sender Keys, MLS, or another group-ratchet design with
   cryptographic membership epochs.

7. Make retention complete.

   Server mail TTL is configurable by deployment policy, but files have no
   matching TTL, device deletion does not purge pending mail, and there is no
   per-group policy yet.

## Current security posture summary

Vex currently has a real end-to-end encrypted messaging core:

- signed prekeys and one-time prekeys,
- X3DH-style asynchronous initial sessions,
- pairwise Double Ratchet for subsequent messages,
- server-side ciphertext-only mail storage,
- delete-on-receipt semantics when receipts arrive,
- sealed local storage for key material and message bodies,
- out-of-band verification primitives,
- client-side file encryption,
- basic Spire rate limiting and schema validation.

The largest current caveat is not the symmetric encryption or the ratchet. It
is identity and directory trust. Until verification is enforced or backed by
transparency, Spire remains able to decide which devices a sender encrypts to.
That is the main gap between "E2EE against an honest-but-curious server" and a
Signal-like adversarial-server model.

Related MVP docs:

- [Release gates](../readiness/mvp-release-gates.md)
- [Distributed edge-node boundary memo](../ops/edge-node-boundaries.md)
- [Admin and provisioning model](../ops/admin-provisioning-model.md)
