# @vex-chat/libvex

## 7.2.0

### Minor Changes

- [#234](https://github.com/vex-protocol/vex-protocol/pull/234) [`9c59293`](https://github.com/vex-protocol/vex-protocol/commit/9c5929339252320adb41ee97f1b5ea6b8605fe8d) Thanks [@dream9x](https://github.com/dream9x)! - Adds one-to-one voice call signaling across the stack. `@vex-chat/types` exports new call schemas (`CallSession`, `CallEvent`, `IceServerConfig`, and related types/validators); `@vex-chat/libvex` exposes a `Calls` API on the `Client` for initiating and managing calls; `@vex-chat/spire` gains a `CallManager` and TURN credential support to broker WebRTC signaling between peers.

### Patch Changes

- Updated dependencies [[`9c59293`](https://github.com/vex-protocol/vex-protocol/commit/9c5929339252320adb41ee97f1b5ea6b8605fe8d)]:
    - @vex-chat/types@4.1.0
    - @vex-chat/crypto@8.0.0

## 7.1.6

### Patch Changes

- [#227](https://github.com/vex-protocol/vex-protocol/pull/227) [`6a6c145`](https://github.com/vex-protocol/vex-protocol/commit/6a6c145ed153d52baef2e122bb45f7b6d1c87610) Thanks [@yuki111888](https://github.com/yuki111888)! - Emit undecrypted message placeholders after repeated decrypt failures so clients can surface a visible failure row instead of silently dropping notified mail.

- [#231](https://github.com/vex-protocol/vex-protocol/pull/231) [`88f1239`](https://github.com/vex-protocol/vex-protocol/commit/88f1239b8dedd1d39f6c960206ac20b245a2c1b5) Thanks [@yuki111888](https://github.com/yuki111888)! - Fix at-rest encryption of undecrypted messages in SQLite storage. Previously, messages that arrived but failed decryption (non-empty, non-placeholder entries) were written to disk unencrypted; they are now encrypted with the at-rest key like all other messages.

## 7.1.5

### Patch Changes

- [#223](https://github.com/vex-protocol/vex-protocol/pull/223) [`b20de1c`](https://github.com/vex-protocol/vex-protocol/commit/b20de1ca450dd774efd9c33b923ea7f2691b5ce3) Thanks [@yuki111888](https://github.com/yuki111888)! - Reduce the Double Ratchet skipped message key retention cap to align with the existing 1,024-message skip window.

## 7.1.4

### Patch Changes

- Let connected clients repair stale signed prekeys without blocking registration and force self-device direct-message forwards through a fresh session.

## 7.1.3

### Patch Changes

- [#217](https://github.com/vex-protocol/vex-protocol/pull/217) [`b644df7`](https://github.com/vex-protocol/vex-protocol/commit/b644df7842ef394cd1537ada0fc46d6bde462274) Thanks [@yuki111888](https://github.com/yuki111888)! - Keep direct-message delivery successful when best-effort forwarding to the sender's other devices hits a bad self-device key bundle, and prevent stale signed prekeys from being reused during device registration.

## 7.1.2

### Patch Changes

- [#208](https://github.com/vex-protocol/vex-protocol/pull/208) [`fe49ae6`](https://github.com/vex-protocol/vex-protocol/commit/fe49ae6a993e6c8953ac9666e6a19cee8bf00676) Thanks [@yuki111888](https://github.com/yuki111888)! - Make direct-message sync to the sender's other devices part of the send path instead of a background message-event side effect.

## 7.1.1

### Patch Changes

- [#209](https://github.com/vex-protocol/vex-protocol/pull/209) [`c6bf509`](https://github.com/vex-protocol/vex-protocol/commit/c6bf5093b205e106026521c2994e6694c5d32518) Thanks [@yuki111888](https://github.com/yuki111888)! - Make direct-message sync to the sender's other devices part of the send path instead of a background message-event side effect.

## 7.1.0

### Minor Changes

- [#204](https://github.com/vex-protocol/vex-protocol/pull/204) [`62108c9`](https://github.com/vex-protocol/vex-protocol/commit/62108c92709cc9d519a6018365e7325d20b25e0b) Thanks [@yuki111888](https://github.com/yuki111888)! - Require newly approved devices to complete passkey setup or authentication instead of treating approval as permanent passkey verification.

## 7.0.2

### Patch Changes

- [#201](https://github.com/vex-protocol/vex-protocol/pull/201) [`73250db`](https://github.com/vex-protocol/vex-protocol/commit/73250db0f2b8bf6fdb178d1d70d471ec756d39a6) Thanks [@yuki111888](https://github.com/yuki111888)! - Require fresh passkey verification on the approving device for additive device enrollment, and persist passkey-approved device trust so newly approved devices can refresh device-key sessions without holding a local passkey.

## 7.0.1

### Patch Changes

- [#198](https://github.com/vex-protocol/vex-protocol/pull/198) [`fd536d4`](https://github.com/vex-protocol/vex-protocol/commit/fd536d4829e69fc2147947fc4bc82b3754abae0a) Thanks [@yuki111888](https://github.com/yuki111888)! - Require fresh passkey verification on the approving device for additive device enrollment, and persist passkey-approved device trust so newly approved devices can refresh device-key sessions without holding a local passkey.

## 7.0.0

### Major Changes

- [#192](https://github.com/vex-protocol/vex-protocol/pull/192) [`a27c2f6`](https://github.com/vex-protocol/vex-protocol/commit/a27c2f6a62c2545475d6456dde8a9a81629d88f5) Thanks [@yuki111888](https://github.com/yuki111888)! - Passkey-authenticated device enrollment is now recovery-only. Use
  `client.passkeys.recoverDeviceRequest(requestID)` and Spire's
  `POST /user/:id/passkey/recover/devices/requests/:requestID` endpoint to
  provision a new device from a passkey; the old passkey approval endpoint and
  `client.passkeys.approveDeviceRequest()` API have been removed so recovery
  always revokes previously trusted devices and their push subscriptions
  server-side.

### Minor Changes

- [#185](https://github.com/vex-protocol/vex-protocol/pull/185) [`c5526a8`](https://github.com/vex-protocol/vex-protocol/commit/c5526a84404c1ed92f1283c9b56cf996c42e260d) Thanks [@yuki111888](https://github.com/yuki111888)! - Add batched message delete event extras for deleting multiple authored messages with one encrypted control message.

- [#184](https://github.com/vex-protocol/vex-protocol/pull/184) [`2c049ff`](https://github.com/vex-protocol/vex-protocol/commit/2c049ff31bf36102953db26a9c7e39a6da2681e8) Thanks [@yuki111888](https://github.com/yuki111888)! - `MessageEmbed` gains an optional `iconAttachment` field (`EncryptedFileAttachmentReference`) so clients can attach an encrypted file as the embed icon instead of a plain icon URL string.

- [#183](https://github.com/vex-protocol/vex-protocol/pull/183) [`69d369a`](https://github.com/vex-protocol/vex-protocol/commit/69d369aeb0f12855559d30788c77deae325dbf5c) Thanks [@yuki111888](https://github.com/yuki111888)! - Add `MessageDeleteEvent` and `MessageUpdateEvent` types, `MessageUpdatePatch` type, and `createMessageDeleteEventExtra` / `createMessageUpdateEventExtra` helpers so clients can signal message edits and deletions via the encrypted extra metadata field.

### Patch Changes

- [#187](https://github.com/vex-protocol/vex-protocol/pull/187) [`bdb4e87`](https://github.com/vex-protocol/vex-protocol/commit/bdb4e87e819a3c2310c056b77abfd66800ba2758) Thanks [@yuki111888](https://github.com/yuki111888)! - Add a batched mail delivery endpoint and have libvex coalesce concurrent mail sends through it, falling back to the existing WebSocket send path when batching is unavailable.

- [#186](https://github.com/vex-protocol/vex-protocol/pull/186) [`270a40e`](https://github.com/vex-protocol/vex-protocol/commit/270a40ed341ddc0c55c118e8d5c99fd6dfb2ca38) Thanks [@yuki111888](https://github.com/yuki111888)! - Reduce client-side send latency for large recipient fanout by sending mail to devices with bounded concurrency while preserving per-device encryption and recovery behavior.

- Updated dependencies [[`7e56876`](https://github.com/vex-protocol/vex-protocol/commit/7e568760fd56b459335f4b0df662aa2c70f22327)]:
    - @vex-chat/types@4.0.0
    - @vex-chat/crypto@7.0.0

## 6.8.0

### Minor Changes

- [#179](https://github.com/vex-protocol/vex-protocol/pull/179) [`831e46c`](https://github.com/vex-protocol/vex-protocol/commit/831e46c7150753fb509a4881a6bc8623f02f2f48) Thanks [@yuki111888](https://github.com/yuki111888)! - Add exported message extra/embed types and helpers for encrypted rich message metadata.

## 6.7.0

### Minor Changes

- [#172](https://github.com/vex-protocol/vex-protocol/pull/172) [`d11382f`](https://github.com/vex-protocol/vex-protocol/commit/d11382ffb928363f5da022cf0dac0a067ea5ccde) Thanks [@yuki111888](https://github.com/yuki111888)! - Add encrypted message-level extra metadata on direct and group sends so clients can build features such as reactions without exposing that metadata in mail routing fields.

## 6.6.4

### Patch Changes

- [#166](https://github.com/vex-protocol/vex-protocol/pull/166) [`ccdb9dc`](https://github.com/vex-protocol/vex-protocol/commit/ccdb9dcab90ba66ab2df2028274d598b02904ff8) Thanks [@yuki111888](https://github.com/yuki111888)! - Allow file downloads to complete in React Native fetch environments that do not expose response body streams.

## 6.6.3

### Patch Changes

- [#157](https://github.com/vex-protocol/vex-protocol/pull/157) [`cce95e8`](https://github.com/vex-protocol/vex-protocol/commit/cce95e854c37781d79fcd58e8b2fa68546dee73f) Thanks [@yuki111888](https://github.com/yuki111888)! - Keep encrypted file uploads working on React Native by probing multipart Blob support before choosing the upload path, and allow Spire's JSON file-upload fallback to omit the legacy signed field that libvex no longer sends.

## 6.6.2

### Patch Changes

- [#152](https://github.com/vex-protocol/vex-protocol/pull/152) [`bf1317c`](https://github.com/vex-protocol/vex-protocol/commit/bf1317ca43861c2a398e0e26ba23aba262797e37) Thanks [@yuki111888](https://github.com/yuki111888)! - Remove the external HTTP client dependency from libvex and Spire stress tooling in favor of native fetch-based transports.

## 6.6.1

### Patch Changes

- [#142](https://github.com/vex-protocol/vex-protocol/pull/142) [`e791d28`](https://github.com/vex-protocol/vex-protocol/commit/e791d28439711d684b2d2c51e10f125c0de80726) Thanks [@yuki111888](https://github.com/yuki111888)! - Publish the patched HTTP client dependency in the libvex package manifest.

## 6.6.0

### Minor Changes

- [#118](https://github.com/vex-protocol/vex-protocol/pull/118) [`517ea9b`](https://github.com/vex-protocol/vex-protocol/commit/517ea9b478c0f816cc76dd62bcd49e16a1ab890a) Thanks [@yuki111888](https://github.com/yuki111888)! - Add device notification subscriptions and Expo push fanout alongside the existing websocket notify path. Libvex now exposes subscribe/unsubscribe helpers so mobile clients can register Expo push tokens for inbox wakeups.

### Patch Changes

- [#130](https://github.com/vex-protocol/vex-protocol/pull/130) [`bf11197`](https://github.com/vex-protocol/vex-protocol/commit/bf11197978cca3cf9c87b10e133b680b5348ee9c) Thanks [@yuki111888](https://github.com/yuki111888)! - Keep shared WebSocket reconnect attempts from surfacing as unhandled rejections and send Android pushes on a fresh audible channel.

## 6.5.5

### Patch Changes

- [#102](https://github.com/vex-protocol/vex-protocol/pull/102) [`e96dc23`](https://github.com/vex-protocol/vex-protocol/commit/e96dc230dcc53cd2cc011a34ac9b5be83aa02e22) Thanks [@yuki111888](https://github.com/yuki111888)! - Verify X3DH key bundle signed prekeys and one-time prekeys before deriving a new session.

## 6.5.4

### Patch Changes

- [#111](https://github.com/vex-protocol/vex-protocol/pull/111) [`73720f1`](https://github.com/vex-protocol/vex-protocol/commit/73720f1fed87420e6febad5cad75332ac6604f79) Thanks [@yuki111888](https://github.com/yuki111888)! - Recover realtime WebSocket connections when the underlying socket reaches CLOSING or CLOSED without a reliable close event.

- [#107](https://github.com/vex-protocol/vex-protocol/pull/107) [`5eb8454`](https://github.com/vex-protocol/vex-protocol/commit/5eb8454225d23068b0e3e3f78142d17f51efc7b5) Thanks [@yuki111888](https://github.com/yuki111888)! - Verify X3DH key bundle signed prekeys and one-time prekeys before deriving a new session.

## 6.5.3

### Patch Changes

- [#106](https://github.com/vex-protocol/vex-protocol/pull/106) [`a2901bd`](https://github.com/vex-protocol/vex-protocol/commit/a2901bd654c992c2e45d88bab8116babf5505eda) Thanks [@yuki111888](https://github.com/yuki111888)! - Fixes FIPS-mode realtime delivery spottiness by making Spire WebSocket fanout tolerant of stale clients and making libvex drain mailbox batches in send order. Mail fetches are now serialized by a single owner, and ratchet session healing waits for repeated decrypt failures instead of resetting a live session on the first mismatch.

## 6.5.2

### Patch Changes

- [#98](https://github.com/vex-protocol/vex-protocol/pull/98) [`f3faf15`](https://github.com/vex-protocol/vex-protocol/commit/f3faf15c486faef699e0b4e68554b4a774af6066) Thanks [@yuki111888](https://github.com/yuki111888)! - Fixes message sends on a closed or closing WebSocket: the client now automatically reconnects with exponential back-off (capped at 30 s) when a send is attempted on a broken connection, so consumers no longer need to call `reconnectWebsocket()` manually after a drop. Concurrent reconnect calls are also deduplicated — only one reconnect runs at a time.

## 6.5.1

### Patch Changes

- [#96](https://github.com/vex-protocol/vex-protocol/pull/96) [`d132ff8`](https://github.com/vex-protocol/vex-protocol/commit/d132ff896425373ec168d8b0efa00327563672a9) Thanks [@yuki111888](https://github.com/yuki111888)! - Include all of the sender's devices in channel message fanout, including the active sending device, so server echo acts as the delivery acknowledgement and other logged-in devices receive outgoing channel messages.

## 6.5.0

### Minor Changes

- [`95b6680`](https://github.com/vex-protocol/vex-protocol/commit/95b6680ac3658a83f2ecb68e4ccaa02f90c3f823) Thanks [@yuki111888](https://github.com/yuki111888)! - Introduces `@vex-chat/cli`, a terminal client for signing in, chatting, browsing servers/channels/DMs, handling invites, and approving new devices.

    The `Storage` interface gains a new required `hasMessage(mailID: string): Promise<boolean>` method — custom `Storage` implementations must add it. The client now deduplicates inbound mail by `mailID` and applies a DH-ratchet fallback for first-inbound messages, fixing re-delivery and rare decrypt failures across reconnects. Spire exposes a new authenticated `GET /invite/:inviteID/preview` endpoint that returns the invite's server and channel list without consuming the invite.

## 6.4.1

### Patch Changes

- [#64](https://github.com/vex-protocol/vex-protocol/pull/64) [`c30d1f6`](https://github.com/vex-protocol/vex-protocol/commit/c30d1f6aa5f7d6cc8aff646fb422229db81cf6ad) Thanks [@yuki111888](https://github.com/yuki111888)! - Fixes slow client startup: OTK negotiation is now fire-and-forget so it no longer blocks login or app hydration by several seconds on mobile. Familiar lookups are now fetched in parallel instead of sequentially.

## 6.4.0

### Minor Changes

- [#62](https://github.com/vex-protocol/vex-protocol/pull/62) [`0f2e7ed`](https://github.com/vex-protocol/vex-protocol/commit/0f2e7ed578f47081a9cbf81627fc2303b7ccc7d9) Thanks [@yuki111888](https://github.com/yuki111888)! - Adds `ServerChannelBootstrap` type and schema to `@vex-chat/types`. Call `client.servers.retrieveWithChannels()` in `@vex-chat/libvex` to fetch all servers and their channels in a single request — useful for fast initial renders. Spire exposes the corresponding `GET /user/:id/servers/bootstrap` endpoint.

### Patch Changes

- Updated dependencies [[`0f2e7ed`](https://github.com/vex-protocol/vex-protocol/commit/0f2e7ed578f47081a9cbf81627fc2303b7ccc7d9)]:
    - @vex-chat/types@3.3.0
    - @vex-chat/crypto@6.0.0

## 6.3.2

### Patch Changes

- [#60](https://github.com/vex-protocol/vex-protocol/pull/60) [`e48c78b`](https://github.com/vex-protocol/vex-protocol/commit/e48c78bf8a8af73c0b1dc847f59a852fc0e996fa) Thanks [@yuki111888](https://github.com/yuki111888)! - Spire operators can now set `SPIRE_DISABLE_RATE_LIMITS=1` (or `true`) to bypass all rate limiting globally — useful for load-testing environments where a `DEV_API_KEY` is not appropriate. The libvex client now debounces session-heal attempts per sender device with a 30-second backoff and in-flight guard, preventing repeated `/keyBundle` hammering when a corrupt or unrecognised mail item triggers back-to-back decrypt failures.

## 6.3.1

### Patch Changes

- [#58](https://github.com/vex-protocol/vex-protocol/pull/58) [`eab38c0`](https://github.com/vex-protocol/vex-protocol/commit/eab38c04a21c219af7961741d7b8aa2144639e70) Thanks [@yuki111888](https://github.com/yuki111888)! - Add re-entrant `enterCryptoProfileScope` / `leaveCryptoProfileScope` so overlapping FIPS `readMail` work cannot reset the process-wide profile mid-await. Yield the JS thread while bulk-decrypting SQLite message history. Harden Spire stress integration (WS budgets, CI workflow) and trim integration client count for more reliable Actions runs.

## 6.3.0

### Minor Changes

- [#52](https://github.com/vex-protocol/vex-protocol/pull/52) [`a07c923`](https://github.com/vex-protocol/vex-protocol/commit/a07c9239d745debd923008ed710d6dffe761af77) Thanks [@yuki111888](https://github.com/yuki111888)! - Spire now enforces a 30-day server-side mail TTL: stale rows are pruned on startup and once daily, and inbox reads skip messages older than 30 days. libvex exports new retention helpers (`MAX_LOCAL_MESSAGE_RETENTION_DAYS`, `clampLocalMessageRetentionDays`, `formatVexRetentionEnvelope`, `stripVexRetentionEnvelope`) and automatically prunes local SQLite storage per a configurable 1–30-day window; set `retentionDays` in your client config to control per-device retention.

## 6.2.3

### Patch Changes

- [#50](https://github.com/vex-protocol/vex-protocol/pull/50) [`f6119c5`](https://github.com/vex-protocol/vex-protocol/commit/f6119c5c8bbaa3e9bacae8a4936a92e15380852e) Thanks [@yuki111888](https://github.com/yuki111888)! - Fix group DM delivery and inbound mail acknowledgements. Group messages now exclude the sender's own devices from the fan-out (preventing X3DH races that caused flaky early delivery), and throw when all peer devices fail rather than silently dropping the send. Read receipts are now sent only after a message is successfully decrypted, not on first receipt.

## 6.2.2

### Patch Changes

- [#48](https://github.com/vex-protocol/vex-protocol/pull/48) [`2755c10`](https://github.com/vex-protocol/vex-protocol/commit/2755c100a9859754142add626885d9acd6a78ba8) Thanks [@yuki111888](https://github.com/yuki111888)! - fix(libvex): silence WebSocket teardown races in OPEN handler and message dispatcher

    The 6.2.1 fix wrapped fire-and-forget `Client.send` callsites with
    `ignoreSocketTeardown`, but two paths still let `WebSocketNotOpenError`
    escape and surface as a red-screen error in React Native dev builds:
    - The `socket.on("open", ...)` listener calls `this.socket.send(authMsg)`
      _synchronously_. When a flaky network or 502-prone proxy cycles a
      connection rapidly, the queued OPEN event can dispatch after the
      socket has already started its next CONNECTING phase (or transitioned
      to CLOSING). The throw escapes the listener and React's
      `reactConsoleErrorHandler` reports it.
    - The `socket.on("message", ...)` listener used `void this.respond(msg)`,
      `void this.handleNotify(msg)`, and `void this.postAuth()` — discarding
      the returned promise. Any rejection (including the typed teardown
      error) became an unhandled rejection.

    This patch:
    1. Wraps the auth send in the OPEN handler with a try/catch that
       swallows `WebSocketNotOpenError` and lets the close handler drive
       recovery. Other errors still propagate.
    2. Replaces `void this.respond(msg)` / `void this.handleNotify(msg)` /
       `void this.postAuth()` with `.catch(ignoreSocketTeardown)` so the
       typed error is dropped silently and any other failure re-throws as
       before.

    No behavior change for healthy connections; only suppresses noise on
    mid-connection teardowns.

## 6.2.1

### Patch Changes

- [#44](https://github.com/vex-protocol/vex-protocol/pull/44) [`4047a34`](https://github.com/vex-protocol/vex-protocol/commit/4047a34225dd7ab165ae37b56337dbecf45aee93) Thanks [@yuki111888](https://github.com/yuki111888)! - Stop leaking `INVALID_STATE_ERR` from teardown races as unhandled
  promise rejections. The transport adapter now gates `send()` on
  `readyState`, throws a typed `WebSocketNotOpenError` when the socket
  isn't OPEN, and translates the platform's opaque
  `DOMException("INVALID_STATE_ERR")` into the same typed error when
  native state transitions inside the synchronous send call. All
  fire-and-forget callsites (`ping`, `pong`, auth challenge
  `response`, mail receipts) now `.catch()` that typed error and drop
  the frame; request/response callsites (mail handshake,
  `sendMessage`) forward it to the outer promise so callers don't
  hang for the 30s send-loop timeout.

    Fixes the "entire app freezes during passkey registration / app
    foregrounding / network swap" UX where the OS pauses the radio,
    React Native's bridge dispatches a queued `websocketMessage` and
    `websocketClosed` back-to-back, our `ping`/`pong` runs against the
    already-CLOSING socket, and the resulting unhandled rejection
    red-screens the dev build (and shows up as a noisy `console.error`
    in production). The socket itself is unaffected — the recovery
    loop in the consumer (vex-ui store) continues to handle the
    disconnect; we just stop logging the inevitable race as a fatal
    error.

## 6.2.0

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

## 6.1.9

### Patch Changes

- [#36](https://github.com/vex-protocol/vex-protocol/pull/36) [`4835c81`](https://github.com/vex-protocol/vex-protocol/commit/4835c81c181e9cf122077315575707f2a377a93e) Thanks [@yuki111888](https://github.com/yuki111888)! - Pending device-approval responses now include the existing user's `userID`. Spire returns it from `createPendingDeviceEnrollmentRequest`, the `RegisterPendingApprovalCodec` accepts it (optional for back-compat with older servers), and `DeviceApprovalRequiredError` / `PendingDeviceRegistration` expose it as `userID`. This lets a new, still-unauthenticated device fetch the public avatar via `/avatar/:userID` and surface an "is this you?" confirmation before continuing the approval dance. Purely additive; older servers/clients that omit the field continue to work.

## 6.1.8

### Patch Changes

- [#34](https://github.com/vex-protocol/vex-protocol/pull/34) [`3f8db96`](https://github.com/vex-protocol/vex-protocol/commit/3f8db96f7943e108ccc4e84bc64f5db2622b1857) Thanks [@yuki111888](https://github.com/yuki111888)! - Usernames are now case-insensitive: registration and login fold the provided username to lowercase, so `User` and `user` resolve to the same account. `client.randomUsername()` returns lowercase words to match the canonical form. No migration required — existing mixed-case rows remain accessible under any-case input.

## 6.1.7

### Patch Changes

- [#32](https://github.com/vex-protocol/vex-protocol/pull/32) [`38fb6ba`](https://github.com/vex-protocol/vex-protocol/commit/38fb6ba443b8241badaebca26082c180249c2dd7) Thanks [@yuki111888](https://github.com/yuki111888)! - Fix the WebSocket keep-alive detector so half-open sockets actually trigger a reconnect. `Client.ping()` already detected a missing pong (the `if (!this.isAlive)` branch), but the body was empty, so when a network path silently dropped the flow without a TCP FIN reaching the client (typical on Android emulators, sleeping mobile radios, and aggressive carrier-grade NAT) the SDK kept firing pings into a dead socket forever and never emitted the `disconnect` event consumers listen for. The branch now closes the socket so the existing `close` handler clears the ping interval and emits `disconnect`, restoring the recovery path. Also resets `isAlive` to `true` on every socket `open` so a reconnect doesn't inherit `false` from the previous session and tear itself down on the next ping cycle.

## 6.1.6

### Patch Changes

- [#27](https://github.com/vex-protocol/vex-protocol/pull/27) [`2e22e8e`](https://github.com/vex-protocol/vex-protocol/commit/2e22e8e03148a4d85e6f1aa1eaebff76dd33e0a0) Thanks [@yuki111888](https://github.com/yuki111888)! - Add an end-to-end harness test for `client.me.setAvatar(...)` that exercises the JSON/base64 upload path. Verifies the avatar upload keeps working in React Native/Hermes-style runtimes where `FormData` is unavailable, and guards against regressions on platforms that can't construct a `Blob` from an `ArrayBufferView`.

## 6.1.5

### Patch Changes

- [#24](https://github.com/vex-protocol/vex-protocol/pull/24) [`a99d824`](https://github.com/vex-protocol/vex-protocol/commit/a99d824bdb2420273bc3543a085b423b851fa4e1) Thanks [@yuki111888](https://github.com/yuki111888)! - Fix avatar upload in React Native/Hermes and other runtimes where `new Blob([Uint8Array])` throws. The SDK now detects the failure and falls back to the JSON/base64 avatar endpoint automatically — no changes required on your end.

- [#24](https://github.com/vex-protocol/vex-protocol/pull/24) [`6d0eee5`](https://github.com/vex-protocol/vex-protocol/commit/6d0eee5041a87ea32a90e259e60628b04d0fcde3) Thanks [@yuki111888](https://github.com/yuki111888)! - Fallback avatar uploads to JSON/base64 when Blob(ArrayBufferView) is unsupported at runtime (notably React Native/Hermes), while preserving multipart uploads where supported.

## 6.1.4

### Patch Changes

- [#22](https://github.com/vex-protocol/vex-protocol/pull/22) [`caee995`](https://github.com/vex-protocol/vex-protocol/commit/caee9955c024b80bd9a2ccf78b5db3b5d62f3339) Thanks [@yuki111888](https://github.com/yuki111888)! - Add an unauthenticated path for a pending device-enrollment requester to learn its own approval status.

    A new device that registers against an existing username gets back a 202 with `{ requestID, challenge }` but cannot authenticate until an existing signed-in device approves it. Previously the only status endpoint required a user token, so the new device had no way to learn it had been approved.
    - spire: new `POST /user/devices/requests/:requestID/poll` accepts `{ signed }` (the requesting device's signature over the original challenge), opens it with the pending request's stored `signKey`, and returns the request status (and `approvedDeviceID` once approved). No token required.
    - libvex: `Client.register` now throws a typed `DeviceApprovalRequiredError` (carrying `requestID`, `challenge`, and `expiresAt`) when the server returns a pending-approval response, and `Client.devices.pollPendingRegistration({ requestID, challenge })` calls the new endpoint, signing the challenge with the local secret signing key.

    The new device can then loop on `pollPendingRegistration` and, once status flips to `approved`, call the existing `loginWithDeviceKey(approvedDeviceID)` to complete login.

## 6.1.3

### Patch Changes

- [#20](https://github.com/vex-protocol/vex-protocol/pull/20) [`c23fb75`](https://github.com/vex-protocol/vex-protocol/commit/c23fb750a85599970a72bc53efdd0662a5a0703b) Thanks [@yuki111888](https://github.com/yuki111888)! - Harden multi-device enrollment by binding approval signatures to both the pending request ID and requesting device signKey, and improve `/register` duplicate-constraint detection so existing-account enrollments return pending approval instead of an internal server error.

## 6.1.2

### Patch Changes

- [`a43fbc9`](https://github.com/vex-protocol/vex-protocol/commit/a43fbc92248bb3c9ca94f1ca2cc526c5d9fd2513) Thanks [@yuki111888](https://github.com/yuki111888)! - Fix register/login compatibility across legacy and key-cluster Spire responses, including storing auth token/device from modern `/register` and falling back to legacy register+login when needed.

- [`f9ac7ca`](https://github.com/vex-protocol/vex-protocol/commit/f9ac7ca29aea760c319ab278ab29f997399eaf5b) Thanks [@yuki111888](https://github.com/yuki111888)! - Treat duplicate-username `/register` attempts as pending device-approval requests so second devices can be confirmed from an existing session, and add SDK decoding support for the pending approval register response.

## 6.1.1

### Patch Changes

- [`65c6d0a`](https://github.com/vex-protocol/vex-protocol/commit/65c6d0ac046126b729d00cb1e47615f513915dab) Thanks [@yuki111888](https://github.com/yuki111888)! - Refresh internal dependency alignment with `@vex-chat/crypto@4.0.1` for the SDK and server packages.

## 6.1.0

### Minor Changes

- [#14](https://github.com/vex-protocol/vex-protocol/pull/14) [`bd8ce8e`](https://github.com/vex-protocol/vex-protocol/commit/bd8ce8e4f0fecd25b81e9dba2211400644814887) Thanks [@yuki111888](https://github.com/yuki111888)! - `username` and `password` are now optional for registration. Clients can call `client.register()` with no arguments to register via keypair alone — a username is auto-generated from the signing key if omitted. `DevicePayload.username` and `RegistrationPayload.password` are now `string | undefined` in `@vex-chat/types`; update any code that assumed these fields are always present.

### Patch Changes

- Updated dependencies [[`bd8ce8e`](https://github.com/vex-protocol/vex-protocol/commit/bd8ce8e4f0fecd25b81e9dba2211400644814887)]:
    - @vex-chat/types@3.1.0
    - @vex-chat/crypto@4.0.0

## 6.0.2

### Patch Changes

- [#13](https://github.com/vex-protocol/vex-protocol/pull/13) [`ffebe34`](https://github.com/vex-protocol/vex-protocol/commit/ffebe34baaa9d2c31f583b8841bbd898593ac4ba) Thanks [@yuki111888](https://github.com/yuki111888)! - Harden the Double Ratchet skipped-key handling by enforcing bounded skip windows and capped skipped-key storage.
  Also sanitize persisted skipped-key parsing so malformed or non-hex entries are discarded during session hydration.

- [#11](https://github.com/vex-protocol/vex-protocol/pull/11) [`0256683`](https://github.com/vex-protocol/vex-protocol/commit/02566831dbc29b6bd18a11a2e12e81d5dbfeded3) Thanks [@yuki111888](https://github.com/yuki111888)! - The Double Ratchet implementation now enforces a maximum skip window of 1,024 messages and caps stored skipped keys at 4,096 entries; attempts to advance the ratchet beyond these bounds throw an error instead of accumulating unbounded state. Skipped-key parsing is also stricter, rejecting entries with malformed hex or key-ID format.

## 6.0.1

### Patch Changes

- [#9](https://github.com/vex-protocol/vex-protocol/pull/9) [`e2355e7`](https://github.com/vex-protocol/vex-protocol/commit/e2355e78618e7c995aa3a95ead9613821231792e) Thanks [@yuki111888](https://github.com/yuki111888)! - Fix Double Ratchet session initialization and message emission: both initiator and receiver now derive the initial chain key from the same HKDF label, the receiver's `CKr` is correctly seeded on session start, DHr is set on the first inbound ratchet step, and empty handshake payloads no longer surface as spurious entries in the `message` event stream.

## 6.0.0

### Major Changes

- [#7](https://github.com/vex-protocol/vex-protocol/pull/7) [`6de0018`](https://github.com/vex-protocol/vex-protocol/commit/6de001880ea5fa761211cc17c86d4aaa4ddb9425) Thanks [@yuki111888](https://github.com/yuki111888)! - Add Signal-style Double Ratchet support for post-X3DH direct messages.

    `@vex-chat/libvex` now uses per-message ratchet keys and persists ratchet state
    (root key, chain keys, DH ratchet state, counters, skipped keys). `@vex-chat/types`
    adds ratchet header/session fields required by this strict protocol break.

    `@vex-chat/spire` continues to store and forward `mail.extra` as opaque client
    metadata to support ratchet and future protocol extensions.

### Minor Changes

- [#7](https://github.com/vex-protocol/vex-protocol/pull/7) [`06bb384`](https://github.com/vex-protocol/vex-protocol/commit/06bb38498d370babf203699aff44e9ff49fa2e5f) Thanks [@yuki111888](https://github.com/yuki111888)! - Messaging sessions now use a Double Ratchet algorithm for per-message forward secrecy. `@vex-chat/types` exports `RatchetHeader` and `RatchetHeaderSchema` for the new subsequent-mail header format; `@vex-chat/libvex`'s `SessionCrypto` gains ratchet state fields (`RK`, `CKs`, `CKr`, `DHsPublic`, `DHsPrivate`, `DHr`, `Ns`, `Nr`, `PN`, `skippedKeys`, `verified`).

### Patch Changes

- Updated dependencies [[`06bb384`](https://github.com/vex-protocol/vex-protocol/commit/06bb38498d370babf203699aff44e9ff49fa2e5f), [`6de0018`](https://github.com/vex-protocol/vex-protocol/commit/6de001880ea5fa761211cc17c86d4aaa4ddb9425)]:
    - @vex-chat/types@3.0.0
    - @vex-chat/crypto@3.0.0

## 5.5.2

### Patch Changes

- [#4](https://github.com/vex-protocol/vex-protocol/pull/4) [`f0ae11e`](https://github.com/vex-protocol/vex-protocol/commit/f0ae11e1f6bcc559a122533a760d25c2513e34bf) Thanks [@yuki111888](https://github.com/yuki111888)! - Session-heal retry signals now emit through a dedicated `retryRequest` client event instead of the chat `message` stream. This prevents decrypt-failure recovery paths from surfacing as empty chat messages in client UIs.

## 5.5.1

### Patch Changes

- [#2](https://github.com/vex-protocol/vex-protocol/pull/2) [`1680fa8`](https://github.com/vex-protocol/vex-protocol/commit/1680fa8824db3578f40f8a446cc228dfed32cc9f) Thanks [@yuki111888](https://github.com/yuki111888)! - Session recovery after a failed subsequent-mail decrypt no longer puts a `RETRY_REQUEST:<mailID>` string in the healing initial message; the initial mail still re-establishes the session with empty plaintext.

## 5.5.0

### Minor Changes

- 0a9865c: `Client` now exposes a `syncInboxNow(): Promise<void>` method that triggers an immediate `/mail` fetch. Call it on mobile foreground resume (or any other moment where the background poll may have been paused) to pull in pending messages without waiting for the next scheduled tick.

## 5.4.0

### Minor Changes

- d14c685: `Client` now exposes a `syncInboxNow(): Promise<void>` method that triggers an immediate `/mail` fetch. Call it on mobile foreground resume (or any other moment where the background poll may have been paused) to pull in pending messages without waiting for the next scheduled tick.

## 5.3.1

### Patch Changes

- e7fef67: - **Security:** depend on `uuid@14.0.0+` to address [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) (buffer bounds in v3/v5/v6 with user-supplied `buf`).

## 5.3.0

### Minor Changes

- 5c65c54: `ClientOptions` now accepts an optional `cryptoProfile` field (`"tweetnacl"` or `"fips"`); when set to `"fips"`, the client uses P-256 + Web Crypto primitives instead of Ed25519/X25519 (tweetnacl). Pass `cryptoProfile: "fips"` consistently across all peers and the server — the two profiles do not interoperate. Three new async helpers are also exposed: `Client.generateSecretKeyAsync()` (required in fips mode), `Client.encryptKeyDataAsync()`, and `Client.decryptKeyDataAsync()`.

## 5.2.0

### Minor Changes

- 50b091e: `ClientOptions` now accepts an optional `devApiKey` string; when set, it is sent as `x-dev-api-key` on every HTTP request (intended for local/load-testing against a dev spire — do not use in production). Device-list fetches now retry with exponential backoff rather than throwing immediately, making `sendMessage` more resilient on flaky connections.

## 5.1.0

### Minor Changes

- 4293311: `ClientOptions` now accepts an optional `devApiKey` string; when set, it is sent as `x-dev-api-key` on every HTTP request (intended for local/load-testing against a dev spire — do not use in production). Device-list fetches now retry with exponential backoff rather than throwing immediately, making `sendMessage` more resilient on flaky connections.

## 5.0.0

### Major Changes

- b3c57e8: `NodeKeyStore` now requires a `passphrase` string as its first constructor argument; credentials are encrypted at rest using this passphrase. Pass the same passphrase on every instantiation to read previously saved credentials. Additionally, `ClientOptions.logger`, `ClientOptions.logLevel`, and `ClientOptions.dbLogLevel` have been removed — the client no longer exposes a configurable logger interface.

## 4.0.0

### Major Changes

- 0b04f76: `NodeKeyStore` now requires a `passphrase` string as its first constructor argument; credentials are encrypted at rest using this passphrase. Pass the same passphrase on every instantiation to read previously saved credentials. Additionally, `ClientOptions.logger`, `ClientOptions.logLevel`, and `ClientOptions.dbLogLevel` have been removed — the client no longer exposes a configurable logger interface.

## 2.0.0

### Major Changes

- b1d4d0a: First post-dormancy major release, aligned with `@vex-chat/types@2.0.0`, `@vex-chat/crypto@2.0.0`, and `@vex-chat/spire@1.0.0`. Consumers should treat this as a rewrite and re-integrate end-to-end rather than an in-place upgrade — the wire protocol, type shapes, transport layer, and authentication flow have all changed.

    ### Stack
    - **Pure ESM** (`type: "module"`). Previously CommonJS.
    - **Node `>=24.0.0`, npm `>=10.0.0`** engines. Previously unspecified.
    - **npm** enforced as the only package manager (`preinstall: npx only-allow npm`).
    - **TypeScript 6.0.2** with the full strict flag set (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `verbatimModuleSyntax`, `isolatedModules`). Zero `any`, zero `eslint-disable`, zero non-null assertions.
    - **Multiple subpath exports** under one package: `.`, `./preset/node`, `./preset/test`, `./storage/node`, `./storage/sqlite`, `./storage/schema`, `./keystore/node`, `./keystore/memory`. Browser bundles never pull in `better-sqlite3` or other native modules.

    ### Wire protocol / types
    - **Re-exported types now come from `@vex-chat/types@2.0.0`.** Consumers that imported `Invite` (or any other re-exported type from libvex) get the new shape: `I` prefix dropped (`IInvite` → `Invite`), date fields now ISO 8601 strings on the wire instead of `Date` objects.
    - **`ISucessMsg` typo fixed** to `SuccessMsg` upstream — propagates through.
    - **All wire reads parsed through Zod schemas** at trust boundaries via `createCodec()` — invalid server responses now reject at the codec instead of crashing further down the call stack.
    - **`KeyStore` and `StoredCredentials`** moved here from `@vex-chat/types` (those types are platform-storage concerns, not wire types).

    ### Cryptographic primitives
    - **`@vex-chat/crypto@2.0.0`** is now the only crypto dep. Previously libvex pulled `tweetnacl` directly; that and several other transitive deps are gone — see "Removed dependencies" below.

    ### Authentication & transport
    - **Per-client HTTP transport with Bearer auth.** Previously libvex relied on shared cookies via global HTTP client defaults. Now each `Client` instance gets its own transport and authenticates via `Authorization: Bearer <token>`. Consumers no longer need to share cookie state between clients in the same process. (ADR-008)
    - **Post-connection WebSocket auth.** The WS handshake now negotiates auth after the socket opens, with an event-loop yield in between, fixing a race that broke auth on slow connections. (ADR-006)
    - **`Client.loginWithDeviceKey()`** — passwordless auto-login using a previously-registered device key. Skips the `register` + `login` round-trip on subsequent app launches. (ADR-007)
    - **`Client.deleteAllData()`** — public method that purges message history, encryption sessions, and prekeys, then closes the client. Credentials (keychain entries) must still be cleared by the embedding app.

    ### Storage & key management
    - **`PreKeysCrypto.index`** is now required (was nullable). The `UnsavedPreKey` type covers the brief pre-DB state. Eliminates a class of "index missing" runtime checks downstream.
    - **Tauri-compatible prekey index retrieval** — falls back from `RETURNING` clauses to a `SELECT … WHERE publicKey = ?` query for SQLite drivers that don't expose `insertId`.
    - **`SqliteStorage` write-after-close errors** are now suppressed instead of crashing the process when a client is closed mid-write.
    - **Negative cache for user lookups** — failed `getUser` calls cache the 404 for 30 minutes instead of retrying in a tight loop.

    ### Codec / wire framing
    - **`createCodec()` factory** for type-safe msgpack encode/decode, paired with a Zod schema for runtime validation on the decode path.
    - **`send()` accepts only `Uint8Array`.** Previously the WebSocket adapter accepted strings too — that path was only used by the old cookie-auth handshake which is now gone.

    ### Browser safety
    - **Static "no-Buffer / no-node-builtin" check in vitest browser projects.** A vitest plugin scans the bundled output for `\bBuffer\b` / `\bprocess\b` / unprefixed node builtins and fails the browser project on any match. Caught a real Buffer reference in `codecs.ts` during this work.
    - **`browser-or-node` dependency removed** — replaced with feature detection at the call sites that needed it.
    - **`navigator.userAgent` guard** — undefined on React Native, was crashing client init on RN.

    ### Removed dependencies

    These are no longer in libvex's `dependencies` (some moved to peer, some replaced, some unused):
    - `tweetnacl` — replaced by `@vex-chat/crypto`
    - `ws` — replaced by the runtime-native WebSocket (browser, node 24+, RN)
    - `sleep` / `sleep-promise` — replaced by inline `await new Promise(r => setTimeout(r, ms))`
    - `picocolors` — unused
    - `object-hash` — unused
    - `browser-or-node` — replaced by feature detection

    ### Removed presets
    - **`./preset/tauri` and `./preset/expo` are gone.** Platform-specific code (Tauri's `@tauri-apps/plugin-sql`, Expo's `expo-sqlite`) lives in the consuming app now, not in libvex. Apps targeting these platforms should:
        1. Import `Client` from `@vex-chat/libvex` directly
        2. Implement `Storage` (the schema is exported from `@vex-chat/libvex/storage/schema`)
        3. Implement `KeyStore`
        4. Pass both into `Client.create(secretKey, options, storage, keystore)`

        See the README and the in-repo `./preset/node` / `./preset/test` implementations for reference.

    ### Testing infrastructure
    - **Vitest projects** — `npm test` runs the unit suite (browser-safe, offline), `npm run test:e2e` runs the node + browser e2e suites against a real spire.
    - **Property-based round-trip tests** for the msgpack codec via `fast-check`.
    - **Shared test harness** — node, browser, and (formerly Tauri/Expo) suites all run through one shared describe block, parameterized by storage and keystore.

    ### Build / tooling / CI
    - **`@arethetypeswrong/cli`, `publint`, `@microsoft/api-extractor`** all run on every PR, with the api-extractor report committed at `api/libvex.api.md` so reviewers see public API surface drift in PR diffs.
    - **Changesets release flow** — `changeset` files in `.changeset/`, automatic release PRs from `release.yml` on master, npm publish with `--provenance` and SBOM upload.
    - **Auto-changeset workflow** — Claude reads `AGENTS.md`, the recent CHANGELOG entries, the PR's commits, and a byte-diff between the PR's freshly-built `dist/` and the published tarball, then writes (or skips writing) a changeset.
    - **Parallel CI jobs** gated by a `CI OK` aggregator: `build`, `test`, `lint`, `types`, `library-quality`, `supply-chain`, `changeset`, `e2e-prod`. Build/test run on ubuntu/macos/windows because `better-sqlite3` and the kysely migration provider have caught real Windows-only failures.
    - **Supply-chain hardening** — every action pinned by SHA, `step-security/harden-runner` on every job, `persist-credentials: false` on every checkout, weekly CodeQL + Scorecard scans, npm `--ignore-scripts` everywhere except where `better-sqlite3` legitimately needs build scripts.
    - **License allowlist gate**, type coverage ≥95%.

## 1.1.0

Auth and transport overhaul, plus a vitest workspace that finally runs the node and browser suites in one command. Three ADRs landed in this release:

### ADR-006: post-connection WebSocket auth

The WS handshake used to negotiate auth before the socket was fully open, which raced against the connection upgrade on slow links and silently dropped auth messages. The new flow opens the socket first, yields the event loop, then sends the auth frame on the established connection.

### ADR-007: passwordless device login

New `Client.loginWithDeviceKey()` method. After a one-time `register` + `login` round-trip, the device's persistent key is enough to re-authenticate without a password on subsequent app launches. Apps that need biometric or PIN gating can wrap this however they like — libvex just needs the device key.

### ADR-008: per-client HTTP transport with Bearer auth

Previously every `Client` instance shared global HTTP client defaults and authenticated via cookies. That meant:

- Multiple `Client` instances in one process collided on auth state.
- Cookie handling needed simulation in test transports.
- Browser cookie policies (SameSite, third-party blocking) were a constant source of friction.

Now each `Client` gets its own HTTP transport and authenticates via `Authorization: Bearer <token>` on every REST call. Cookies are gone from the libvex codebase entirely. Test transports lost their cookie-simulation layer as a side benefit.

### Other features

- **`deviceName` on `PlatformPreset`** — labels for the device that show up in the UI's device list. Cross-platform: Node uses `os.hostname()`, browsers use a sanitized `navigator.userAgent`, React Native passes its own.
- **Vitest workspace** — `npm test` runs the node + browser projects together via a single `vitest run` invocation. Previously each project had its own command and CI ran them in series.
- **Multi-device test coverage** — new e2e tests for two-user DM (full X3DH key exchange), group messaging across users, channel/server/invite CRUD, file/emoji/avatar upload, and `loginWithDeviceKey` round-tripping.

### Fixes

- **`navigator.userAgent` is undefined on React Native** — the previous client init crashed on RN because it tried to read `userAgent` unconditionally. Now guarded.
- **`SqliteStorage` write-after-close errors** are caught and logged instead of bubbling out of an async event handler and crashing the process.
- **Device challenge response decode** — the server frames the challenge response as msgpack, libvex was decoding it as JSON. Wire mismatch silently failed `loginWithDeviceKey` until this fix.
- **`loginWithDeviceKey` accepts an explicit `deviceID`** parameter for callers that want to log in as a specific device rather than "the most recently used one."

### Refactors

- **Test helpers extracted** to a shared module — listener leak fixes, `describe.sequential` for ordered suites, common setup/teardown.
- **Three platform tests collapsed into two** (node + browser); the obsolete Tauri suite is gone — that work moved to ADR-009 in this branch's successor.
- **Test transports simplified** — cookie simulation removed (ADR-008 made it unnecessary), file/emoji/avatar tests moved into the shared suite so they cover both projects.

## 1.0.2

Initial post-dormancy patch line — see the git history for `121c826..1.0.0` for the per-commit detail. The 1.0.x series re-cut the published package off the modern tree (TypeScript 6, ESM, Node 24+) but still depended on the pre-2.0 wire types and pre-2.0 crypto primitives. 1.1.0 above is the first release where the new auth flow lands; 2.0.0 (next) is the first release on the post-Zod wire protocol.
