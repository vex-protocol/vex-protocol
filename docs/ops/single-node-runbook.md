# Single-node Spire deployment and teardown runbook

Linear: VEX-62

This runbook is the evaluator answer to: how quickly can I stand this up, what
does it require, and what remains after teardown?

## Minimum requirements

- Linux, macOS, or Windows with Docker and Docker Compose.
- Node.js and pnpm if building from source or running tests.
- One reachable TCP port for Spire/nginx. The compose default is `16777`.
- Enough disk for the SQLite database, pending ciphertext mail, files, avatars,
  and emoji.

For a local evaluation, a developer laptop is enough. For a pilot, use a host
with disk encryption, backups configured intentionally, and TLS termination in
front of Spire.

## Generate secrets

From the monorepo root:

```sh
pnpm install
pnpm --filter @vex-chat/spire gen-spk
```

Copy the printed `SPK` and `JWT_SECRET` into `apps/spire/.env`.

## Example `.env`

```sh
SPK=replace-with-generated-spk
JWT_SECRET=replace-with-generated-jwt-secret
DB_TYPE=sqlite3
NODE_ENV=production
CORS_ORIGINS=
SPIRE_TRUST_PROXY_HOPS=1
SPIRE_MAIL_RETENTION_TTL=30d
# Optional passkey support when this host is the RP host:
# SPIRE_PASSKEY_RP_ID=api.vex.wtf
# SPIRE_PASSKEY_RP_NAME=Vex
# SPIRE_PASSKEY_ORIGINS=https://api.vex.wtf,ios:bundle-id:chat.vex.mobile
# SPIRE_PASSKEY_ANDROID_PACKAGE=chat.vex.mobile
# SPIRE_PASSKEY_ANDROID_FINGERPRINTS=<EAS Android SHA-256 cert fingerprint>
```

Notes:

- `SPK` and `JWT_SECRET` must be different values.
- `SPIRE_MAIL_RETENTION_TTL` controls undelivered server mail retention. Use
  values such as `6h`, `24h`, `7d`, or `30d`.
- In production, set `CORS_ORIGINS` if browser clients need cross-origin access.
  Non-browser clients do not use CORS.
- To enable passkeys, set the `SPIRE_PASSKEY_*` values for the exact RP host,
  bundle/package ID, and signing certificate used by the app environment.
- Do not set `DEV_API_KEY` or `SPIRE_DISABLE_RATE_LIMITS` in production.

## Start

```sh
cd apps/spire
docker compose up --build
```

Spire should be reachable at:

```text
http://127.0.0.1:16777
ws://127.0.0.1:16777
```

Health check:

```sh
curl http://127.0.0.1:16777/healthz
curl http://127.0.0.1:16777/status
```

Expected basic health:

```json
{ "dbReady": true, "ok": true }
```

## Operate

During a simple evaluation:

- Register users/devices through a Vex client.
- Compare safety numbers out of band before trusting a conversation.
- Send messages and files.
- Confirm delivered messages disappear from server mail storage after receipts.
- Monitor `/healthz` and `/status`.

Spire should never expose message plaintext through health or status endpoints.

## Teardown

Stop containers:

```sh
cd apps/spire
docker compose down
```

Remove the persistent volume:

```sh
docker compose down --volumes
```

Remove built images if desired:

```sh
docker image prune
```

## What remains

After `docker compose down --volumes`, the compose-managed SQLite database and
uploaded blobs in the `spire-data` volume are removed from Docker's managed
volume storage.

This does not guarantee forensic erasure from SSDs, host backups, swap, Docker
layer caches, shell history, logs, terminal scrollback, or external log
collectors. Use host disk encryption and a documented media sanitization process
for deployments where post-teardown forensic recovery matters.

## Safety checklist

- Use TLS termination for real networks.
- Use a unique `SPK` and `JWT_SECRET` per deployment.
- Set explicit `CORS_ORIGINS` for browser production deployments.
- Pick a mail retention TTL that matches the mission or pilot.
