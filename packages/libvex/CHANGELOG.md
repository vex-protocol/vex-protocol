# @vex-chat/libvex

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
    - **Per-client axios with Bearer auth.** Previously libvex relied on shared cookies via the global `axios` default. Now each `Client` instance gets its own `AxiosInstance` and authenticates via `Authorization: Bearer <token>`. Consumers no longer need to share cookie state between clients in the same process. (ADR-008)
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

### ADR-008: per-client axios with Bearer auth

Previously every `Client` instance shared the global `axios` default and authenticated via cookies. That meant:

- Multiple `Client` instances in one process collided on auth state.
- Cookie handling needed simulation in test transports.
- Browser cookie policies (SameSite, third-party blocking) were a constant source of friction.

Now each `Client` gets its own `AxiosInstance` and authenticates via `Authorization: Bearer <token>` on every REST call. Cookies are gone from the libvex codebase entirely. Test transports lost their cookie-simulation layer as a side benefit.

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
