/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Kysely } from "kysely";

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex("channels_serverID_idx").ifExists().execute();
    await db.schema.dropIndex("devices_owner_deleted_idx").ifExists().execute();
    await db.schema.dropIndex("permissions_user_type_idx").ifExists().execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createIndex("devices_owner_deleted_idx")
        .ifNotExists()
        .on("devices")
        .columns(["owner", "deleted"])
        .execute();
    await db.schema
        .createIndex("channels_serverID_idx")
        .ifNotExists()
        .on("channels")
        .column("serverID")
        .execute();
    await db.schema
        .createIndex("permissions_user_type_idx")
        .ifNotExists()
        .on("permissions")
        .columns(["userID", "resourceType"])
        .execute();
}
