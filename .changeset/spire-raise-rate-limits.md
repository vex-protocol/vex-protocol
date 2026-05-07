---
"@vex-chat/spire": patch
---

Raises the global per-IP rate limit from 3,000 to 150,000 requests per 15 minutes to accommodate high-throughput clients. Operators running earlier versions who saw legitimate clients hitting rate-limit errors should upgrade.
