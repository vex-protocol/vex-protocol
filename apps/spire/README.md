# @vex-chat/spire

[![npm](https://img.shields.io/npm/v/@vex-chat/spire?style=flat-square&color=cb3837&logo=npm)](https://www.npmjs.com/package/@vex-chat/spire)
[![CI](https://img.shields.io/github/actions/workflow/status/vex-protocol/vex-protocol/build.yml?branch=master&style=flat-square&logo=github&label=CI)](https://github.com/vex-protocol/vex-protocol/actions/workflows/build.yml)
[![Released](https://img.shields.io/github/release-date/vex-protocol/vex-protocol?style=flat-square&label=released)](https://github.com/vex-protocol/vex-protocol/releases)
[![License](https://img.shields.io/npm/l/@vex-chat/spire?style=flat-square&color=blue)](./LICENSE)
[![Type Coverage](https://img.shields.io/badge/dynamic/json?style=flat-square&label=type-coverage&prefix=%E2%89%A5&suffix=%25&query=$.typeCoverage.atLeast&url=https://raw.githubusercontent.com/vex-protocol/vex-protocol/master/apps/spire/package.json&color=3178c6&logo=typescript)](https://github.com/plantain-00/type-coverage)
[![Node](https://img.shields.io/node/v/@vex-chat/spire?style=flat-square&color=339933&logo=nodedotjs)](./package.json)
[![OpenSSF Scorecard](https://img.shields.io/ossf-scorecard/github.com/vex-protocol/vex-protocol?style=flat-square&label=Scorecard)](https://securityscorecards.dev/viewer/?uri=github.com/vex-protocol/vex-protocol)
[![npm audit](https://img.shields.io/github/actions/workflow/status/vex-protocol/vex-protocol/npm-audit.yml?branch=master&style=flat-square&logo=npm&label=npm%20audit)](https://github.com/vex-protocol/vex-protocol/actions/workflows/npm-audit.yml)
[![Socket](https://img.shields.io/github/actions/workflow/status/vex-protocol/vex-protocol/socket.yml?branch=master&style=flat-square&label=Socket)](https://github.com/vex-protocol/vex-protocol/actions/workflows/socket.yml)

Reference server implementation for the [Vex](https://vex.wtf) protocol.

## What's in the box

- **REST API** (Rust/Axum) for e2e messaging including auth, registration, users, servers, channels, invites, passkeys, notifications, files, avatars, and emoji upload.

## Install

Spire is part of the [vex-protocol/vex-protocol](https://github.com/vex-protocol/vex-protocol) monorepo. Clone the monorepo and install workspace deps:

```sh
git clone git@github.com:vex-protocol/vex-protocol
cd protocol
pnpm install
```

Spire's source lives at `apps/spire/`. Most commands below run from the monorepo root.

## Running the server (Docker)

The Dockerfile uses the monorepo as build context and builds the Rust runtime from `apps/spire/rust`. From `apps/spire/`, with Docker and Docker Compose installed:

```sh
cp .env.example .env
# set SPK, JWT_SECRET, DB_TYPE, SPIRE_FIPS, … (see Configuration)
docker compose up --build
```

**Crypto mode:** the Rust runtime supports the default tweetnacl/Ed25519 profile and the FIPS/P-256 profile used by legacy Node Spire. Generate tweetnacl keys with **`pnpm --filter @vex-chat/spire gen-spk`** or FIPS keys with **`pnpm --filter @vex-chat/spire gen-spk-fips`**, then paste the compose-safe `SPK=...` and `JWT_SECRET=...` lines directly.

Compose builds the image (context: monorepo root, dockerfile: `apps/spire/Dockerfile`), starts Spire with a persistent **`spire-data`** volume mounted at `/data` (`files/`, `avatars/`, `emoji/`), and fronts it with **nginx** on host **port 16777** (see `ports` in `docker-compose.yml`). Spire itself listens on **16777** inside the `internal` network. Nginx and the health check use `deploy/resolve-spire-listen-port.sh` to match. Use **http://127.0.0.1:16777** for HTTP and WebSocket. Spire runtime keys come from `apps/spire/.env` via Compose `env_file`; they are intentionally not copied into the Docker image. In Docker, nginx receives only public passkey association metadata and serves it at `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`.

## Running without Docker

For local development or if you installed from npm, Spire's default runtime is Rust and requires a Rust toolchain:

```sh
pnpm --filter @vex-chat/spire start
# or, from apps/spire/: pnpm start
# or: cargo run --manifest-path apps/spire/rust/Cargo.toml --
```

The legacy Node implementation is still present for transition work:

```sh
pnpm --filter @vex-chat/spire start:node
```

## Configuration

Spire reads configuration from environment variables. **Docker Compose:** put them in a `.env` file next to `docker-compose.yml` (the `env_file` entry injects them into the container). **Bare Rust:** `dotenv` loads `.env` from the process working directory when you run `pnpm start` or `cargo run`.

### Required

| Variable     | Description                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SPK`        | Server private key, hex-encoded. Use `pnpm --filter @vex-chat/spire gen-spk` (Ed25519). The command prints compose-safe `SPK` and `JWT_SECRET` lines.                                                                                                          |
| `JWT_SECRET` | Hex or string used as the **HMAC secret for JWTs** — **required** and must be **separate from `SPK`**. `pnpm --filter @vex-chat/spire gen-spk` emits a dedicated value; do not reuse `SPK` here.                                                                   |

### Optional

| Variable       | Default    | Description                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SPIRE_FIPS`   | _falsy_    | Set to `true`/`1` to use the P-256/FIPS profile with keys generated by `pnpm --filter @vex-chat/spire gen-spk-fips`. Leave unset for the default tweetnacl/Ed25519 profile.                                                                                                                                                            |
| `API_PORT`     | (see text) | If unset, Spire listens on **16777** (all crypto profiles; use `GET /status` to see which). In Docker, nginx and the image healthcheck use `deploy/resolve-spire-listen-port.sh` to follow the same rule. Set explicitly to override.                                                                                                                                                                  |
| `NODE_ENV`     | _(unset)_  | Set to `production` to disable interactive `/docs` / `/async-docs`. If unset or any other value, doc viewers are mounted. `helmet()` runs in all modes.                                                                                                                                                                                                                                                |
| `CORS_ORIGINS` | _(empty)_  | Comma-separated allowed `Origin` values. If set, only those origins may use credentialed browser requests. If unset, Spire **reflects the request `Origin`** so self-hosted Spire and arbitrary app origins (Tauri, localhost, etc.) work without configuration — appropriate for bearer-token APIs; set an allowlist if you need to restrict which sites may call your instance from users' browsers. |
| `DEV_API_KEY`  | _(empty)_  | When set, requests that send header `x-dev-api-key` with the same value **skip in-process rate limiters**. The same gate enables **`GET /status/process`** (404 without a valid key): a small JSON snapshot of the Spire process. Dev / load-testing only — never set in production.                                                  |
| `CANARY`       | _(unset)_  |                                                                                                                                                                                                                                                                                                                                                                                                        |

### Passkeys / WebAuthn

Docker Compose nginx handles the passkey platform association routes:

- `/.well-known/apple-app-site-association` from `SPIRE_PASSKEY_IOS_APP_IDS`
- `/.well-known/assetlinks.json` from `SPIRE_PASSKEY_ANDROID_PACKAGE` and `SPIRE_PASSKEY_ANDROID_FINGERPRINTS`

The Rust runtime implements the WebAuthn ceremony API routes (`/auth/passkey/...`, `/user/:id/passkeys/...`, and passkey device recovery routes) when `SPIRE_PASSKEY_RP_ID` and `SPIRE_PASSKEY_ORIGINS` are set. Bare Rust also serves the association files for local development, but the Docker deployment intentionally serves those paths from nginx so nginx only receives public passkey metadata, not Spire secrets.

### Sample `.env`

```sh
# Run `pnpm --filter @vex-chat/spire gen-spk` and paste the two lines it prints (SPK + JWT_SECRET).
SPK=a1b2c3...
JWT_SECRET=d4e5f6...
# DB_TYPE is accepted by legacy Node Spire; the Rust runtime stores state in-process today.
# CANARY=true
# API_PORT=        # unset = 16777 unless you override
NODE_ENV=production
```

## Development

From the monorepo root (or use `pnpm <script>` from `apps/spire/`):

```sh
pnpm install                                  # install workspace deps
pnpm --filter @vex-chat/spire build           # tsc sanity check for legacy Node sources
pnpm --filter @vex-chat/spire lint            # eslint strictTypeChecked
pnpm --filter @vex-chat/spire lint:fix        # eslint --fix
pnpm --filter @vex-chat/spire test            # vitest run
```

Workspace-wide commands from root: `pnpm test`, `pnpm lint`, `pnpm format:check`, `pnpm -r build`.

See the root [AGENTS.md](../../AGENTS.md) and this package's [AGENTS.md](./AGENTS.md) for the release flow (changesets → publish via OIDC) and the rules for writing changesets.

Outside contributors should follow the root [CONTRIBUTING.md](../../CONTRIBUTING.md) (including the [CLA](../../CLA.md)).

## License

Open source default: **[AGPL-3.0](./LICENSE)** (full text; see `package.json` for SPDX). Commercial licenses from **Vex Heavy Industries LLC**: [**LICENSE-COMMERCIAL**](./LICENSE-COMMERCIAL), [**LICENSING.md**](./LICENSING.md), [vex.wtf](https://vex.wtf/licensing).
