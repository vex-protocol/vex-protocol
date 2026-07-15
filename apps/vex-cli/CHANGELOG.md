# @vex-chat/cli

## 0.6.1

### Patch Changes

- Updated dependencies [[`fa3fab0`](https://github.com/vex-protocol/vex-protocol/commit/fa3fab0a60d91996994cd9785a1faa0c8392947c)]:
    - @vex-chat/libvex@10.0.0

## 0.6.0

### Minor Changes

- [#272](https://github.com/vex-protocol/vex-protocol/pull/272) [`09d23d4`](https://github.com/vex-protocol/vex-protocol/commit/09d23d4b3dab801b324780a30c2080eddbd4fcf4) Thanks [@yuki111888](https://github.com/yuki111888)! - Harden authentication, key handling, and server authorization for the greenfield protocol. Passwords use Argon2id server-side with a modern length and blocklist policy, current-password changes and fresh-passkey resets have explicit proof requirements, bearer sessions are scope-bound and shorter lived, passkeys require user verification, device clusters are bounded and revalidated, and legacy credential and wire fallbacks are removed. The CLI now requests explicit password-backed enrollment for new devices and redacts unexpected command failures.

    Domain-separate X3DH prekey signatures, derive independent message encryption and authentication subkeys, use fresh local-storage nonces with purpose-separated at-rest keys, validate encrypted key envelopes before PBKDF2, run async key wrapping through native Web Crypto where available, redact credentials from HTTP errors, and update vulnerable production dependencies.

### Patch Changes

- Updated dependencies [[`09d23d4`](https://github.com/vex-protocol/vex-protocol/commit/09d23d4b3dab801b324780a30c2080eddbd4fcf4)]:
    - @vex-chat/libvex@9.0.0

## 0.5.0

### Minor Changes

- [#261](https://github.com/vex-protocol/vex-protocol/pull/261) [`bce7127`](https://github.com/vex-protocol/vex-protocol/commit/bce7127455a3b35e7e7254b5740404cda4702517) Thanks [@yuki111888](https://github.com/yuki111888)! - New account registration requires an explicit password again; passkeys are optional credentials that can be enrolled after signup. Call `client.register(username, password)` for new accounts, and use `vex auth register <username> <password>` or `--password` in the CLI. Spire no longer blocks device connect while an account has no passkeys, but existing accounts can still request device approval without supplying a password.

### Patch Changes

- Updated dependencies [[`bce7127`](https://github.com/vex-protocol/vex-protocol/commit/bce7127455a3b35e7e7254b5740404cda4702517)]:
    - @vex-chat/libvex@8.0.0

## 0.4.0

### Minor Changes

- [#258](https://github.com/vex-protocol/vex-protocol/pull/258) [`b543820`](https://github.com/vex-protocol/vex-protocol/commit/b5438201765efdb7366928478a44632bb7224a3d) Thanks [@dream9x](https://github.com/dream9x)! - Adds App Store and Google Play subscription verification across the stack. `@vex-chat/types` exports new billing schemas and types (`BillingProduct`, `BillingSubscription`, `BillingAccountState`, `AppleTransactionVerificationRequest`, `GooglePurchaseVerificationRequest`, and related validators); `@vex-chat/libvex` exposes a `client.billing` API for fetching the product catalog, retrieving subscription state, and submitting store transactions for server-side verification; `@vex-chat/spire` gains billing verification endpoints and the backing database schema and migration; `@vex-chat/cli` adds an `entitlements` command to inspect account subscription state from the terminal.

### Patch Changes

- Updated dependencies [[`b543820`](https://github.com/vex-protocol/vex-protocol/commit/b5438201765efdb7366928478a44632bb7224a3d)]:
    - @vex-chat/libvex@7.4.0

## 0.3.0

### Minor Changes

- [#208](https://github.com/vex-protocol/vex-protocol/pull/208) [`fe49ae6`](https://github.com/vex-protocol/vex-protocol/commit/fe49ae6a993e6c8953ac9666e6a19cee8bf00676) Thanks [@yuki111888](https://github.com/yuki111888)! - Add browser-assisted passkey setup/login for CLI accounts, including first-passkey registration during signup and configurable passkey page URLs for deployments whose WebAuthn page is hosted separately from the API.

### Patch Changes

- [#211](https://github.com/vex-protocol/vex-protocol/pull/211) [`d674179`](https://github.com/vex-protocol/vex-protocol/commit/d674179150bb55e285e0c6d143afb69d17714c56) Thanks [@yuki111888](https://github.com/yuki111888)! - Decode msgpack error responses so passkey-required registration can launch the browser setup flow instead of surfacing a generic HTTP 403.

## 0.2.0

### Minor Changes

- [#209](https://github.com/vex-protocol/vex-protocol/pull/209) [`c6bf509`](https://github.com/vex-protocol/vex-protocol/commit/c6bf5093b205e106026521c2994e6694c5d32518) Thanks [@yuki111888](https://github.com/yuki111888)! - Add browser-assisted passkey setup/login for CLI accounts, including first-passkey registration during signup and configurable passkey page URLs for deployments whose WebAuthn page is hosted separately from the API.

## 0.1.6

### Patch Changes

- Updated dependencies [[`bdb4e87`](https://github.com/vex-protocol/vex-protocol/commit/bdb4e87e819a3c2310c056b77abfd66800ba2758), [`c5526a8`](https://github.com/vex-protocol/vex-protocol/commit/c5526a84404c1ed92f1283c9b56cf996c42e260d), [`2c049ff`](https://github.com/vex-protocol/vex-protocol/commit/2c049ff31bf36102953db26a9c7e39a6da2681e8), [`69d369a`](https://github.com/vex-protocol/vex-protocol/commit/69d369aeb0f12855559d30788c77deae325dbf5c), [`270a40e`](https://github.com/vex-protocol/vex-protocol/commit/270a40ed341ddc0c55c118e8d5c99fd6dfb2ca38), [`a27c2f6`](https://github.com/vex-protocol/vex-protocol/commit/a27c2f6a62c2545475d6456dde8a9a81629d88f5)]:
    - @vex-chat/libvex@7.0.0

## 0.1.5

### Patch Changes

- [#172](https://github.com/vex-protocol/vex-protocol/pull/172) [`d11382f`](https://github.com/vex-protocol/vex-protocol/commit/d11382ffb928363f5da022cf0dac0a067ea5ccde) Thanks [@yuki111888](https://github.com/yuki111888)! - If a stored device was removed from the account server-side, the CLI now drops the dead local account entry and `vex auth login <username>` starts fresh device approval instead of surfacing a raw 404.

- Updated dependencies [[`d11382f`](https://github.com/vex-protocol/vex-protocol/commit/d11382ffb928363f5da022cf0dac0a067ea5ccde)]:
    - @vex-chat/libvex@6.7.0

## 0.1.4

### Patch Changes

- [#156](https://github.com/vex-protocol/vex-protocol/pull/156) [`bb6f126`](https://github.com/vex-protocol/vex-protocol/commit/bb6f126c79c1dcfbdbb45aa17ae02305a0d87be2) Thanks [@yuki111888](https://github.com/yuki111888)! - Accounts are now stored and resolved by `username@host` key, so credentials for one server are never reused when connecting to a different host. Existing accounts are migrated automatically on first use.

## 0.1.3

### Patch Changes

- [#116](https://github.com/vex-protocol/vex-protocol/pull/116) [`f90748d`](https://github.com/vex-protocol/vex-protocol/commit/f90748db61eb2438fd8beb999aeff9ed32da8aed) Thanks [@yuki111888](https://github.com/yuki111888)! - Publish the terminal CLI to npm as `@vex-chat/cli`, including the `vex-chat` binary and the same OIDC-backed provenance release flow as the other Vex packages.

- Updated dependencies [[`517ea9b`](https://github.com/vex-protocol/vex-protocol/commit/517ea9b478c0f816cc76dd62bcd49e16a1ab890a), [`bf11197`](https://github.com/vex-protocol/vex-protocol/commit/bf11197978cca3cf9c87b10e133b680b5348ee9c)]:
    - @vex-chat/libvex@6.6.0

## 0.1.2

### Patch Changes

- [`a9653d7`](https://github.com/vex-protocol/vex-protocol/commit/a9653d7b461678aec35e000f539d0d2c13298b73) Thanks [@yuki111888](https://github.com/yuki111888)! - Marks the CLI package private so release automation does not publish it until npm trusted publishing is configured.

## 0.1.1

### Patch Changes

- [`95b6680`](https://github.com/vex-protocol/vex-protocol/commit/95b6680ac3658a83f2ecb68e4ccaa02f90c3f823) Thanks [@yuki111888](https://github.com/yuki111888)! - Introduces `@vex-chat/cli`, a terminal client for signing in, chatting, browsing servers/channels/DMs, handling invites, and approving new devices.

    The `Storage` interface gains a new required `hasMessage(mailID: string): Promise<boolean>` method — custom `Storage` implementations must add it. The client now deduplicates inbound mail by `mailID` and applies a DH-ratchet fallback for first-inbound messages, fixing re-delivery and rare decrypt failures across reconnects. Spire exposes a new authenticated `GET /invite/:inviteID/preview` endpoint that returns the invite's server and channel list without consuming the invite.

- Updated dependencies [[`95b6680`](https://github.com/vex-protocol/vex-protocol/commit/95b6680ac3658a83f2ecb68e4ccaa02f90c3f823)]:
    - @vex-chat/libvex@6.5.0
