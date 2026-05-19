# @vex-chat/cli

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
