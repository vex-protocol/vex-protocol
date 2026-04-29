# `packages/crypto` — AGENTS.md

Crypto-specific rules. Shared rules (release flow, NEVER list, dependabot policy, secrets, etc.) live in the **root `AGENTS.md`** — read that first.

## What this package is

`@vex-chat/crypto` — crypto primitives for the Vex platform (X25519/Ed25519, hashing, base64/utf8, mnemonic, msgpack). Consumed by `@vex-chat/libvex` and `@vex-chat/spire` via `workspace:^`. Has a peer dependency on `@vex-chat/types` (also `workspace:^`).

## What ships in the npm tarball

Per `files: [...]`:

- `dist/` — compiled JS + `.d.ts` from `tsc -p tsconfig.build.json`
- `src/` — shipped for consumer auditability (minus `src/__tests__/**`, excluded by `tsconfig.build.json`)
- `package.json`, `README.md`, `LICENSE`, `LICENSE-COMMERCIAL`, `LICENSING.md`, `CLA.md`, `CHANGELOG.md`

Anything else — `.github/`, tsconfig files, eslint config, `src/__tests__/**`, `vitest.config.ts`, `api-extractor.json`, `typedoc.json`, `AGENTS.md`, `CHANGELOG.md` itself — is NOT in the tarball's footprint and is NOT user-visible. PRs touching only those should ship an empty changeset.

## Vitest multi-project

`vitest.config.ts` defines two projects so CI can split them and so failures attribute clearly:

- `core` — `pnpm --filter @vex-chat/crypto test:core` — crypto primitives unit tests
- `async-api` — `pnpm --filter @vex-chat/crypto test:async-api` — schema/IO contract tests

`pnpm --filter @vex-chat/crypto test` runs both (default vitest). The two project commands exist so CI can step them separately.

## Generated machine-owned files

| File                | Source                  | Written by                                    |
| ------------------- | ----------------------- | --------------------------------------------- |
| `api/crypto.api.md` | public type surface     | `pnpm --filter @vex-chat/crypto lint:api`     |
| `dist/`             | `src/`                  | `pnpm --filter @vex-chat/crypto build`        |
| `docs/`             | `src/` + TSDoc comments | `pnpm --filter @vex-chat/crypto docs` (local) |
