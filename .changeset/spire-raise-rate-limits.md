---
"@vex-chat/spire": patch
---

Raises the default rate limits to better accommodate high-throughput clients: global limit is now 150,000 requests per 15 minutes per IP, auth endpoint limit is 2,500 failed attempts per 15 minutes, and upload limit is 10,000 per minute. Operators running earlier versions who saw legitimate clients hitting rate-limit errors should upgrade.
