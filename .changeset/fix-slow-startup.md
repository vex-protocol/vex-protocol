---
"@vex-chat/libvex": patch
---

Fixes slow client startup: OTK negotiation is now fire-and-forget so it no longer blocks login or app hydration by several seconds on mobile. Familiar lookups are now fetched in parallel instead of sequentially.
