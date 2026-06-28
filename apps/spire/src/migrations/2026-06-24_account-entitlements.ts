/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Kysely } from "kysely";

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable("account_entitlements").ifExists().execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable("account_entitlements")
        .ifNotExists()
        .addColumn("userID", "varchar(255)", (cb) => cb.primaryKey())
        .addColumn("tier", "varchar(32)", (cb) => cb.notNull())
        .addColumn("source", "varchar(32)", (cb) => cb.notNull())
        .addColumn("expiresAt", "text")
        .addColumn("updatedAt", "text", (cb) => cb.notNull())
        .execute();
}
