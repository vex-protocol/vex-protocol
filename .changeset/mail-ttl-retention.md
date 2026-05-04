---
"@vex-chat/spire": minor
"@vex-chat/libvex": minor
---

Spire now enforces a 30-day server-side mail TTL (stale rows pruned on startup and daily, omitted from inbox reads) and optionally sends a deferred owner notification when a pending device enrollment is approved. libvex exports new retention helpers (`MAX_LOCAL_MESSAGE_RETENTION_DAYS`, `clampLocalMessageRetentionDays`, `effectiveMessageRetentionHintDays`, `formatVexRetentionEnvelope`, `stripVexRetentionEnvelope`) and automatically prunes local SQLite storage per a configurable 1–30-day window; set `retentionDays` in your client config to control per-device retention.
