# `packages/libvex` — AGENTS.md

Libvex-specific rules. Shared rules (release flow, NEVER list, dependabot policy, secrets, etc.) live in the **root `AGENTS.md`** — read that first.

## What this package is

`@vex-chat/libvex` — the Vex SDK. Library consumed by JS/TS clients (browser and node). Past 1.0; breaking changes get major bumps. Depends on `@vex-chat/types` and `@vex-chat/crypto` via `workspace:^`.

## What ships in the npm tarball

Per `files: [...]`:

- `dist/` — compiled JS + `.d.ts` from `tsc` (the actual import target)
- `src/` — shipped for downstream auditability and sourcemap origin lookups
- `package.json`, `README.md`, `LICENSE`, `LICENSE-COMMERCIAL`, `LICENSING.md`, `CLA.md`, `CHANGELOG.md`

Anything else — `.github/`, `tsconfig*.json`, `eslint.config.js`, `vitest.config*.ts`, `typedoc.json`, `api-extractor.json`, `src/__tests__/**`, `api/libvex.api.md`, `AGENTS.md` — is NOT in the tarball's footprint. PRs touching only those should ship an empty changeset.

## Deliberate shape choices (don't "fix" these)

- **Multiple subpath exports under one package.** libvex ships seven entry points (`.`, `./preset/node`, `./preset/test`, `./storage/node`, `./storage/sqlite`, `./storage/schema`, `./keystore/node`, `./keystore/memory`) so platform-specific code (sqlite, native keystore) can stay tree-shakable from browser builds. The `exports` map order is **load-bearing** — every entry must list `types` BEFORE `import` to satisfy `attw`. Don't flatten or reorder.
- **`better-sqlite3` is a peer dependency, not a regular dependency.** Browser consumers must not pull in a native module; node consumers opt in by installing it themselves. The `peerDependenciesMeta.better-sqlite3.optional = true` flag is what makes browser installs not warn. Don't move it back to `dependencies`.
- **Static "no-Buffer / no-node-builtin" check in vitest browser projects.** A vitest plugin scans the bundled output for `\bBuffer\b` / `\bprocess\b` / unprefixed node builtins and fails the browser project on any match. This is what enforces the browser-safety guarantee. Don't disable it. If the check trips on a comment or string literal, reword the source.
- **Library-quality CI gate.** `publint --strict` + `attw` + `api-extractor run --local` run on every PR (in the unified `build.yml`). The api-extractor step also runs `git diff --exit-code api/` so any uncommitted public API drift fails the build. Regenerate `api/libvex.api.md` whenever public types change:

    ```bash
    pnpm --filter @vex-chat/libvex build
    pnpm --filter @vex-chat/libvex lint:api
    git add packages/libvex/api/libvex.api.md
    ```

## E2E suite

`pnpm --filter @vex-chat/libvex test:e2e` runs against a local spire — use it when changing transport, storage, or wire-protocol code. The suite has `node` + `browser` vitest projects.

The e2e job in CI used to be the only matrix-OS job (libvex's cross-OS coverage came from there because it's the layer that exercises native `better-sqlite3` compilation, kysely's `pathToFileURL` migration provider, ESM URL handling on Windows). Whether that matrix lives at the libvex package level or root in this monorepo is TBD — current `build.yml` runs ubuntu-only across all packages.

## Generated machine-owned files

| File                | Source                  | Written by                                    |
| ------------------- | ----------------------- | --------------------------------------------- |
| `api/libvex.api.md` | `dist/index.d.ts`       | `pnpm --filter @vex-chat/libvex lint:api`     |
| `dist/`             | `src/`                  | `pnpm --filter @vex-chat/libvex build`        |
| `docs/`             | `src/` + TSDoc comments | `pnpm --filter @vex-chat/libvex docs` (local) |
