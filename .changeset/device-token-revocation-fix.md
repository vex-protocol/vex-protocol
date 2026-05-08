---
"@vex-chat/spire": patch
---

Device tokens for deleted or revoked devices are now rejected at the middleware layer. Spire re-validates each `x-device-token` against the live database row and drops any token whose device no longer exists or whose signing key has rotated, closing a window where deleted-device tokens remained accepted until server restart.
