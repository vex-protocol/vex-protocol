# Vex documentation index

Use this page as the **entry point** for public protocol, client, server, and security documentation in this repository.

---

## Primary docs

| Topic | Description |
|--------|-------------|
| **[Spire — reference server](../apps/spire/README.md)** | Install, Docker quick start, env vars, TLS, and how Spire fits in the stack. |
| **[libvex — TypeScript client](../packages/libvex/README.md)** | Client install, storage backends, crypto profiles, and integration with Spire. |
| **[Protocol threat model](security/threat-model.md)** | Security model: trust boundaries, adversaries, crypto usage, and operational assumptions. |
| **[Spire “box” instructions](../apps/spire/AGENTS.md)** | How `@vex-chat/spire` is published as a **box of files** for operators (what ships in the npm tarball, runtime boot model, CI integration jobs). Read this before packaging or deploying Spire from source. |

---

## Operations

- **[Single-node Spire deployment and teardown](ops/single-node-runbook.md)** — concrete runbook for a one-node install and teardown.

---

## Related packages (deeper dives)

- [`@vex-chat/crypto`](../packages/crypto/README.md) — primitives and profiles (`tweetnacl` vs FIPS-shaped async APIs).
- [`@vex-chat/types`](../packages/types/README.md) — shared wire schemas.

---

## Maintenance

Keep docs in this repository when they describe the public protocol, security model, wire behavior, reference implementation, or operational deployment of the stack. Private strategy and pitch material belongs outside this tree.
