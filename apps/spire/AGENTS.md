# `apps/spire` — AGENTS.md

Spire-specific rules. Shared rules (release flow, NEVER list, dependabot policy, secrets, etc.) live in the **root `AGENTS.md`** — read that first.

## What this package is

`@vex-chat/spire` — the Vex server, NodeJS. Published to npm as a "box of files" that operators install and run; _not_ a library to be imported. There is **no `main`, `types`, `exports`, or `bin`** field in `package.json` — that's intentional. Don't add library entry points.

## Runtime shape

- Boot via `node --experimental-strip-types src/run.ts` (in dev and prod). No pre-compile step required for running.
- `dist/` is still built in CI as a sanity check and shipped in the tarball, but it's not the runtime entry point.
- `pnpm --filter @vex-chat/spire start` boots the server locally.

## What ships in the npm tarball

- `dist/` — compiled JS + `.d.ts` produced by `tsc`
- `src/` — shipped for operator auditability and the `--experimental-strip-types` runtime
- `package.json`, `README.md`, `LICENSE`, `LICENSE-COMMERCIAL`, `LICENSING.md`, `CLA.md`, `CHANGELOG.md`

Anything else — `.github/`, tsconfig, eslint config, `src/__tests__/**`, `vitest.config.ts`, `AGENTS.md`, `scripts/` (dev utilities), `services/` (sibling service helpers — currently `status-monitor/`), `public/` (static docs assets served by the running server) — is NOT in the tarball's footprint and is NOT user-visible. PRs touching only those files should ship an **empty changeset** (`---\n---\n`).

## Stress jobs in CI

`build.yml` runs two Docker stress jobs in addition to the main `checks`:

- **`stress (tweetnacl)`** — uses `gen-spk.js`, default server profile, runs `pnpm run stress:cli` against `127.0.0.1:16777` (informational; non-blocking).
- **`stress (FIPS)`** — uses `gen-spk-fips.js`, sets `SPIRE_FIPS=true`, asserts `GET /status` reports `cryptoProfile: fips`. Same `pnpm run stress:cli` path.

Both build the same image and use a fresh GHA layer cache. The repo previously ran a multi-OS matrix for native edge cases — if you reintroduce that, don't drop coverage without reason.

## Deploy

Spire is published to npm via the unified `release.yml` like the other packages, but **no automated production deploy fires from CI**. Operators pull the new version manually and restart (`pm2 restart spire` or equivalent).

If you want to bring deploy automation back, the `changesets/action` step in `release.yml` exposes a `publishedPackages` output you can gate on:

```yaml
if: contains(fromJson(steps.changesets.outputs.publishedPackages).*.name, '@vex-chat/spire')
```

The `services/deploy-hook/` receiver that used to listen for that webhook was removed — see commit history if you need a starting point.
