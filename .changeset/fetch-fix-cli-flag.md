---
"@vex-chat/libvex": patch
"@vex-chat/cli": minor
---

`@vex-chat/libvex` fixes fetch transport error handling to correctly read the response body before throwing an `HttpError`, and adds accurate upload-progress reporting for `FormData` payloads. `@vex-chat/cli` adds an `--api-url <url>` flag as a convenient shorthand for setting the API base URL (e.g. `--api-url http://127.0.0.1:16777`).
