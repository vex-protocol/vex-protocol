# @vex-chat/types

## 1.0.1

### Patch Changes

- Platform adapter types, sourcemaps, tarball hygiene, and tooling cleanup.

    **Type surface** (runtime-safe, but may require type updates in consumers):
    - `BaseMsg.data` changed from `Buffer` to `Uint8Array`. `Buffer` is Node-only and blocked browser consumers; `Uint8Array` is a supertype of `Buffer` at runtime, so existing Node callers keep working, but code that was typed against `Buffer` needs updating.
    - `IUser` / `IUserRecord` split — `IUser` is the public-facing shape (`userID`, `username`, `lastSeen`); `IUserRecord` extends it with DB-only fields (`passwordHash`, `passwordSalt`). Previously conflated.
    - New `KeyStore` interface (`load` / `save` / `clear`) and `StoredCredentials` interface (`username`, `deviceID`, `deviceKey`, `preKey?`, `token?`) for platform-agnostic key storage.
    - Sourcemaps (`.js.map` + `.d.ts.map`) now ship in `dist/`.

    **Packaging**:
    - Added `files: ["dist"]` — the published tarball is now limited to `dist/` + `LICENSE` + `README.md` + `package.json`. Previously leaked `CHANGELOG.md`, `RELEASING.md`, `eslint.config.js`, `mise.toml`, `.husky/`, and `.changeset/`.

    **Tooling**:
    - Strict tsconfig (es2024 target, full strict flags).
    - Unified formatting: prettier 4-space tabs, eslint flat config, removed tslint.
    - `build` no longer `rimraf`s first (preserves hardlinks / incremental builds). `build:clean` added for full rebuilds.
    - Scripts renamed for consistency: `format` / `format:check` (was `prettier`), `lint:fix` (was `lint-fix`).
    - `lint-staged` glob fixed from `src/**/*.{ts}` to `*.ts` and now also runs prettier.

## 1.0.0-rc.1

### Minor Changes

- ce0dbb0: Modernize package toolchain and shape.

    **Breaking for consumers on CJS**: types-js is now pure ESM (`"type": "module"` + `"exports"` with import conditional). CJS consumers must use dynamic `import()`.

    **Breaking transitive**: `tweetnacl` moved from `dependencies` to optional `peerDependencies`. Consumers that use `IXKeyRing`, `IPreKeysCrypto`, or any type referencing `nacl.BoxKeyPair` must declare their own tweetnacl dependency. All current downstream consumers (crypto-js, libvex, spire) already do.

    **Non-breaking**:
    - `"sideEffects": false` added — bundlers can tree-shake unused type exports
    - `import type` used for the tweetnacl reference — elided at runtime, no emitted import

    **Internal**:
    - Pinned to Node 24.14.0 via mise
    - Migrated from yarn to npm (yarn.lock removed, package-lock.json committed)
    - Upgraded TypeScript 5.7 → 6.0.2, `@types/node` → 24.12.2
    - Rewrote tsconfig: `NodeNext`, `verbatimModuleSyntax: true`, `types: ["node"]`
    - Dropped deprecated `esModuleInterop: false` (removed in TS 7.0)
    - GitHub Actions workflows migrated to npm

## 1.0.0-rc.0

### Major Changes

- Flatten XTypes namespace into top-level exports. All types are now exported directly instead of nested under XTypes.CRYPTO, XTypes.HTTP, XTypes.WS, and XTypes.SQL namespaces. Types with naming conflicts have been suffixed (e.g. IMailWS, IMailSQL, IPreKeysWS, IPreKeysSQL, ISessionCrypto, ISessionSQL).
