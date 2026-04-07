# @vex-chat/types

## 1.0.0-rc.2

### Minor Changes

- Add platform adapter types and unify tooling.

    **New types**:
    - `IUser` / `IUserRecord` split — `IUser` is the public-facing shape, `IUserRecord` extends it with DB fields
    - `KeyStore` and `StoredCredentials` interfaces for platform-agnostic key storage

    **Tooling**:
    - Strict tsconfig (es2024 target, full strict flags)
    - Unified formatting: prettier 4-space tabs, eslint flat config, removed tslint
    - Consistent scripts: `format`, `format:check`, `lint`, `lint:fix`

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
