/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { type Kysely, sql } from "kysely";

const UNIQUE_INDEX_NAME =
    "notification_subscriptions_channel_device_token_unique_idx";

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex(UNIQUE_INDEX_NAME).ifExists().execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await sql`
        DELETE FROM notification_subscriptions
        WHERE rowid NOT IN (
            SELECT MAX(rowid)
            FROM notification_subscriptions
            GROUP BY channel, deviceID, token
        )
    `.execute(db);

    await db.schema
        .createIndex(UNIQUE_INDEX_NAME)
        .ifNotExists()
        .on("notification_subscriptions")
        .columns(["channel", "deviceID", "token"])
        .unique()
        .execute();
}
