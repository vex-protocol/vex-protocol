# @vex-chat/cli

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
