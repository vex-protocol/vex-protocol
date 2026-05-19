---
"@vex-chat/cli": patch
---

If a stored device was removed from the account server-side, the CLI now drops the dead local account entry and `vex auth login <username>` starts fresh device approval instead of surfacing a raw 404.
