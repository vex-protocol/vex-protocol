# @vex-chat/spire

## 2.0.1

### Patch Changes

- [#195](https://github.com/vex-protocol/vex-protocol/pull/195) [`cea8fe5`](https://github.com/vex-protocol/vex-protocol/commit/cea8fe50fef156dc8ea451cc604e9bba880a00c7) Thanks [@yuki111888](https://github.com/yuki111888)! - Play the default notification sound for visible iOS Expo pushes while keeping Android push payloads on their channel-managed sound behavior.

## 2.0.0

### Major Changes

- [#192](https://github.com/vex-protocol/vex-protocol/pull/192) [`a27c2f6`](https://github.com/vex-protocol/vex-protocol/commit/a27c2f6a62c2545475d6456dde8a9a81629d88f5) Thanks [@yuki111888](https://github.com/yuki111888)! - Passkey-authenticated device enrollment is now recovery-only. Use
  `client.passkeys.recoverDeviceRequest(requestID)` and Spire's
  `POST /user/:id/passkey/recover/devices/requests/:requestID` endpoint to
  provision a new device from a passkey; the old passkey approval endpoint and
  `client.passkeys.approveDeviceRequest()` API have been removed so recovery
  always revokes previously trusted devices and their push subscriptions
  server-side.

- [#189](https://github.com/vex-protocol/vex-protocol/pull/189) [`7e56876`](https://github.com/vex-protocol/vex-protocol/commit/7e568760fd56b459335f4b0df662aa2c70f22327) Thanks [@yuki111888](https://github.com/yuki111888)! - Require passkey verification as a second factor for full account sessions once an account has enrolled passkeys. Accounts with no passkeys may still obtain a short account session by password or device key so they can enroll their first passkey, but device connect remains blocked until that first passkey exists. New registrations now receive a device-aware response, and the OpenAPI spec reflects the stricter auth contract.

### Patch Changes

- [#187](https://github.com/vex-protocol/vex-protocol/pull/187) [`bdb4e87`](https://github.com/vex-protocol/vex-protocol/commit/bdb4e87e819a3c2310c056b77abfd66800ba2758) Thanks [@yuki111888](https://github.com/yuki111888)! - Add a batched mail delivery endpoint and have libvex coalesce concurrent mail sends through it, falling back to the existing WebSocket send path when batching is unavailable.

- [#189](https://github.com/vex-protocol/vex-protocol/pull/189) [`7e56876`](https://github.com/vex-protocol/vex-protocol/commit/7e568760fd56b459335f4b0df662aa2c70f22327) Thanks [@yuki111888](https://github.com/yuki111888)! - Make Spire's Docker Compose env handling robust for passkey deployments by
  normalizing quoted `.env` values, validating that `SPK` matches `SPIRE_FIPS`,
  and emitting compose-safe unquoted key lines from the key generators.
- Updated dependencies [[`7e56876`](https://github.com/vex-protocol/vex-protocol/commit/7e568760fd56b459335f4b0df662aa2c70f22327)]:
    - @vex-chat/types@4.0.0
    - @vex-chat/crypto@7.0.0

## 1.11.5

### Patch Changes

- [#174](https://github.com/vex-protocol/vex-protocol/pull/174) [`e8b9f60`](https://github.com/vex-protocol/vex-protocol/commit/e8b9f609996be883df3e724b3e2d8a65c66b50ec) Thanks [@yuki111888](https://github.com/yuki111888)! - Delay Expo pushes for mail that was just delivered over an active websocket and skip the push if the device acknowledges the mail during that grace window.

## 1.11.4

### Patch Changes

- [#162](https://github.com/vex-protocol/vex-protocol/pull/162) [`c3505a3`](https://github.com/vex-protocol/vex-protocol/commit/c3505a3b09ee2f7128082481f77b98dc0a5f2ea3) Thanks [@yuki111888](https://github.com/yuki111888)! - Update Spire's `ws` runtime dependency and pin the patched `brace-expansion` transitive dependency used by tooling.

## 1.11.3

### Patch Changes

- [#157](https://github.com/vex-protocol/vex-protocol/pull/157) [`cce95e8`](https://github.com/vex-protocol/vex-protocol/commit/cce95e854c37781d79fcd58e8b2fa68546dee73f) Thanks [@yuki111888](https://github.com/yuki111888)! - Keep encrypted file uploads working on React Native by probing multipart Blob support before choosing the upload path, and allow Spire's JSON file-upload fallback to omit the legacy signed field that libvex no longer sends.

## 1.11.2

### Patch Changes

- [#152](https://github.com/vex-protocol/vex-protocol/pull/152) [`bf1317c`](https://github.com/vex-protocol/vex-protocol/commit/bf1317ca43861c2a398e0e26ba23aba262797e37) Thanks [@yuki111888](https://github.com/yuki111888)! - Remove the external HTTP client dependency from libvex and Spire stress tooling in favor of native fetch-based transports.

## 1.11.1

### Patch Changes

- [#147](https://github.com/vex-protocol/vex-protocol/pull/147) [`89c1e85`](https://github.com/vex-protocol/vex-protocol/commit/89c1e8579d8f240d5539f92505a0151130e0ea39) Thanks [@dependabot](https://github.com/apps/dependabot)! - Update Spire's HTTP client dependency to the patched 1.15.2 release.

## 1.11.0

### Minor Changes

- [#118](https://github.com/vex-protocol/vex-protocol/pull/118) [`517ea9b`](https://github.com/vex-protocol/vex-protocol/commit/517ea9b478c0f816cc76dd62bcd49e16a1ab890a) Thanks [@yuki111888](https://github.com/yuki111888)! - Add device notification subscriptions and Expo push fanout alongside the existing websocket notify path. Libvex now exposes subscribe/unsubscribe helpers so mobile clients can register Expo push tokens for inbox wakeups.

### Patch Changes

- [#129](https://github.com/vex-protocol/vex-protocol/pull/129) [`002a812`](https://github.com/vex-protocol/vex-protocol/commit/002a812ff69a7affbd57ed160d0a1df44616eccd) Thanks [@yuki111888](https://github.com/yuki111888)! - Send Android Expo push notifications on the mobile push channel with wake metadata.

- [#137](https://github.com/vex-protocol/vex-protocol/pull/137) [`c002984`](https://github.com/vex-protocol/vex-protocol/commit/c002984b8388e9ce3ed7868509a5565b90c05369) Thanks [@yuki111888](https://github.com/yuki111888)! - Send sender-owned mail notifications as headless Expo pushes so clients can wake and sync without showing self-notifications.

- [#140](https://github.com/vex-protocol/vex-protocol/pull/140) [`48864fa`](https://github.com/vex-protocol/vex-protocol/commit/48864faa2c13827d95807532eb41aa1873f86540) Thanks [@yuki111888](https://github.com/yuki111888)! - Harden Expo push receipt cleanup and make notification subscription saves atomic.

- [#126](https://github.com/vex-protocol/vex-protocol/pull/126) [`82d56bf`](https://github.com/vex-protocol/vex-protocol/commit/82d56bf0d2190cf32be2287e2bfaa148be8afa1f) Thanks [@yuki111888](https://github.com/yuki111888)! - Guard websocket mail receipts until the client has an authenticated device.

- [#130](https://github.com/vex-protocol/vex-protocol/pull/130) [`bf11197`](https://github.com/vex-protocol/vex-protocol/commit/bf11197978cca3cf9c87b10e133b680b5348ee9c) Thanks [@yuki111888](https://github.com/yuki111888)! - Keep shared WebSocket reconnect attempts from surfacing as unhandled rejections and send Android pushes on a fresh audible channel.

## 1.10.4

### Patch Changes

- [#102](https://github.com/vex-protocol/vex-protocol/pull/102) [`e96dc23`](https://github.com/vex-protocol/vex-protocol/commit/e96dc230dcc53cd2cc011a34ac9b5be83aa02e22) Thanks [@yuki111888](https://github.com/yuki111888)! - Reject inbound mail whose sender, author, recipient, or reader metadata does not match the authenticated device and recipient owner.

- [#102](https://github.com/vex-protocol/vex-protocol/pull/102) [`e96dc23`](https://github.com/vex-protocol/vex-protocol/commit/e96dc230dcc53cd2cc011a34ac9b5be83aa02e22) Thanks [@yuki111888](https://github.com/yuki111888)! - Revalidate device tokens against current device state, make mail retention configurable, and rate-limit key-bundle retrieval.

## 1.10.3

### Patch Changes

- [#107](https://github.com/vex-protocol/vex-protocol/pull/107) [`5eb8454`](https://github.com/vex-protocol/vex-protocol/commit/5eb8454225d23068b0e3e3f78142d17f51efc7b5) Thanks [@yuki111888](https://github.com/yuki111888)! - Reject inbound mail whose sender, author, recipient, or reader metadata does not match the authenticated device and recipient owner.

- [#107](https://github.com/vex-protocol/vex-protocol/pull/107) [`5eb8454`](https://github.com/vex-protocol/vex-protocol/commit/5eb8454225d23068b0e3e3f78142d17f51efc7b5) Thanks [@yuki111888](https://github.com/yuki111888)! - Revalidate device tokens against current device state, make mail retention configurable, and rate-limit key-bundle retrieval.

## 1.10.2

### Patch Changes

- [#104](https://github.com/vex-protocol/vex-protocol/pull/104) [`fe757b2`](https://github.com/vex-protocol/vex-protocol/commit/fe757b2eecefa0dd30f03fe8781c38f97d5d43ba) Thanks [@yuki111888](https://github.com/yuki111888)! - Device tokens for deleted or revoked devices are now rejected at the middleware layer. Spire re-validates each `x-device-token` against the live database row and drops any token whose device no longer exists or whose signing key has rotated, closing a window where deleted-device tokens remained accepted until server restart.

- [#106](https://github.com/vex-protocol/vex-protocol/pull/106) [`a2901bd`](https://github.com/vex-protocol/vex-protocol/commit/a2901bd654c992c2e45d88bab8116babf5505eda) Thanks [@yuki111888](https://github.com/yuki111888)! - Fixes FIPS-mode realtime delivery spottiness by making Spire WebSocket fanout tolerant of stale clients and making libvex drain mailbox batches in send order. Mail fetches are now serialized by a single owner, and ratchet session healing waits for repeated decrypt failures instead of resetting a live session on the first mismatch.

## 1.10.1

### Patch Changes

- [#100](https://github.com/vex-protocol/vex-protocol/pull/100) [`dfbb3ad`](https://github.com/vex-protocol/vex-protocol/commit/dfbb3ada7e44d0fb1e2a2cf3436c6dad9343d88e) Thanks [@yuki111888](https://github.com/yuki111888)! - Raises the global per-IP rate limit from 3,000 to 150,000 requests per 15 minutes to accommodate high-throughput clients. Operators running earlier versions who saw legitimate clients hitting rate-limit errors should upgrade.

## 1.10.0

### Minor Changes

- [`95b6680`](https://github.com/vex-protocol/vex-protocol/commit/95b6680ac3658a83f2ecb68e4ccaa02f90c3f823) Thanks [@yuki111888](https://github.com/yuki111888)! - Introduces `@vex-chat/cli`, a terminal client for signing in, chatting, browsing servers/channels/DMs, handling invites, and approving new devices.

    The `Storage` interface gains a new required `hasMessage(mailID: string): Promise<boolean>` method — custom `Storage` implementations must add it. The client now deduplicates inbound mail by `mailID` and applies a DH-ratchet fallback for first-inbound messages, fixing re-delivery and rare decrypt failures across reconnects. Spire exposes a new authenticated `GET /invite/:inviteID/preview` endpoint that returns the invite's server and channel list without consuming the invite.

## 1.9.0

### Minor Changes

- [#62](https://github.com/vex-protocol/vex-protocol/pull/62) [`0f2e7ed`](https://github.com/vex-protocol/vex-protocol/commit/0f2e7ed578f47081a9cbf81627fc2303b7ccc7d9) Thanks [@yuki111888](https://github.com/yuki111888)! - Adds `ServerChannelBootstrap` type and schema to `@vex-chat/types`. Call `client.servers.retrieveWithChannels()` in `@vex-chat/libvex` to fetch all servers and their channels in a single request — useful for fast initial renders. Spire exposes the corresponding `GET /user/:id/servers/bootstrap` endpoint.

### Patch Changes

- Updated dependencies [[`0f2e7ed`](https://github.com/vex-protocol/vex-protocol/commit/0f2e7ed578f47081a9cbf81627fc2303b7ccc7d9)]:
    - @vex-chat/types@3.3.0
    - @vex-chat/crypto@6.0.0

## 1.8.0

### Minor Changes

- [#60](https://github.com/vex-protocol/vex-protocol/pull/60) [`e48c78b`](https://github.com/vex-protocol/vex-protocol/commit/e48c78bf8a8af73c0b1dc847f59a852fc0e996fa) Thanks [@yuki111888](https://github.com/yuki111888)! - Spire operators can now set `SPIRE_DISABLE_RATE_LIMITS=1` (or `true`) to bypass all rate limiting globally — useful for load-testing environments where a `DEV_API_KEY` is not appropriate. The libvex client now debounces session-heal attempts per sender device with a 30-second backoff and in-flight guard, preventing repeated `/keyBundle` hammering when a corrupt or unrecognised mail item triggers back-to-back decrypt failures.

## 1.7.1

### Patch Changes

- [#58](https://github.com/vex-protocol/vex-protocol/pull/58) [`eab38c0`](https://github.com/vex-protocol/vex-protocol/commit/eab38c04a21c219af7961741d7b8aa2144639e70) Thanks [@yuki111888](https://github.com/yuki111888)! - Add re-entrant `enterCryptoProfileScope` / `leaveCryptoProfileScope` so overlapping FIPS `readMail` work cannot reset the process-wide profile mid-await. Yield the JS thread while bulk-decrypting SQLite message history. Harden Spire stress integration (WS budgets, CI workflow) and trim integration client count for more reliable Actions runs.

## 1.7.0

### Minor Changes

- [#52](https://github.com/vex-protocol/vex-protocol/pull/52) [`a07c923`](https://github.com/vex-protocol/vex-protocol/commit/a07c9239d745debd923008ed710d6dffe761af77) Thanks [@yuki111888](https://github.com/yuki111888)! - Spire now enforces a 30-day server-side mail TTL: stale rows are pruned on startup and once daily, and inbox reads skip messages older than 30 days. libvex exports new retention helpers (`MAX_LOCAL_MESSAGE_RETENTION_DAYS`, `clampLocalMessageRetentionDays`, `formatVexRetentionEnvelope`, `stripVexRetentionEnvelope`) and automatically prunes local SQLite storage per a configurable 1–30-day window; set `retentionDays` in your client config to control per-device retention.

## 1.6.1

### Patch Changes

- [#46](https://github.com/vex-protocol/vex-protocol/pull/46) [`3a35f0a`](https://github.com/vex-protocol/vex-protocol/commit/3a35f0ada9d16f1a3e3ef6160b2abd9236f7d65d) Thanks [@yuki111888](https://github.com/yuki111888)! - Allow up to three missed pongs (~15s) before declaring a WebSocket
  session dead. The previous heartbeat loop killed the socket after
  **a single** missed pong (~5s window), which is far too aggressive
  for mobile clients: any normal native modal that pauses the JS
  thread for more than five seconds — Android biometric prompt
  during passkey registration, file picker, share sheet, expensive
  Noise/crypto cycle — would push the pong handler past the budget
  and the server would tear the connection down out from under the
  user.

    Fixes the cascade of `ws:disconnect` →
    `connection:recover:start` → `INVALID_STATE_ERR` cycles seen
    during routine mobile flows. The new tolerance still detects a
    genuinely dead TCP flow within a couple of pings, well inside the
    upstream proxy's idle window.

## 1.6.0

### Minor Changes

- [#42](https://github.com/vex-protocol/vex-protocol/pull/42) [`5e9f1c6`](https://github.com/vex-protocol/vex-protocol/commit/5e9f1c6587236b10ccb082fd269b8ed9d253900d) Thanks [@yuki111888](https://github.com/yuki111888)! - Auto-derive the native-Android WebAuthn origin
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

## 1.5.0

### Minor Changes

- [#40](https://github.com/vex-protocol/vex-protocol/pull/40) [`d6b839d`](https://github.com/vex-protocol/vex-protocol/commit/d6b839d655a6d79aa6a0889763aacfa2df98595d) Thanks [@yuki111888](https://github.com/yuki111888)! - Optionally serve the WebAuthn well-known association files
  (`/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`)
  directly from spire so operators whose RP host already routes to the
  container can publish app↔domain associations without standing up a
  separate static site. Gated on three env vars
  (`SPIRE_PASSKEY_IOS_APP_IDS`, `SPIRE_PASSKEY_ANDROID_PACKAGE`,
  `SPIRE_PASSKEY_ANDROID_FINGERPRINTS`); 404 when unset and mounted
  ahead of the per-IP rate limiter so periodic platform fetches are
  never 429'd.

## 1.4.0

### Minor Changes

- [#38](https://github.com/vex-protocol/vex-protocol/pull/38) [`f10bd91`](https://github.com/vex-protocol/vex-protocol/commit/f10bd91bd168eedbc69ca81c418a0988642d8392) Thanks [@yuki111888](https://github.com/yuki111888)! - Add passkey (WebAuthn) support for account-recovery and device
  management. A passkey can authenticate a user without any device
  key on hand and grants the same admin permissions as a device:
  list/delete devices and approve/reject pending device-enrollment
  requests. Passkeys cannot send or receive messages — they're
  strictly second-class admin credentials.

    Operators must set `SPIRE_PASSKEY_RP_ID` and `SPIRE_PASSKEY_ORIGINS`
    to enable the new endpoints. Clients drive the ceremony with
    `@simplewebauthn/browser` (web) or `react-native-passkey` (mobile).

### Patch Changes

- Updated dependencies [[`f10bd91`](https://github.com/vex-protocol/vex-protocol/commit/f10bd91bd168eedbc69ca81c418a0988642d8392)]:
    - @vex-chat/types@3.2.0
    - @vex-chat/crypto@5.0.0

## 1.3.7

### Patch Changes

- [#36](https://github.com/vex-protocol/vex-protocol/pull/36) [`4835c81`](https://github.com/vex-protocol/vex-protocol/commit/4835c81c181e9cf122077315575707f2a377a93e) Thanks [@yuki111888](https://github.com/yuki111888)! - Pending device-approval responses now include the existing user's `userID`. Spire returns it from `createPendingDeviceEnrollmentRequest`, the `RegisterPendingApprovalCodec` accepts it (optional for back-compat with older servers), and `DeviceApprovalRequiredError` / `PendingDeviceRegistration` expose it as `userID`. This lets a new, still-unauthenticated device fetch the public avatar via `/avatar/:userID` and surface an "is this you?" confirmation before continuing the approval dance. Purely additive; older servers/clients that omit the field continue to work.

## 1.3.6

### Patch Changes

- [#34](https://github.com/vex-protocol/vex-protocol/pull/34) [`3f8db96`](https://github.com/vex-protocol/vex-protocol/commit/3f8db96f7943e108ccc4e84bc64f5db2622b1857) Thanks [@yuki111888](https://github.com/yuki111888)! - Usernames are now case-insensitive: registration and login fold the provided username to lowercase, so `User` and `user` resolve to the same account. `client.randomUsername()` returns lowercase words to match the canonical form. No migration required — existing mixed-case rows remain accessible under any-case input.

## 1.3.5

### Patch Changes

- [#30](https://github.com/vex-protocol/vex-protocol/pull/30) [`8ce069c`](https://github.com/vex-protocol/vex-protocol/commit/8ce069cafea735df29cbfecec311680687436930) Thanks [@yuki111888](https://github.com/yuki111888)! - Fix `POST /avatar/:userID/json` rejecting every JSON-fallback avatar upload with `400 Invalid file payload`. The route was reusing `FilePayloadSchema` (the schema for encrypted user-file uploads, which requires `nonce`/`owner`/`signed`) to validate avatar bodies. The libvex client only sends `{ file: <base64> }` for avatars, so Zod always rejected the body. Replaced it with an avatar-specific `{ file: string.min(1) }` schema, matching the actual contract used by libvex's `client.me.setAvatar(...)` JSON path on runtimes without `FormData`/`Blob(Uint8Array)` (React Native/Hermes).

## 1.3.4

### Patch Changes

- [#22](https://github.com/vex-protocol/vex-protocol/pull/22) [`caee995`](https://github.com/vex-protocol/vex-protocol/commit/caee9955c024b80bd9a2ccf78b5db3b5d62f3339) Thanks [@yuki111888](https://github.com/yuki111888)! - Add an unauthenticated path for a pending device-enrollment requester to learn its own approval status.

    A new device that registers against an existing username gets back a 202 with `{ requestID, challenge }` but cannot authenticate until an existing signed-in device approves it. Previously the only status endpoint required a user token, so the new device had no way to learn it had been approved.
    - spire: new `POST /user/devices/requests/:requestID/poll` accepts `{ signed }` (the requesting device's signature over the original challenge), opens it with the pending request's stored `signKey`, and returns the request status (and `approvedDeviceID` once approved). No token required.
    - libvex: `Client.register` now throws a typed `DeviceApprovalRequiredError` (carrying `requestID`, `challenge`, and `expiresAt`) when the server returns a pending-approval response, and `Client.devices.pollPendingRegistration({ requestID, challenge })` calls the new endpoint, signing the challenge with the local secret signing key.

    The new device can then loop on `pollPendingRegistration` and, once status flips to `approved`, call the existing `loginWithDeviceKey(approvedDeviceID)` to complete login.

## 1.3.3

### Patch Changes

- [#20](https://github.com/vex-protocol/vex-protocol/pull/20) [`c23fb75`](https://github.com/vex-protocol/vex-protocol/commit/c23fb750a85599970a72bc53efdd0662a5a0703b) Thanks [@yuki111888](https://github.com/yuki111888)! - Harden multi-device enrollment by binding approval signatures to both the pending request ID and requesting device signKey, and improve `/register` duplicate-constraint detection so existing-account enrollments return pending approval instead of an internal server error.

## 1.3.2

### Patch Changes

- [`f9ac7ca`](https://github.com/vex-protocol/vex-protocol/commit/f9ac7ca29aea760c319ab278ab29f997399eaf5b) Thanks [@yuki111888](https://github.com/yuki111888)! - Treat duplicate-username `/register` attempts as pending device-approval requests so second devices can be confirmed from an existing session, and add SDK decoding support for the pending approval register response.

## 1.3.1

### Patch Changes

- [`65c6d0a`](https://github.com/vex-protocol/vex-protocol/commit/65c6d0ac046126b729d00cb1e47615f513915dab) Thanks [@yuki111888](https://github.com/yuki111888)! - Refresh internal dependency alignment with `@vex-chat/crypto@4.0.1` for the SDK and server packages.

## 1.3.0

### Minor Changes

- [#14](https://github.com/vex-protocol/vex-protocol/pull/14) [`bd8ce8e`](https://github.com/vex-protocol/vex-protocol/commit/bd8ce8e4f0fecd25b81e9dba2211400644814887) Thanks [@yuki111888](https://github.com/yuki111888)! - `username` and `password` are now optional for registration. Clients can call `client.register()` with no arguments to register via keypair alone — a username is auto-generated from the signing key if omitted. `DevicePayload.username` and `RegistrationPayload.password` are now `string | undefined` in `@vex-chat/types`; update any code that assumed these fields are always present.

### Patch Changes

- Updated dependencies [[`bd8ce8e`](https://github.com/vex-protocol/vex-protocol/commit/bd8ce8e4f0fecd25b81e9dba2211400644814887)]:
    - @vex-chat/types@3.1.0
    - @vex-chat/crypto@4.0.0

## 1.2.0

### Minor Changes

- [#7](https://github.com/vex-protocol/vex-protocol/pull/7) [`06bb384`](https://github.com/vex-protocol/vex-protocol/commit/06bb38498d370babf203699aff44e9ff49fa2e5f) Thanks [@yuki111888](https://github.com/yuki111888)! - Messaging sessions now use a Double Ratchet algorithm for per-message forward secrecy. `@vex-chat/types` exports `RatchetHeader` and `RatchetHeaderSchema` for the new subsequent-mail header format; `@vex-chat/libvex`'s `SessionCrypto` gains ratchet state fields (`RK`, `CKs`, `CKr`, `DHsPublic`, `DHsPrivate`, `DHr`, `Ns`, `Nr`, `PN`, `skippedKeys`, `verified`).

### Patch Changes

- [#7](https://github.com/vex-protocol/vex-protocol/pull/7) [`6de0018`](https://github.com/vex-protocol/vex-protocol/commit/6de001880ea5fa761211cc17c86d4aaa4ddb9425) Thanks [@yuki111888](https://github.com/yuki111888)! - Add Signal-style Double Ratchet support for post-X3DH direct messages.

    `@vex-chat/libvex` now uses per-message ratchet keys and persists ratchet state
    (root key, chain keys, DH ratchet state, counters, skipped keys). `@vex-chat/types`
    adds ratchet header/session fields required by this strict protocol break.

    `@vex-chat/spire` continues to store and forward `mail.extra` as opaque client
    metadata to support ratchet and future protocol extensions.

- Updated dependencies [[`06bb384`](https://github.com/vex-protocol/vex-protocol/commit/06bb38498d370babf203699aff44e9ff49fa2e5f), [`6de0018`](https://github.com/vex-protocol/vex-protocol/commit/6de001880ea5fa761211cc17c86d4aaa4ddb9425)]:
    - @vex-chat/types@3.0.0
    - @vex-chat/crypto@3.0.0

## 1.1.0

### Minor Changes

- [`03f6bb7`](https://github.com/vex-protocol/vex-protocol/commit/03f6bb7ad4d020d9e29897135f963e979f237e01) Thanks [@dream9x](https://github.com/dream9x)! - Adding a second device to an account now requires approval from an existing device. `POST /:id/devices` returns `202` with a `requestID` and `challenge` when the user already has enrolled devices; the first device enrolled on a fresh account is still created immediately. New endpoints — `GET /:id/devices/requests`, `GET /:id/devices/requests/:requestID`, `POST /:id/devices/requests/:requestID/approve`, and `POST /:id/devices/requests/:requestID/reject` — let existing devices list, approve, or reject pending enrollment requests. Enrollment requests expire after 10 minutes; resolved requests are pruned after 30 minutes.

- [`03f6bb7`](https://github.com/vex-protocol/vex-protocol/commit/03f6bb7ad4d020d9e29897135f963e979f237e01) Thanks [@dream9x](https://github.com/dream9x)! - Set `SPIRE_FIPS=1` (or `SPIRE_FIPS=true`) to run Spire in FIPS-compliant mode. In FIPS mode the server uses P-256 (Web Crypto `subtle`) instead of tweetnacl for all signing operations, and `GET /status` now returns a `cryptoProfile` field (`"fips"` or `"tweetnacl"`) so monitoring can confirm the active crypto backend. A `postinstall` hook now rebuilds `better-sqlite3` from source automatically, removing the need to run `npm rebuild better-sqlite3` manually after install on glibc-based systems.

## 1.0.4

### Patch Changes

- 3a2eb1d: CORS middleware now runs before helmet and auth, so browser preflight (`OPTIONS`) requests receive `Access-Control-*` headers even for unauthenticated routes. Browser clients (web, Tauri, Capacitor) that were being blocked by CORS errors should work without any config changes. The allowed-methods list is now explicit: `GET`, `HEAD`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`.
- 0d6ba99: The `/status` endpoint now returns only `{ ok }` for regular requests. The extended response fields (`canary`, database sizing information, etc.) are now gated behind the `DEV_API_KEY` header — set `DEV_API_KEY` in your environment and pass it as `x-dev-api-key` if your monitoring needs the full response.
- c9853bf: HTTP request logging via `morgan` is back. UUIDs in request URLs are replaced with `[uuid]` before the log line is written, so per-request traces no longer leak user or resource identifiers to stdout. No config changes required.

## 1.0.3

### Patch Changes

- fdb4807: The `/status` endpoint no longer returns `commitSha`, `dbHealthy`, `dbReady`, `latencyBudgetMs`, `metrics`, `startedAt`, `uptimeSeconds`, and `withinLatencyBudget` fields. Operators relying on those fields should source equivalent signals from their own infrastructure monitoring.

## 1.0.2

### Patch Changes

- 335818e: Bumps the `@vex-chat/crypto` dependency from `2.0.0` to `2.0.1`. No API or config changes required.
- f728d94: Optional `DEV_API_KEY` lets matching `x-dev-api-key` requests skip in-process rate limits for local load testing. Adds an npm script that drives a local Spire via `@vex-chat/libvex`. (Replaces the earlier `SPIRE_STRESS_BYPASS_KEY` / `X-Spire-Stress-Bypass` naming.)

## 1.0.1

### Patch Changes

- d262b02: Rate limits are now 10x higher across all tiers: the global per-IP limit rises from 300 to 3 000 requests per 15 minutes, the auth endpoint limit rises from 5 to 50 failed attempts per 15 minutes, and the upload limit rises from 20 to 200 requests per minute. No config changes required — limits take effect on the next server start.
- ebea78f: HTTP request logging via `morgan` has been removed from the server. Operators who relied on per-request log lines in stdout should add their own logging middleware after calling `initApp`.
- 0b7005c: Passwords are now hashed with argon2id (via a transparent on-login migration from the previous algorithm). JWT tokens are signed with a dedicated secret instead of reusing the server's persistent key pair, so all existing sessions will be invalidated on upgrade — users will need to log in again.

## 1.0.0

### Major Changes

- 7434d34: First release after a 5-year dormancy. Latest public npm was `0.8.0` (published 2021-02-03) and the repo went `private` shortly after. This cuts a new published version off the modern tree, aligned with `@vex-chat/types@2.0.0` and `@vex-chat/crypto@2.0.0`.

    Classified as **major** — not the usual pre-1.0 minor-for-breaking-changes convention. The new Zod runtime validation on every trust boundary is the deciding factor: consumers that worked against `0.8.0`'s permissive request handling will see their requests rejected by the new zod `.parse()` step when fields are missing, wrongly typed, or contain unexpected shapes. The message framing, auth layer, database layer, and docs-serving layer have all also changed substantially. Operators should treat this as a rewrite and re-integrate end-to-end rather than an in-place upgrade.

    ### Stack
    - **Pure ESM** (`type: "module"`). Previously CommonJS.
    - **Node `>=24.0.0`, npm `>=10.0.0`** engines. Previously unspecified (ran on Node 12 era).
    - **npm** enforced as the only package manager (`preinstall: npx only-allow npm`). Previously yarn.
    - **TypeScript 6.0.2** with the full strict flag set (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`). Previously TypeScript 4.1 with lax settings.
    - **Runs via `node --experimental-strip-types src/run.ts`** in dev and deployment — no pre-compile step required. `dist/` is still built in CI and shipped in the tarball for consumer auditability.

    ### Web / protocol layer
    - **Express 5.2.1** (was 4.17). Major framework upgrade with new routing/middleware semantics.
    - **ws 8.20.0** directly, dropped the `express-ws` wrapper in favor of the native WebSocket upgrade path. `cookie-parser` and `atob` removed (no longer needed under Express 5 + Node 24).
    - **New: `@scalar/express-api-reference`** — interactive OpenAPI documentation viewer at `/docs` (production-gated for security).
    - **New: `@asyncapi/web-component`** — interactive AsyncAPI viewer for the WebSocket protocol at `/async-docs`.
    - **Helmet 8.1** (was 4.2). Production-only hardened CSP; relaxed CSP scoped to `/docs` and `/async-docs` only to let the interactive viewers work without loosening protection on the actual API surface.

    ### Database
    - **Kysely 0.28.16 + better-sqlite3 11.10.0** replacing **knex 0.21 + sqlite3 5.0 + mysql 2.18**. Full migration from knex's query builder to Kysely's type-safe query DSL, with better-sqlite3's synchronous binding replacing the async sqlite3 native module.
    - **MySQL support removed.** SQLite only. The old `DB_TYPE=mysql` env path and the `knex --knexfile` CLI are gone.
    - **Migrations consolidated**: the eight knex migration files from 2021 (`20210103_users.js`, `_mail.js`, `_preKeys.js`, etc.) replaced with a single Kysely schema migration (`2026-04-06_initial-schema.ts`). New installations seed from this one file; there is no upgrade path from a `0.8.0` database.

    ### Wire / validation
    - **zod 4.3.6** runtime validation on every trust boundary — every request body, query string, and WebSocket payload is parsed through a Zod schema before any logic runs. Zero `as` type assertions in the request-handling path.
    - **msgpackr 1.11.8** replacing **msgpack-lite 0.1.26**. More standards-compliant encoder/decoder; msgpack-lite's extensions were incompatible with the typed-array decoder now used in the browser SDK.
    - **`@vex-chat/types` bumped from `^0.10.18` to `2.0.0`**. Major renames throughout: `I` prefix dropped from every interface (`IBaseMsg` → `BaseMsg`, `IKeyBundle` → `KeyBundle`, etc.), schemas renamed to `XSchema` form, date fields migrated from `Date` objects to ISO 8601 strings. See the `@vex-chat/types` 2.0.0 changelog for the full migration.
    - **`@vex-chat/crypto` bumped from `^0.7.15` to `2.0.0`**. Complete nacl operation wrappers (`xSign`, `xSecretbox`, `xBoxKeyPair`, etc.) replace the earlier pattern of reaching into `nacl.*` directly from the server. `saveKeyFile`/`loadKeyFile` replaced with `encryptKeyData`/`decryptKeyData` pure functions (no I/O).

    ### Auth / crypto
    - **jsonwebtoken 9.0.3** (was 8.5). Covers CVE-2022-23529 (algorithm confusion) and related auth-layer fixes.
    - Native `node:crypto` HKDF / PBKDF2 / SHA replacing the `pbkdf2 ^3.1.1` userspace port.
    - Server crypto calls go through `@vex-chat/crypto`'s `XUtils` namespace instead of inline `tweetnacl.*`.

    ### Upload / file handling
    - **multer 2.1.1** (was 1.4.2). Major version upgrade — changed file field API semantics.
    - **file-type 22** (was 16). ESM-native upgrade.

    ### Tooling
    - **Vitest 3.2** replacing **Jest 26 + ts-jest**. Tests under `src/__tests__/` run 3x faster and integrate cleanly with the ESM module graph.
    - **ESLint 10 with `typescript-eslint@strictTypeChecked`** replacing **tslint 5.20** (long-deprecated). Added `eslint-plugin-perfectionist` for deterministic import/object sorting and `@vitest/eslint-plugin` for test-file rules, plus `eslint-plugin-n` for Node-specific best practices.
    - **Prettier 3.8** (was 1.19). Format applied repo-wide.
    - **Husky 9** + **lint-staged 16** pre-commit hooks (was Husky 3 + lint-staged 9).
    - **`@changesets/cli` 2.30** — release flow now managed via changesets instead of manual version bumps (see `AGENTS.md`, which lands alongside this release).
    - **`@onebeyond/license-checker`** license-allowlist gate in CI with a small workaround script for `@scalar/express-api-reference`'s malformed `package.json` readme field.
    - **`type-coverage` at 95%** enforced in CI.

    ### Packaging fix (important for existing `0.8.0` consumers)

    The `0.8.0` tarball shipped the server's own state files by accident — `spire.sqlite` (an actual SQLite database), the entire `emoji/` directory (user-uploaded content), and `jest.config.js`. No `files` field was set, so npm defaulted to publishing nearly the whole working tree.

    `0.9.0-rc.0` pins `files: ["dist", "src", "LICENSE"]`. The tarball now contains only the compiled output, the TypeScript source (for auditability), and the license. Database state and uploaded content stay on the deployed server, where they belong.

    ### CI / release pipeline
    - **Parallel-job `build.yml`** with a `CI OK` aggregator acting as the single required status check. Jobs: `build` (matrix: ubuntu/macos/windows), `test` (matrix: ubuntu/macos/windows — the matrix has caught real Windows-only runtime bugs), `lint`, `types`, `supply-chain`. Native module compilation (`better-sqlite3`) is what drives the cross-OS matrix on build/test.
    - **`setup-node@v6`** with `cache: npm` and `node-version-file: .tool-versions`. Dropped the `jdx/mise-action` step in CI; `mise.toml` stays for local dev parity.
    - **`release.yml`** uses `changesets/action` to open version-packages PRs and publish to npm with **provenance attestation** (`--provenance`, `id-token: write`). SBOM generated via `@cyclonedx/cyclonedx-npm` and uploaded as an artifact on every successful publish.
    - **Deploy-hook moved to `release.yml`.** Previously in `build.yml` firing on every master push, which meant unrelated commits (CI tweaks, docs) triggered production deploys. Now deploy only fires after a successful `changesets/action` publish — tight coupling between "version went out" and "production updates".
    - **`auto-changeset.yml`** runs a Claude prompt on every human PR that reads `AGENTS.md`, builds the PR's current source, downloads the latest published tarball, and byte-diffs the two to decide whether the PR is user-visible. Biases hard toward empty changesets for CI/docs/config-only PRs to avoid no-op releases.
    - **CodeQL v4.35.1** + **OSSF Scorecard v2.4.3** + **Socket.dev supply-chain scanning** (fork-gated) + **step-security/harden-runner** on every job.
    - **Dependabot** grouped: one weekly PR for all github-actions bumps, one each for production and development npm deps.
    - **`npm-package-json-lint`** gate enforces exact version pins (no `^` ranges) across all dependencies and devDependencies.

    ### AGENTS.md

    A new `AGENTS.md` lands alongside this release documenting the release flow, the `NEVER` / `SAFE` lists for agents and humans, the published-tarball footprint, dependabot exemption policy, and required secrets. Future agent-authored changesets read this file first as the source of truth on what counts as user-visible.
