# @vex-chat/libvex

TypeScript client library for the Vex protocol.

`libvex` is the client-side half of the stack. It talks to a Spire server, manages device keys and sessions, encrypts/decrypts messages and files, and stores local client state.

## Stack Role

- `@vex-chat/spire`: server-side account/device directory, key-bundle publication, mail relay, WebSocket transport, file ciphertext storage, auth, invites, groups, and passkeys.
- `@vex-chat/libvex`: client-side registration/login, device enrollment, X3DH session setup, Double Ratchet messaging, file encryption helpers, local storage, and out-of-band verification state.
- `@vex-chat/crypto`: crypto provider layer used by both.
- `@vex-chat/types`: shared wire schemas.

Spire does not receive message plaintext when callers use the normal `libvex` APIs. It still sees routing metadata, device/user IDs, ciphertext sizes, timestamps, file metadata, and online/delivery behavior. A malicious Spire can lie about the device directory unless users verify peer fingerprints out of band and the client treats unverified sessions appropriately.

## Runtime Requirements

- Node.js `>=24.0.0`.
- A running Spire server.
- Matching crypto profile between client, peers, and Spire:
    - `tweetnacl`: default profile.
    - `fips`: P-256/Web Crypto compatibility path. This is not a FIPS 140 validation claim.

## Install

```sh
npm install @vex-chat/libvex
```

Install `better-sqlite3` only if you use the Node SQLite storage backend:

```sh
npm install @vex-chat/libvex better-sqlite3
```

Browser, Tauri, React Native, and Expo hosts should provide their own storage adapter instead of bundling `better-sqlite3`.

## Minimal Client

```ts
import { Client } from "@vex-chat/libvex";

const secretKey = Client.generateSecretKey();

const client = await Client.create(secretKey, {
    host: "127.0.0.1:16777",
    unsafeHttp: true,
});

await client.register("alice", "correct horse battery staple");
await client.login("alice", "correct horse battery staple");
await client.connect();

client.on("message", (message) => {
    console.log(message);
});

await client.messages.send("recipient-user-id", "hello");
```

Use `unsafeHttp: true` only for local development or test. In production, Spire should be behind HTTPS/WSS and clients should omit `unsafeHttp`.

## Client Options

Common `ClientOptions`:

- `host`: API host without protocol. Defaults to `api.vex.wtf`.
- `unsafeHttp`: use `http://` and `ws://` instead of `https://` and `wss://`. Only allowed in `development` or `test`.
- `cryptoProfile`: `tweetnacl` or `fips`. Must match the deployment.
- `deviceName`: label used during device registration.
- `devApiKey`: sent as `x-dev-api-key`; only for local stress/dev runs where Spire has matching `DEV_API_KEY`.
- `dbFolder`: folder for the default SQLite database.
- `inMemoryDb`: use SQLite `:memory:`.
- `saveHistory`: persist local message history when using default storage.
- `localMessageRetentionDays`: local history retention, clamped to the library/server retention rules.

`libvex` does not read `.env`. Applications pass configuration through `ClientOptions`.

## Storage And Presets

Node preset:

```ts
import { nodePreset } from "@vex-chat/libvex/preset/node";
```

Test preset:

```ts
import { testPreset } from "@vex-chat/libvex/preset/test";
```

For other platforms, import `Client` directly and pass a custom `Storage` implementation from `@vex-chat/libvex/storage/schema` plus an appropriate keystore.

Available subpaths:

- `@vex-chat/libvex/preset/node`
- `@vex-chat/libvex/preset/test`
- `@vex-chat/libvex/storage/node`
- `@vex-chat/libvex/storage/sqlite`
- `@vex-chat/libvex/storage/schema`
- `@vex-chat/libvex/keystore/node`
- `@vex-chat/libvex/keystore/memory`

## Running Against Local Spire

From the monorepo root:

```sh
pnpm install
pnpm --filter @vex-chat/spire gen-spk
```

Put the generated `SPK` and `JWT_SECRET` in `apps/spire/.env`, then start Spire:

```sh
cd apps/spire
docker compose up --build
```

Create clients with:

```ts
const client = await Client.create(secretKey, {
    host: "127.0.0.1:16777",
    unsafeHttp: true,
});
```

For the FIPS-compatible profile, generate the server key with:

```sh
pnpm --filter @vex-chat/spire gen-spk-fips
```

Set `SPIRE_FIPS=true` in Spire and create clients with `cryptoProfile: "fips"`.

## Development

From the monorepo root:

```sh
pnpm install
pnpm --filter @vex-chat/libvex build
pnpm --filter @vex-chat/libvex test
pnpm --filter @vex-chat/libvex test:e2e
pnpm --filter @vex-chat/libvex lint
pnpm --filter @vex-chat/libvex lint:pkg
pnpm --filter @vex-chat/libvex lint:types
pnpm --filter @vex-chat/libvex lint:api
pnpm --filter @vex-chat/libvex license:check
```

The unit suite is offline. The e2e suite needs a running Spire. Test-only environment variables include:

- `API_URL`: Spire URL, for example `http://127.0.0.1:16777`.
- `DEV_API_KEY`: dev rate-limit bypass key, only if the server also has it.
- `LIBVEX_E2E_SKIP_STATUS_CHECK=1`: skip the Spire `/status` crypto-profile preflight.

## Security Notes

- Current public threat model: <https://github.com/vex-protocol/vex-docs/blob/main/docs/security/threat-model.md>
- Session fingerprints must be verified out of band for meaningful protection against malicious directory substitution.
- JavaScript cannot guarantee memory zeroing. The library can minimize key lifetime, but endpoint compromise remains out of scope.
- Server-side delete-on-receipt does not hide transport metadata.

## License

Default public license: AGPL-3.0-or-later. Commercial licenses are available from Vex Heavy Industries LLC.
