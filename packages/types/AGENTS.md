# `packages/types` — AGENTS.md

Types-specific rules. Shared rules (release flow, NEVER list, dependabot policy, secrets, etc.) live in the **root `AGENTS.md`** — read that first.

## What this package is

`@vex-chat/types` — wire-protocol types (Zod schemas) for the Vex platform. Pure types + schemas, no runtime side effects. Consumed by `@vex-chat/crypto`, `@vex-chat/libvex`, and `@vex-chat/spire` via `workspace:^`, and by external consumers from npm.

## What ships in the npm tarball

Per `files: [...]`:

- `dist/` — compiled JS + `.d.ts`
- `src/index.ts`, `src/schemas/`
- `openapi.json`, `asyncapi.json`
- `LICENSE`

## Schema-driven specs (load-bearing)

`openapi.json` and `asyncapi.json` are **generated artifacts** — never hand-edited. The pipeline:

| File               | Source                                          | Written by                               |
| ------------------ | ----------------------------------------------- | ---------------------------------------- |
| `openapi.json`     | `src/schemas/` + `scripts/generate-openapi.ts`  | `pnpm --filter @vex-chat/types openapi`  |
| `asyncapi.json`    | `src/schemas/` + `scripts/generate-asyncapi.ts` | `pnpm --filter @vex-chat/types asyncapi` |
| `api/types.api.md` | public type surface                             | `pnpm --filter @vex-chat/types lint:api` |

To change a spec: edit a Zod schema or a generator, then run `pnpm --filter @vex-chat/types specs` (which runs both generators) and commit the regenerated JSON alongside the source change.

The `ci:version` script (`changeset version && pnpm run specs`) regenerates the spec files **during the `chore: version packages` PR generation** so the spec's `info.version` tracks the new package version. CI's `specs:check` step (`pnpm run specs && git diff --exit-code openapi.json asyncapi.json`) enforces that committed specs are in sync with their generators on every PR.

❌ Hand-edit `openapi.json` / `asyncapi.json`. Edit schemas or generators instead.

## Spec linting

`pnpm --filter @vex-chat/types lint:specs` runs spectral against both spec files. It runs in `build.yml`. Don't disable.
