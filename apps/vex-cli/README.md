# @vex-chat/cli

Terminal chat client for Vex backed by `@vex-chat/libvex`.

```sh
pnpm vex
```

On first run, `vex` prompts for a username and registers a local device key.
After that it opens straight into a live chat session.

By default the CLI connects to production at `api.vex.wtf`. For local Spire development, pass `--local` to use `127.0.0.1:16777` over http/ws. Custom local targets can still use `--host <host:port> --http`.

Inside the app:

- `/accounts` lists local users on this machine
- `/nav` opens a channel or DM
- `/join [server]` chooses a server, then asks which channel to open
- `/servers` browses your available servers, then opens a channel
- `/channels` chooses a channel
- `/window` lists open chats
- `/window <number>` switches to an open chat
- `/user <username-or-user-id>` opens a DM conversation
- `/dms` shows DMs, unread counts, and recent senders
- `/dm <username-or-user-id>` opens a DM conversation
- `/dm <username-or-user-id> <message>` sends a DM and opens that conversation
- `/to <username-or-user-id>` opens a DM conversation
- `/create` asks for a server name and selects its `#general`
- `/invite` asks for duration and creates a pasteable `vex://invite/...` link
- `/invite <username-or-user-id>` sends an invite link by DM
- `redeem <code-or-link>` previews a server invite, asks you to confirm, then opens its first channel
- Plain text sends to the selected DM/channel
- `/create server <name>` creates a server and selects its `#general`
- `/invite [duration]` creates a pasteable `vex://invite/...` link for the current server
- `/members` lists people in the current channel
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

Incoming messages play a small sound by default. Use `--sound off` to disable it, `--sound Glass` for a macOS system sound name, or `--sound /path/to/file.wav` for a custom audio file. `VEX_CHAT_SOUND` works too.

For delivery debugging, run chat with `--debug` and redirect stderr:

```sh
pnpm --silent vex --debug alice 2> alice-debug.log
```

Debug mode logs CLI send/receive/routing decisions and enables libvex session/mail diagnostics.
Use `--debug-level trace` only when you also need heartbeat ping/pong details.
