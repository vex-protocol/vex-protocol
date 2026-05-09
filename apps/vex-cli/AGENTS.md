# `apps/vex-cli` — AGENTS.md

CLI-specific rules. Shared rules (release flow, NEVER list, dependabot policy, secrets, etc.) live in the **root `AGENTS.md`** — read that first.

## What this package is

`@vex-chat/cli` — the terminal client for Vex. Published to npm with a `vex-chat` binary that runs `src/vex-chat.js`.

## What ships in the npm tarball

Per `files: [...]`:

- `src/` — runtime CLI entrypoint and helpers
- `theme.yaml` — bundled terminal theme defaults
- `LICENSE`, `LICENSE-COMMERCIAL`, `LICENSING.md`, `CLA.md`

`scripts/` contains local development and smoke helpers and is not part of the published package.

## Release

The CLI publishes through the unified Changesets + npm OIDC release flow in `.github/workflows/release.yml`, like `@vex-chat/spire`, `@vex-chat/libvex`, `@vex-chat/crypto`, and `@vex-chat/types`.
