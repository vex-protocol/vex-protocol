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

Anything else — `.github/`, tsconfig, eslint config, `src/__tests__/**`, `vitest.config.ts`, `AGENTS.md`, `scripts/` (dev utilities), `services/` (sibling service helpers including the inactive `deploy-hook/` receiver), `public/` (static docs assets served by the running server) — is NOT in the tarball's footprint and is NOT user-visible. PRs touching only those files should ship an **empty changeset** (`---\n---\n`).

## Stress jobs in CI

`build.yml` runs two Docker stress jobs in addition to the main `checks`:

- **`stress (tweetnacl)`** — uses `gen-spk.js`, default server profile, runs `pnpm run stress:cli` against `127.0.0.1:16777` (informational; non-blocking).
- **`stress (FIPS)`** — uses `gen-spk-fips.js`, sets `SPIRE_FIPS=true`, asserts `GET /status` reports `cryptoProfile: fips`. Same `pnpm run stress:cli` path.

Both build the same image and use a fresh GHA layer cache. The repo previously ran a multi-OS matrix for native edge cases — if you reintroduce that, don't drop coverage without reason.

## Deploy-hook

There used to be an automated webhook from `release.yml` that POSTed to `DEPLOY_HOOK_URL` after a successful spire publish. **That's been removed.** The receiver code under `services/deploy-hook/` is still present (and the `service:deploy-hook` script in `package.json`) — it's inactive in CI but still usable for manual / external triggering if you want it. There are no `DEPLOY_HOOK_*` secrets in the workflow anymore.

If you bring deploy automation back, gate it on `changesets/action`'s `publishedPackages` output containing `@vex-chat/spire` (the pattern from before; see git log around protocol-1m8 for how it was wired).
