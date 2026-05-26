/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Kysely } from "kysely";

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable("device_passkey_approvals").ifExists().execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable("device_passkey_approvals")
        .ifNotExists()
        .addColumn("deviceID", "varchar(255)", (cb) => cb.primaryKey())
        .addColumn("userID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("approvedByPasskeyID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("approvedByDeviceID", "varchar(255)")
        .addColumn("approvedAt", "text", (cb) => cb.notNull())
        .execute();

    await db.schema
        .createIndex("device_passkey_approvals_user_idx")
        .ifNotExists()
        .on("device_passkey_approvals")
        .columns(["userID", "deviceID"])
        .execute();
}
