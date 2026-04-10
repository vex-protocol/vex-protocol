# AGENTS.md

Guardrails for AI agents (and humans pairing with them) working in this repo.
The release pipeline is fully automated via [Changesets](https://github.com/changesets/changesets) — agents that try to "help" by hand-editing the things the pipeline generates WILL break the flow. Read this before touching anything in the lists below.

## Release flow (how it actually works)

1. A feature branch lands a code change **and** a changeset file in `.changeset/<slug>.md`. The changeset file declares the semver bump (`patch`/`minor`/`major`) and a user-facing summary — nothing else.
2. The changeset file is written either:
    - **Automatically** by `.github/workflows/auto-changeset.yml`, which runs Claude on every human PR and generates a changeset if one is missing, **or**
    - **Manually** by a human in `.changeset/<slug>.md` if they want to control the wording.
    - **Dependabot PRs are exempt** — they merge without a changeset and get bundled into the next human-authored release. See "Dependabot PRs" below.
3. PR merges to `master`.
4. `.github/workflows/release.yml` runs `changesets/action`. If there are pending changesets, it opens a `chore: version packages` PR that:
    - bumps `package.json` version
    - rewrites `CHANGELOG.md`
    - deletes the consumed `.changeset/*.md` files
    - regenerates `openapi.json` / `asyncapi.json` so their `info.version` tracks the new package version (wired via the `ci:version` npm script)
5. Merging the `chore: version packages` PR re-runs `release.yml`, which publishes to npm with provenance.

**The agent's job in all of this is step 1 and only step 1.** Everything else is the action's job.

## NEVER do these (locally OR in CI)

- ❌ Run `npx changeset version` / `changeset version`. That's the release action's job. Running it locally bakes version bumps and CHANGELOG rewrites into feature commits, which then collide with (or skip) the release PR.
- ❌ Hand-edit `package.json`'s `version` field. The release action owns it.
- ❌ Hand-edit `CHANGELOG.md`. It is regenerated from changeset files. Any manual edit will be overwritten or create a conflict on the next release.
- ❌ Hand-edit `openapi.json` or `asyncapi.json`. They are generated from Zod schemas by `scripts/generate-openapi.ts` and `scripts/generate-asyncapi.ts`, and their `info.version` is read from `package.json`. To change them, edit the schemas or the generators and run `npm run specs`.
- ❌ Run `npx changeset publish`. Publishing only happens from `release.yml` on `master`.
- ❌ Run `npx changeset pre enter` / `pre exit`. Pre-release mode is a deliberate choice that flips the whole release flow; if you think you need it, stop and ask the human.
- ❌ Delete files from `.changeset/` unless you are removing a changeset you just wrote in error in the same session. Consumed changesets are deleted by `changeset version`; deleting them any other way drops the corresponding CHANGELOG entry.

## SAFE to do

- ✅ Create a new `.changeset/<short-slug>.md` with frontmatter:

    ```markdown
    ---
    "@vex-chat/types": patch
    ---

    One to three sentences, user-facing, describing impact not implementation.
    ```

    Use `patch` for bugfixes, `minor` for backward-compatible features, `major` for breaking changes.

- ✅ Edit source code in `src/`, scripts, workflows, configs, tests, README, and this file.
- ✅ Run `npm run build`, `npm run lint`, `npm run lint:specs`, `npm run specs:check`, `npm run test:types`, `npm audit` — all read-only w.r.t. the release flow.
- ✅ Run `npm run specs` if you changed a Zod schema or a generator script. Commit the regenerated `openapi.json` / `asyncapi.json` alongside the source change — `specs:check` in CI enforces this.

## Generated / machine-owned files

Treat these as **outputs**, not sources. The source of truth is listed in parentheses.

| File                     | Source                                          | Written by               |
| ------------------------ | ----------------------------------------------- | ------------------------ |
| `package.json` `version` | changeset bumps                                 | `changesets/action`      |
| `CHANGELOG.md`           | `.changeset/*.md`                               | `changesets/action`      |
| `openapi.json`           | `src/schemas/` + `scripts/generate-openapi.ts`  | `npm run openapi`        |
| `asyncapi.json`          | `src/schemas/` + `scripts/generate-asyncapi.ts` | `npm run asyncapi`       |
| `package-lock.json`      | `package.json` + registry                       | `npm install` / `npm ci` |
| `api/types.api.md`       | public type surface                             | `npm run lint:api`       |
| `dist/`                  | `src/`                                          | `npm run build`          |

## Dependabot PRs

Dependabot PRs are deliberately treated as second-class citizens by the release flow:

- `build.yml`'s `Check for changeset` step skips when `github.actor == 'dependabot[bot]'`, so dependabot PRs don't fail CI on the missing-changeset check.
- `auto-changeset.yml` does not run on bot-authored PRs (the `user.type != 'Bot'` filter).
- Merged dependabot PRs land on master with **no corresponding `.changeset/*.md` file**, so `release.yml` sees nothing to process for that merge alone. The dep bumps get silently bundled into the next human-authored release whenever the next real changeset ships.

**Why not auto-generate one?** Three stacked GitHub constraints make it not worth the complexity for this project:

1. Dependabot PRs can't access regular repository secrets (including `ANTHROPIC_API_KEY`) — dependabot secrets are a separate bucket. Claude can't run on them.
2. Dependabot PRs get a read-only `GITHUB_TOKEN`, so a sibling workflow can't write a changeset back to the PR branch without a PAT.
3. Even a successful PAT-authored push would need to re-trigger `build.yml` on the new head sha, which requires the push to _also_ be authored by a PAT — otherwise branch protection blocks the merge.

**If a dep bump deserves its own CHANGELOG entry** (e.g., a `zod` prod-dep upgrade that's user-visible), write a manual `.changeset/<slug>.md` as an extra commit on the dependabot PR before merging. That's the one case where hand-writing a changeset is expected.

## If you're unsure

- Want to ship a change? Edit code, stop. Either write one `.changeset/*.md` file or let the auto-changeset workflow write it on the PR.
- A CI check is failing with "missing changeset"? Add a changeset file. Do not bump the version to silence the check.
- You think the release is broken? Read `.github/workflows/release.yml` and `.github/workflows/auto-changeset.yml` end-to-end before changing anything, and prefer asking the human over "fixing" the workflow.

## Required secrets (informational)

- `NPM_TOKEN` — npm publish token for the `@vex-chat` scope
- `ANTHROPIC_API_KEY` — used by `auto-changeset.yml` to generate changesets
- `SOCKET_API_KEY` — Socket.dev supply-chain scan in `build.yml`
- `GITHUB_TOKEN` — provided automatically
