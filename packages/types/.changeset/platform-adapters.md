---
"@vex-chat/types": minor
---

Add platform adapter types and unify tooling.

**New types**:

- `IUser` / `IUserRecord` split — `IUser` is the public-facing shape, `IUserRecord` extends it with DB fields
- `KeyStore` and `StoredCredentials` interfaces for platform-agnostic key storage

**Tooling**:

- Strict tsconfig (es2024 target, full strict flags)
- Unified formatting: prettier 4-space tabs, eslint flat config, removed tslint
- Consistent scripts: `format`, `format:check`, `lint`, `lint:fix`
