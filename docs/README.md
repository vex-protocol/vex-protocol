# Vex documentation index

Public protocol, security, and deployment documentation for Vex. Use this page
as the **entry point** for public protocol, client, server, and security
documentation in this repository. Private planning, sales, and readiness
material stays in `vex-refinery`.

---

## Primary docs

| Topic | Description |
|--------|-------------|
| **[Spire — reference server](../apps/spire/README.md)** | Install, Docker quick start, env vars, TLS, and how Spire fits in the stack. |
| **[libvex — TypeScript client](../packages/libvex/README.md)** | Client install, storage backends, crypto profiles, and integration with Spire. |
| **[Protocol threat model](security/threat-model.md)** | Security model: trust boundaries, adversaries, crypto usage, and operational assumptions. |
| **[Spire package/runtime notes](../apps/spire/AGENTS.md)** | What ships in the `@vex-chat/spire` npm tarball, how the runtime boots, and how CI exercises the package. Read this before packaging or deploying Spire from source. |

---

## Operations

- **[Single-node Spire deployment and teardown](ops/single-node-runbook.md)** — concrete runbook for the hardware-controlled "box" pattern: spin up one node, provision it, operate it, and tear it down.

---

## Related packages (deeper dives)

- [`@vex-chat/crypto`](../packages/crypto/README.md) — primitives and profiles (`tweetnacl` vs FIPS-shaped async APIs).
- [`@vex-chat/types`](../packages/types/README.md) — shared wire schemas.

---

## Maintenance

Keep docs in this repository when they describe the public protocol, security model, wire behavior, reference implementation, or operational deployment of the stack. Keep private strategy and pitch material out of this tree.
