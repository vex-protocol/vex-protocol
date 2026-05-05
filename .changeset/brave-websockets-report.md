---
"@vex-chat/spire": patch
---

Split Spire integration WebSocket reliability coverage so TweetNaCl chat owns the strict CI transport gate while noise remains relaxed and FIPS becomes telemetry-only on GitHub runners, and emit per-scenario WebSocket delivery JSONL in GitHub job summaries.
