---
"@vex-chat/cli": patch
"@vex-chat/libvex": minor
"@vex-chat/spire": minor
---

Introduces `@vex-chat/cli`, a terminal client for signing in, chatting, browsing servers/channels/DMs, handling invites, and approving new devices.

The `Storage` interface gains a new required `hasMessage(mailID: string): Promise<boolean>` method — custom `Storage` implementations must add it. The client now deduplicates inbound mail by `mailID` and applies a DH-ratchet fallback for first-inbound messages, fixing re-delivery and rare decrypt failures across reconnects. Spire exposes a new authenticated `GET /invite/:inviteID/preview` endpoint that returns the invite's server and channel list without consuming the invite.
