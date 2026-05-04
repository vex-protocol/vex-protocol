---
"@vex-chat/spire": minor
"@vex-chat/libvex": minor
---

Spire now enforces a 30-day server-side mail TTL: stale rows are pruned on startup and once daily, and inbox reads skip messages older than 30 days. libvex exports new retention helpers (`MAX_LOCAL_MESSAGE_RETENTION_DAYS`, `clampLocalMessageRetentionDays`, `formatVexRetentionEnvelope`, `stripVexRetentionEnvelope`) and automatically prunes local SQLite storage per a configurable 1–30-day window; set `retentionDays` in your client config to control per-device retention.
