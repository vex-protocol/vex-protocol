---
"@vex-chat/types": major
---

Wire protocol is now defined by Zod schemas, with OpenAPI 3.1 and AsyncAPI 3.0 documents generated from them and shipped as subpath exports. Every exported type gains a runtime validator, and interfaces are the source of truth.

### New features

- **Runtime-validated schemas**. Every type is paired with an `XSchema` that validates at runtime: `UserSchema.parse(data)`, `KeyBundleSchema.safeParse(data)`, etc. Backed by Zod 4.x (new production dependency). The old compile-time-only interfaces remain exported for consumers that don't need validation.
- **OpenAPI 3.1 spec** shipped as `./openapi.json` subpath export, generated from the Zod schemas. 17 REST paths covering auth, registration, users, servers, channels, invites, tokens, and health. Import with `import openapi from "@vex-chat/types/openapi.json" with { type: "json" }`.
- **AsyncAPI 3.0 spec** shipped as `./asyncapi.json` subpath export. 11 WebSocket message types (5 client→server, 6 server→client).
- **`WSMessage` discriminated union** covering all 11 WS message variants. `switch (msg.type)` narrows automatically, and TypeScript will flag non-exhaustive handlers.
- **Literal `type` fields** on all WS message schemas (`z.literal("success")`, `z.literal("error")`, etc.), enabling the discriminated union.

### Breaking changes

- **`I` prefix dropped from all interfaces.** `IUser` → `User`, `IDevice` → `Device`, `IKeyBundle` → `KeyBundle`, `IMailWS` → `MailWS`, and so on. Schemas use the `XSchema` suffix instead (e.g. `UserSchema`, `DeviceSchema`).
- **Date fields migrate from `Date` objects to ISO 8601 strings** on the wire. Timestamp fields on all messages, records, and tokens are now `string`. Apps convert to `Date` at the display layer.
- **`ISucessMsg` typo fixed** → `SuccessMsg` (type) / `SuccessMsgSchema` (schema).
- **`KeyStore` and `StoredCredentials` removed** — these were platform-storage concerns, not wire types. They have moved to `@vex-chat/libvex-js`. Consumers that imported them from `@vex-chat/types` should update their import.
- **`zod` is now a required production dependency.** Consumers on package managers that don't auto-install `dependencies` need to add it explicitly. No peer dependencies.
- **`PreKeysWS` is now an alias for `KeyBundleEntry`** (was a duplicated shape).
- **Package description changed** from "Types for vex" to "Wire protocol types for the Vex encrypted chat platform" (metadata only; not an API change but visible in `npm view`).

### Non-breaking changes

- **Node engine floor is `>=18.0.0`** (previously `>=24` briefly, now relaxed). `npm >=10` required.
- **Type coverage is 100%**, enforced in CI via `type-coverage --strict --at-least 100`.
- **Type-boundary enforcement**: committed `api-extractor` report at `api/types.api.md`, plus `publint` and `@arethetypeswrong/cli` in CI, with type-level assertions via native `tsc`.
- **Spectral linting** of both specs in CI, plus a drift-detection check that regenerates specs and fails on uncommitted diffs.
- **Every schema has `.describe()` metadata** so generated OpenAPI/AsyncAPI docs carry useful descriptions.
- **CI split into parallel jobs** (`build`, `lint`, `types`, `package`, `specs`, `supply-chain`, `changeset`) with a single `CI OK` aggregator as the branch-protection required check.
- **npm publish provenance** enabled on the release workflow — tarballs carry an SLSA attestation linking the published package to the exact build.
- **Supply-chain hardening**: all GitHub Actions pinned to SHA, dependency licenses validated, `npm audit --audit-level=high` in CI, Socket.dev scan, CodeQL, OSSF Scorecard.
- **npm `overrides` for transitive CVEs**: `lodash ^4.18.1`, `minimatch ^9.0.9`, `rollup ^4.60.1` — all high-severity advisories surfaced by `npm audit` through `@stoplight/spectral-cli` and `@asyncapi/parser` dev tooling now resolve to patched versions.
- **README expanded** with usage docs and badges (type-coverage, bundle size, release date).

### Migration notes

For consumers upgrading from `1.0.1`:

1. Rename imports: `import type { IUser } from "@vex-chat/types"` → `import type { User } from "@vex-chat/types"`.
2. Replace uses of `Date` in message/record fields with ISO 8601 strings (zod will reject `new Date()` at parse time).
3. If you were importing `KeyStore` or `StoredCredentials`, switch the import to `@vex-chat/libvex-js`.
4. If you want runtime validation, start using the paired `XSchema` exports: `const user = UserSchema.parse(untrustedInput)`.
5. Add `zod` to your lockfile if your package manager doesn't resolve it automatically.
