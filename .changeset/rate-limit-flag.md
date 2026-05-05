---
"@vex-chat/spire": minor
"@vex-chat/libvex": patch
---

Spire operators can now set `SPIRE_DISABLE_RATE_LIMITS=1` (or `true`) to bypass all rate limiting globally — useful for load-testing environments where a `DEV_API_KEY` is not appropriate. The libvex client now debounces session-heal attempts per sender device with a 30-second backoff and in-flight guard, preventing repeated `/keyBundle` hammering when a corrupt or unrecognised mail item triggers back-to-back decrypt failures.
