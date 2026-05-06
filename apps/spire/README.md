# @vex-chat/spire

Reference server for the Vex protocol.

Spire is the server-side half of the Vex stack. It provides account auth, device registration, key-bundle distribution, mail relay, WebSocket delivery, groups/channels/invites, file ciphertext storage, passkey recovery/admin flows, and operational endpoints.

## Stack Role

- Spire stores device directories, public key bundles, pending mail ciphertext, file ciphertext, account credentials, group/channel metadata, and delivery metadata.
- Spire deletes delivered mail after receipt confirmation.
- Spire does not receive message plaintext or file keys when clients use the normal `libvex` APIs.
- Spire is still trusted for directory and policy decisions. A malicious Spire can lie about which devices belong to a user unless clients verify fingerprints out of band.

Use `@vex-chat/libvex` for clients.

## Runtime Requirements

- Node.js `>=24.0.0`.
- pnpm `10.33.0` for monorepo development.
- Docker and Docker Compose for the default self-hosted path.
- SQLite via `better-sqlite3`.
- TLS termination in front of Spire for production. Spire itself listens HTTP.

## Quick Start With Docker

From the monorepo root:

```sh
pnpm install
pnpm --filter @vex-chat/spire gen-spk
```

Create `apps/spire/.env`:

```sh
SPK=replace-with-generated-spk
JWT_SECRET=replace-with-generated-jwt-secret
DB_TYPE=sqlite3
NODE_ENV=production
SPIRE_FIPS=false
CORS_ORIGINS=
SPIRE_MAIL_RETENTION_TTL=30d
```

Start:

```sh
cd apps/spire
docker compose up --build
```

Default endpoints:

```text
HTTP:      http://127.0.0.1:16777
WebSocket: ws://127.0.0.1:16777/socket
Health:    http://127.0.0.1:16777/healthz
Status:    http://127.0.0.1:16777/status
```

`docker-compose.yml` builds from the monorepo root, runs Spire on an internal network, stores SQLite/files in the `spire-data` Docker volume, and exposes nginx on host port `16777`.

## Crypto Profile

Spire and all clients in a deployment must use the same crypto profile.

TweetNaCl profile, default:

```sh
pnpm --filter @vex-chat/spire gen-spk
```

FIPS-compatible profile:

```sh
pnpm --filter @vex-chat/spire gen-spk-fips
```

For FIPS-compatible mode, set:

```sh
SPIRE_FIPS=true
```

Then create clients with:

```ts
cryptoProfile: "fips";
```

The FIPS-compatible path uses approved-style primitives where implemented, but this repository does not claim formal FIPS 140 validation.

## Configuration

Required:

| Variable     | Description                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------- |
| `SPK`        | Server private key. Use `gen-spk` for TweetNaCl or `gen-spk-fips` for FIPS-compatible mode. |
| `JWT_SECRET` | JWT HMAC secret. Must be separate from `SPK`.                                               |
| `DB_TYPE`    | `sqlite3` for file-backed SQLite or `sqlite3mem` for in-memory test use.                    |

Common optional variables:

| Variable                    | Default      | Description                                                                                                |
| --------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------- |
| `SPIRE_FIPS`                | `false`      | `true` or `1` enables FIPS-compatible mode.                                                                |
| `API_PORT`                  | `16777`      | Spire listen port. Compose nginx also follows this value.                                                  |
| `NODE_ENV`                  | unset        | Set `production` for production defaults.                                                                  |
| `SPIRE_DOCKER_NODE_ENV`     | `production` | Compose wrapper for container `NODE_ENV`.                                                                  |
| `CORS_ORIGINS`              | empty        | Comma-separated browser origin allowlist. In production, set this for browser clients.                     |
| `SPIRE_MAIL_RETENTION_TTL`  | `30d`        | Undelivered mail ciphertext TTL. Examples: `6h`, `24h`, `7d`, `30d`. Delivered mail is deleted on receipt. |
| `SPIRE_MAIL_RETENTION_DAYS` | empty        | Legacy day-count retention value. Ignored when `SPIRE_MAIL_RETENTION_TTL` is set.                          |
| `DEV_API_KEY`               | empty        | Dev/stress-test rate-limit bypass via `x-dev-api-key`. Refused in production.                              |
| `SPIRE_DISABLE_RATE_LIMITS` | empty        | Disables in-process rate limits for dev/stress tests. Refused in production.                               |

Passkey/WebAuthn variables:

| Variable                             | Description                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `SPIRE_PASSKEY_RP_ID`                | RP ID, usually the eTLD+1 host.                                                                          |
| `SPIRE_PASSKEY_RP_NAME`              | Display name. Defaults to `Vex`.                                                                         |
| `SPIRE_PASSKEY_ORIGINS`              | Comma-separated allowed WebAuthn origins.                                                                |
| `SPIRE_PASSKEY_IOS_APP_IDS`          | Optional comma-separated Apple app IDs for well-known association.                                       |
| `SPIRE_PASSKEY_ANDROID_PACKAGE`      | Optional Android package for `assetlinks.json`.                                                          |
| `SPIRE_PASSKEY_ANDROID_FINGERPRINTS` | Optional Android SHA-256 signing cert fingerprints. Also used to derive native Android WebAuthn origins. |

If passkey variables are not set, passkey endpoints return a clear server error and well-known association endpoints return 404.

## Running Without Docker

From the monorepo root:

```sh
pnpm install
pnpm --filter @vex-chat/spire gen-spk
pnpm --filter @vex-chat/spire start
```

Or from `apps/spire`:

```sh
pnpm start
```

`start` runs:

```sh
node --experimental-strip-types src/run.ts
```

`dotenv` loads `.env` from the process working directory.

## Development

From the monorepo root:

```sh
pnpm install
pnpm --filter @vex-chat/spire build
pnpm --filter @vex-chat/spire test
pnpm --filter @vex-chat/spire lint
```

Integration and stress entry points:

```sh
pnpm integration:cli
pnpm integration:web
pnpm --filter @vex-chat/spire integration:cli
pnpm --filter @vex-chat/spire integration:web
```

The integration/stress scripts use environment variables from `.env.example`, including `SPIRE_STRESS_HOST`, `SPIRE_STRESS_SCENARIO`, `SPIRE_STRESS_CLIENTS`, `SPIRE_STRESS_CONCURRENCY`, and `DEV_API_KEY`.

## Production Notes

- Put Spire behind HTTPS/WSS termination.
- Set `NODE_ENV=production`.
- Use a strong unique `SPK` and a separate strong `JWT_SECRET`.
- Keep the SQLite/file volume on encrypted storage if the host matters.
- Set `SPIRE_MAIL_RETENTION_TTL` intentionally for the deployment.
- Set `CORS_ORIGINS` when browser clients are used.
- Do not set `DEV_API_KEY` or `SPIRE_DISABLE_RATE_LIMITS` in production.
- Spire stores ciphertext and metadata. It is not a metadata-hiding transport.

Public runbook: <https://github.com/vex-protocol/vex-docs/blob/main/docs/ops/single-node-runbook.md>

Public threat model: <https://github.com/vex-protocol/vex-docs/blob/main/docs/security/threat-model.md>

## License

Default public license: AGPL-3.0-or-later. Commercial licenses are available from Vex Heavy Industries LLC.
