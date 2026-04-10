# @vex-chat/types

[![npm](https://img.shields.io/npm/v/@vex-chat/types?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/@vex-chat/types)
[![CI](https://img.shields.io/github/actions/workflow/status/vex-protocol/types-js/build.yml?branch=master&style=flat-square&logo=github&label=CI)](https://github.com/vex-protocol/types-js/actions/workflows/build.yml)
[![Released](https://img.shields.io/github/release-date/vex-protocol/types-js?style=flat-square&label=released)](https://github.com/vex-protocol/types-js/releases)
[![License](https://img.shields.io/npm/l/@vex-chat/types?style=flat-square&color=blue)](./LICENSE)
[![Types](https://img.shields.io/npm/types/@vex-chat/types?style=flat-square&logo=typescript&color=3178c6)](./dist/index.d.ts)
[![Type Coverage](https://img.shields.io/badge/dynamic/json?style=flat-square&label=type-coverage&prefix=%E2%89%A5&suffix=%25&query=$.typeCoverage.atLeast&url=https://raw.githubusercontent.com/vex-protocol/types-js/master/package.json&color=3178c6&logo=typescript)](https://github.com/plantain-00/type-coverage)
[![Node](https://img.shields.io/node/v/@vex-chat/types?style=flat-square&color=339933&logo=nodedotjs)](./package.json)
[![Bundle](https://deno.bundlejs.com/badge?q=@vex-chat/types&treeshake=[*])](https://bundlejs.com/?q=@vex-chat/types&treeshake=[*])
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/vex-protocol/types-js?style=flat-square&label=Scorecard)](https://securityscorecards.dev/viewer/?uri=github.com/vex-protocol/types-js)
[![Socket](https://socket.dev/api/badge/npm/package/@vex-chat/types)](https://socket.dev/npm/package/@vex-chat/types)

Wire protocol types for the [Vex](https://vex.wtf) encrypted chat platform. Used by both the server and client so they speak the same shapes.

## What's in the box

- **TypeScript interfaces** for every REST payload, WebSocket message, and database record on the wire.
- **Zod 4 schemas** (`XSchema`) paired with every interface for runtime validation: `UserSchema.parse(data)`, `KeyBundleSchema.safeParse(data)`, etc.
- **OpenAPI 3.1 document** generated from the Zod schemas, shipped as a subpath export (`@vex-chat/types/openapi.json`). 16 REST paths.
- **AsyncAPI 3.0 document** for the WebSocket protocol, also a subpath export (`@vex-chat/types/asyncapi.json`). 11 message types across 5 client→server and 6 server→client channels.
- **Discriminated `WSMessage` union** so `switch (msg.type)` narrows exhaustively in TypeScript.

## Install

```sh
npm install @vex-chat/types
```

`zod` is a required runtime dependency (auto-installed). No peer dependencies.

## Usage

```ts
import { UserSchema, type User } from "@vex-chat/types";

// Compile-time: plain TypeScript interface
const alice: User = {
    userID: "a-uuid",
    username: "alice",
    lastSeen: new Date().toISOString(),
};

// Runtime: validate untrusted input from the wire
const parsed = UserSchema.parse(incomingJson); // throws on mismatch
const safe = UserSchema.safeParse(incomingJson); // { success, data } | { success, error }
```

For the REST/WS protocol docs:

```ts
import openapi from "@vex-chat/types/openapi.json" with { type: "json" };
import asyncapi from "@vex-chat/types/asyncapi.json" with { type: "json" };
```

## License

[AGPL-3.0-or-later](./LICENSE)
