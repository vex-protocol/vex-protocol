# @vex-chat/cli

Terminal chat client for Vex backed by `@vex-chat/libvex`.

```sh
pnpm vex
```

On first run, `vex` prompts for a username and password, registers a local
device key, and opens straight into a live chat session.

By default the CLI connects to production at `api.vex.wtf`. For local Spire development, pass `--local` to use `127.0.0.1:16777` over http/ws. Custom targets can use `--api-url <url>` to set both the host and protocol, or `--host <host:port> --http` to set them separately.

New accounts use the password you set during registration. Passkeys can be added
later as a supplemental recovery/sign-in method. When adding this machine to an
account that already exists, the browser passkey page can restore the pending
device with a saved passkey. Use `--passkey-url <url>` or
`VEX_CHAT_PASSKEY_URL` when the WebAuthn page is hosted somewhere other than the
API origin; use `--no-browser` or `VEX_CHAT_NO_BROWSER=1` to print the URL
without launching a browser.

Inside the app:

- `/accounts` lists local users on this machine
- `/nav` opens a channel or DM
- `/join [server]` chooses a server, then asks which channel to open
- `/servers` browses your available servers, then opens a channel
- `/channels` chooses a channel
- `/window` lists open chats
- `/window <number>` switches to an open chat
- `/user <username-or-user-id>` opens a DM conversation
- `/inbox` shows DMs, unread counts, and recent senders
- `/dm` also opens the inbox
- `/dm <username-or-user-id>` opens a DM conversation
- `/dm <username-or-user-id> <message>` sends a DM and opens that conversation
- `/to <username-or-user-id>` opens a DM conversation
- `/create` asks for a server name and selects its `#general`
- `/invite` asks for duration and creates a pasteable `vex://invite/...` link
- `/invite <username-or-user-id>` sends an invite link by DM
- Incoming `vex://invite/...` links show a server preview and ask whether to join
- `redeem <code-or-link>` previews a server invite, asks you to confirm, then opens its first channel
- Plain text sends to the selected DM/channel
- `/create server <name>` creates a server and selects its `#general`
- `/invite [duration]` creates a pasteable `vex://invite/...` link for the current server
- `/members` lists people in the current channel
- `/whoami`
- `/quit`

Scriptable helpers still exist:

```sh
pnpm vex auth register alice alice-password
pnpm vex auth register bob bob-password
pnpm vex alice
pnpm vex bob
pnpm vex auth accounts
pnpm vex dm send bob "hello"
pnpm vex server create team
pnpm vex invite redeem <invite-id>
```

Incoming messages play a small sound by default. Use `--sound off` to disable it, `--sound Glass` for a macOS system sound name, or `--sound /path/to/file.wav` for a custom audio file. `VEX_CHAT_SOUND` works too.

For delivery debugging, run chat with `--debug`:

```sh
pnpm --silent vex --debug alice
```

Debug mode writes CLI send/receive/routing decisions to a log file under the CLI data directory. Use `--debug-file ./alice-debug.log` to choose a path. Use `--debug-level trace` only when you also need noisy libvex mail diagnostics.
