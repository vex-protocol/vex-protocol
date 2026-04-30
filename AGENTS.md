# AGENTS.md

Guardrails for AI agents (and humans pairing with them) working in this monorepo. The release pipeline is fully automated via [Changesets](https://github.com/changesets/changesets) and publishes to npm with OIDC provenance. Agents that try to "help" by hand-editing the things the pipeline generates — or by bypassing the changesets flow entirely — WILL break the flow. Read this before touching anything in the lists below.

This file is the **shared rules** for every package. Each package has its own `AGENTS.md` for package-specific shape (entry points, runtime quirks, library-quality gates). Read both when working on a package.

## Layout

```
protocol/
├── apps/spire/                  # @vex-chat/spire    (server, published)
├── packages/types/              # @vex-chat/types    (wire-protocol types, published)
├── packages/crypto/             # @vex-chat/crypto   (crypto primitives, published)
├── packages/libvex/             # @vex-chat/libvex   (SDK, published)
├── packages/eslint-config/      # @vex-chat/eslint-config (private)
├── .changeset/                  # consolidated changesets config + pending changesets
└── .github/workflows/           # build, release, auto-changeset, codeql, scorecard
```

Cross-package deps inside the workspace use `workspace:^` so the published tarball gets a caret range (`^X.Y.Z`) for downstream consumers. pnpm rewrites the `workspace:` form at publish time.

## Release flow (how it actually works)

Each of the four published packages versions independently. The full loop:

1. A feature branch lands a code change **and** a changeset file in `.changeset/<slug>.md`. The changeset declares the semver bump per affected package and a user-facing summary — nothing else.
2. The changeset file is written either:
    - **Automatically** by `.github/workflows/auto-changeset.yml`, which runs Claude on every human PR and generates a changeset (covering whichever packages the PR touched) if one is missing, **or**
    - **Manually** by a human (`pnpm changeset` interactive, or hand-write `.changeset/<slug>.md`) if they want to control the wording.
    - **Dependabot PRs are exempt** — they merge without a changeset and get bundled into the next human-authored release. See "Dependabot PRs" below.
3. PR merges to `master`.
4. `.github/workflows/release.yml` runs `changesets/action`. If there are pending changesets, it opens a `chore: version packages` PR that:
    - bumps each affected `package.json`'s `version`
    - rewrites each affected `CHANGELOG.md` (per-package, at the package root)
    - rewrites cross-package `workspace:^` refs into resolved ranges where needed
    - deletes the consumed `.changeset/*.md` files
5. Merging the `chore: version packages` PR re-runs `release.yml`, which calls `pnpm exec changeset publish` and publishes every bumped package to npm with provenance via OIDC trusted publishing.

**The agent's job in all of this is step 1 and only step 1.** Everything after that is the action's job.

### Why OIDC, no NPM_TOKEN

The release workflow has `permissions: id-token: write` and **no `NPM_TOKEN` env var anywhere** — npm's CLI authenticates via the OIDC token directly. Per the security ADR carried over from chat-ui-monorepo: when both OIDC and a classic token are present, npm CLI prefers the token, defeating the supply-chain protection. An empty-string `NPM_TOKEN` still defeats OIDC fallback (npm/cli#8976), so it must not be declared at all. Trusted publisher entries are configured per-package on npmjs.com pointing at `vex-protocol/vex-protocol` + `release.yml`.

## NEVER do these (locally OR in CI)

- ❌ Run `pnpm changeset version` / `changeset version`. That's the release action's job. Running it locally bakes version bumps and CHANGELOG rewrites into feature commits, which then collide with (or skip) the release PR.
- ❌ Hand-edit any `package.json`'s `version` field. The release action owns it.
- ❌ Hand-edit any `CHANGELOG.md`. They are regenerated from changeset files. Any manual edit will be overwritten or create a conflict on the next release.
- ❌ Run `pnpm changeset publish` / `changeset publish`. Publishing only happens from `release.yml` on `master`.
- ❌ Set `"private": true` on any of the four published packages (`@vex-chat/spire`, `types`, `crypto`, `libvex`). Doing so blocks publish and breaks the release flow. `@vex-chat/eslint-config` _is_ and stays private.
- ❌ Add `NPM_TOKEN` (or `NODE_AUTH_TOKEN`) to any workflow. OIDC-only is load-bearing — adding the token would silently downgrade every publish. See `release.yml` comments.
- ❌ Run `pnpm changeset pre enter` / `pre exit`. Pre-release mode is a deliberate choice that flips the whole release flow; if you think you need it, stop and ask the human.
- ❌ Delete files from `.changeset/` unless you are removing a changeset you just wrote in error in the same session. Consumed changesets are deleted by `changeset version`; deleting them any other way drops the corresponding CHANGELOG entry.
- ❌ Change a `workspace:^` cross-package ref to `workspace:*` or to a fixed version. The caret form is what gives downstream consumers normal SemVer dedup at publish time.
- ❌ Move per-package `overrides` blocks back from root `pnpm.overrides`. pnpm only honors overrides at workspace root; per-package blocks are silently ignored, which is a footgun for supply-chain pins.

## SAFE to do

- ✅ Create a new `.changeset/<short-slug>.md` with frontmatter listing whichever packages the change touches and at what level:

    ```markdown
    ---
    "@vex-chat/libvex": minor
    "@vex-chat/types": patch
    ---

    One to three sentences, consumer-facing, describing impact not implementation.
    ```

    Use `patch` for bugfixes, `minor` for backward-compatible features, `major` for breaking changes (only for packages past 1.0).

- ✅ Edit source code in any package's `src/`, scripts, configs, tests, README, or per-package `AGENTS.md`.
- ✅ Run any of these from the repo root — all read-only w.r.t. the release flow:
    - `pnpm install` / `pnpm -r build` / `pnpm test` / `pnpm lint` / `pnpm format:check` / `pnpm license:check` / `pnpm lint:pkg`
    - `pnpm exec changeset status` (see what would publish on next release)
    - `pnpm changeset` (interactive — write a changeset)
- ✅ Run package-specific scripts via `pnpm --filter @vex-chat/<name> <script>` — see each package's AGENTS.md for what's worth knowing.

## Generated / machine-owned files

Treat these as **outputs**, not sources. Source of truth listed in parentheses. Per-package files (e.g. `api/*.api.md`, generated specs) are listed in that package's AGENTS.md.

| File                           | Source                                 | Written by                         |
| ------------------------------ | -------------------------------------- | ---------------------------------- |
| `<pkg>/package.json` `version` | changeset bumps                        | `changesets/action`                |
| `<pkg>/CHANGELOG.md`           | `.changeset/*.md` + `changelog-github` | `changesets/action`                |
| `pnpm-lock.yaml` (root)        | every `package.json` + registry        | `pnpm install`                     |
| `<pkg>/dist/`                  | `<pkg>/src/`                           | `pnpm --filter <pkg> build`        |
| `<pkg>/docs/`                  | `<pkg>/src/` + TSDoc comments          | `pnpm --filter <pkg> docs` (local) |

There is **no per-package `package-lock.json`**, **no per-package `.tool-versions`**, and **no per-package `mise.toml`** — the root `pnpm-lock.yaml` + `.tool-versions` + `mise.toml` are authoritative.

## Dependabot PRs

Dependabot PRs are deliberately treated as second-class citizens by the release flow:

- `build.yml`'s `Check for changeset` step skips when `github.actor == 'dependabot[bot]'`, so dependabot PRs don't fail CI on the missing-changeset check.
- `auto-changeset.yml` does not run on bot-authored PRs (the `user.type != 'Bot'` filter).
- Merged dependabot PRs land on master with **no corresponding `.changeset/*.md` file**, so `release.yml` sees nothing to process for that merge alone. The dep bumps get silently bundled into the next human-authored release whenever the next real changeset ships.

**Why not auto-generate one?** Three stacked GitHub constraints make it not worth the complexity:

1. Dependabot PRs can't access regular repository secrets (including `ANTHROPIC_API_KEY`) — dependabot secrets are a separate bucket. Claude can't run on them.
2. Dependabot PRs get a read-only `GITHUB_TOKEN`, so a sibling workflow can't write a changeset back to the PR branch without a PAT.
3. Even a successful PAT-authored push would need to re-trigger `build.yml` on the new head sha, which requires the push to _also_ be authored by a PAT — otherwise branch protection blocks the merge.

**If a dep bump deserves its own CHANGELOG entry** (e.g., a major upgrade in a published package's prod-deps that changes observable behavior), write a manual `.changeset/<slug>.md` as an extra commit on the dependabot PR before merging.

## If you're unsure

- Want to ship a change? Edit code, stop. Either write one `.changeset/*.md` file or let `auto-changeset.yml` write it on the PR.
- A CI check is failing with "missing changeset"? Add a changeset file. Do not bump versions to silence the check.
- Did you edit only workflows, configs, tests, or docs? Add an **empty changeset** (`---\n---\n`) to tell the release flow there's nothing to publish.
- You think the release is broken? Read `.github/workflows/release.yml` and `.github/workflows/auto-changeset.yml` end-to-end before changing anything, and prefer asking the human over "fixing" the workflow.
- Working on a single package? Read its `AGENTS.md` too — the package-specific rules (entry points, build invariants, library-quality gates) live there.

## Required secrets (informational)

- `ANTHROPIC_API_KEY` — used by `auto-changeset.yml` to generate changesets
- `SOCKET_API_KEY` — Socket.dev supply-chain scan in `build.yml`
- `GITHUB_TOKEN` — provided automatically

There is **no `NPM_TOKEN`** (publishing is via OIDC trusted publishing — see release flow above), **no `DEPLOY_HOOK_*`** (spire's automated deploy webhook was removed; deploys are operator-driven now).

## Non-interactive shell commands

**ALWAYS use non-interactive flags** with file operations to avoid hanging on confirmation prompts.

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i` (interactive) mode on some systems, causing the agent to hang indefinitely waiting for y/n input.

```bash
# Force overwrite without prompting
cp -f source dest           # NOT: cp source dest
mv -f source dest           # NOT: mv source dest
rm -f file                  # NOT: rm file

# Recursive operations
rm -rf directory            # NOT: rm -r directory
cp -rf source dest          # NOT: cp -r source dest
```

Other commands that may prompt:

- `scp` — use `-o BatchMode=yes`
- `ssh` — use `-o BatchMode=yes` to fail instead of prompting
- `apt-get` — use `-y`
- `brew` — use `HOMEBREW_NO_AUTO_UPDATE=1`
