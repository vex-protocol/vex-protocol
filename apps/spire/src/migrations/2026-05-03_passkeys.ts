/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Kysely } from "kysely";

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable("passkeys").ifExists().execute();
}

// Passkeys are an administrative second-class credential alongside
// `devices`. They cannot send/decrypt mail (no ratchet keys), but they
// can authenticate the owning user, list devices, delete devices, and
// approve/reject pending device-enrollment requests — i.e. account
// recovery and provisioning.
//
// `credentialID` is the WebAuthn credential id (base64url, opaque), and
// is unique across all passkeys. `publicKey` is the COSE_Key bytes
// returned by the authenticator, hex-encoded for storage. `signCount`
// is the WebAuthn signature counter (monotonic) used to detect cloned
// authenticators. `transports` is a comma-separated list of hints
// ("usb,nfc,ble,internal,hybrid") so subsequent assertions can request
// the right transport.
export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable("passkeys")
        .ifNotExists()
        .addColumn("passkeyID", "varchar(255)", (cb) => cb.primaryKey())
        .addColumn("userID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("name", "varchar(255)", (cb) => cb.notNull())
        .addColumn("credentialID", "varchar(512)", (cb) =>
            cb.unique().notNull(),
        )
        .addColumn("publicKey", "text", (cb) => cb.notNull())
        .addColumn("algorithm", "integer", (cb) => cb.notNull())
        .addColumn("signCount", "integer", (cb) => cb.notNull().defaultTo(0))
        .addColumn("transports", "varchar(255)", (cb) =>
            cb.notNull().defaultTo(""),
        )
        .addColumn("createdAt", "text", (cb) => cb.notNull())
        .addColumn("lastUsedAt", "text")
        .execute();

    await db.schema
        .createIndex("passkeys_userID_idx")
        .ifNotExists()
        .on("passkeys")
        .column("userID")
        .execute();
}
