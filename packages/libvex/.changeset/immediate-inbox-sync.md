---
"@vex-chat/libvex": minor
---

`Client` now exposes a `syncInboxNow(): Promise<void>` method that triggers an immediate `/mail` fetch. Call it on mobile foreground resume (or any other moment where the background poll may have been paused) to pull in pending messages without waiting for the next scheduled tick.
