---
"@vex-chat/types": minor
"@vex-chat/libvex": minor
"@vex-chat/spire": minor
"@vex-chat/cli": minor
---

Adds App Store and Google Play subscription verification across the stack. `@vex-chat/types` exports new billing schemas and types (`BillingProduct`, `BillingSubscription`, `BillingAccountState`, `AppleTransactionVerificationRequest`, `GooglePurchaseVerificationRequest`, and related validators); `@vex-chat/libvex` exposes a `client.billing` API for fetching the product catalog, retrieving subscription state, and submitting store transactions for server-side verification; `@vex-chat/spire` gains billing verification endpoints and the backing database schema and migration; `@vex-chat/cli` adds an `entitlements` command to inspect account subscription state from the terminal.
