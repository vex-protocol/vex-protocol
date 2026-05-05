---
"@vex-chat/types": minor
"@vex-chat/libvex": minor
"@vex-chat/spire": minor
---

Adds `ServerChannelBootstrap` type and schema to `@vex-chat/types`. Call `client.servers.retrieveWithChannels()` in `@vex-chat/libvex` to fetch all servers and their channels in a single request — useful for fast initial renders. Spire exposes the corresponding `GET /user/:id/servers/bootstrap` endpoint.
