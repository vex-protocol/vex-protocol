# `apps/spire` — AGENTS.md

Spire-specific rules. Shared rules (release flow, NEVER list, dependabot policy, secrets, etc.) live in the **root `AGENTS.md`** — read that first.

## What this package is

`@vex-chat/spire` — the Vex server, Rust runtime with the previous Node implementation kept in `src/` for reference and transition work. Published to npm as a "box of files" that operators install and run; _not_ a library to be imported. There is **no `main`, `types`, `exports`, or `bin`** field in `package.json` — that's intentional. Don't add library entry points.

## Runtime shape

- Boot via `cargo run --manifest-path rust/Cargo.toml --` (the package `start` script does this).
- The legacy Node server can still be started with `pnpm --filter @vex-chat/spire start:node`.
- `dist/` is still built in CI as a TypeScript sanity check and shipped in the tarball, but it's not the runtime entry point.
- Docker Compose nginx owns passkey platform association files (`/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json`) and generates them from `SPIRE_PASSKEY_*` env values at container startup. Bare Rust has local-dev fallbacks for those paths, but the containerized deployment must keep them nginx-owned so nginx only receives public passkey metadata.

## What ships in the npm tarball

- `dist/` — compiled JS + `.d.ts` produced by `tsc`
- `src/` — legacy Node implementation, shipped for operator auditability during the Rust transition
- `rust/` — Rust server source and lockfile used by the default runtime
- `package.json`, `README.md`, `LICENSE`, `LICENSE-COMMERCIAL`, `LICENSING.md`, `CLA.md`, `CHANGELOG.md`

Anything else — `.github/`, tsconfig, eslint config, `src/__tests__/**`, `vitest.config.ts`, `AGENTS.md`, `scripts/` (dev utilities), `services/` (sibling service helpers — currently `status-monitor/`), `public/` (static docs assets served by the running server) — is NOT in the tarball's footprint and is NOT user-visible. PRs touching only those files should ship an **empty changeset** (`---\n---\n`).

## Integration jobs in CI

`.github/workflows/spire-integration-cli.yml` runs the Docker-backed stable integration scenarios in addition to the main `build.yml` checks:

- **`integration:cli (tweetnacl)`** — uses `gen-spk.js`, default server profile, starts the Docker Compose stack, then runs `chat`, `mixed`, `whoami`, and `servers` scenarios against `127.0.0.1:16777`.
- FIPS integration is tracked separately; the Docker-backed CI matrix currently exercises tweetnacl/Ed25519.

Both build the same image and use a fresh GHA layer cache. The repo previously ran a multi-OS matrix for native edge cases — if you reintroduce that, don't drop coverage without reason.

## Deploy

Spire is published to npm via the unified `release.yml` like the other packages, but **no automated production deploy fires from CI**. Operators pull the new version manually and restart (`pm2 restart spire` or equivalent).

If you want to bring deploy automation back, the `changesets/action` step in `release.yml` exposes a `publishedPackages` output you can gate on:

```yaml
if: contains(fromJson(steps.changesets.outputs.publishedPackages).*.name, '@vex-chat/spire')
```

The `services/deploy-hook/` receiver that used to listen for that webhook was removed — see commit history if you need a starting point.
