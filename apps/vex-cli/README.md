# @vex-chat/cli

Terminal chat client for Vex backed by `@vex-chat/libvex`.

```sh
pnpm vex
```

On first run, `vex` prompts for a username and registers a local device key.
After that it opens straight into a live chat session.

Inside the app:

- `/menu` opens a guided menu
- `/home` shows your numbered server list and channel picker
- `/accounts` lists local users on this machine
- `/dm` asks who to message
- `/join` asks which server/channel to enter
- `/create` asks for a server name and selects its `#general`
- `/invite` asks for duration and creates a pasteable `vex://invite/...` link
- `/invite redeem` asks for an invite link
- `/to <username-or-user-id>` selects a DM
- `/join <channel-id>` selects a channel
- Plain text sends to the selected DM/channel
- `/create server <name>` creates a server and selects its `#general`
- `/invite [duration]` creates a pasteable `vex://invite/...` link for the current server
- `/server create <name>`
- `/servers`
- `/channels <server-id>`
- `/channel create <server-id> <name>`
- `/invite create <server-id> [duration]`
- `/invite redeem <invite-id-or-link>`
- `/history`
- `/whoami`
- `/quit`

Scriptable helpers still exist:

```sh
pnpm vex auth register alice
pnpm vex auth register bob
pnpm vex alice
pnpm vex bob
pnpm vex auth accounts
pnpm vex dm send bob "hello"
pnpm vex server create team
pnpm vex invite redeem <invite-id>
```
