/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Kysely } from "kysely";

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .dropTable("notification_subscriptions")
        .ifExists()
        .execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable("notification_subscriptions")
        .ifNotExists()
        .addColumn("subscriptionID", "varchar(255)", (cb) => cb.primaryKey())
        .addColumn("userID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("deviceID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("channel", "varchar(32)", (cb) => cb.notNull())
        .addColumn("token", "text", (cb) => cb.notNull())
        .addColumn("platform", "varchar(32)")
        .addColumn("events", "text", (cb) => cb.notNull())
        .addColumn("enabled", "integer", (cb) => cb.notNull().defaultTo(1))
        .addColumn("createdAt", "text", (cb) => cb.notNull())
        .addColumn("updatedAt", "text", (cb) => cb.notNull())
        .execute();

    await db.schema
        .createIndex("notification_subscriptions_device_idx")
        .ifNotExists()
        .on("notification_subscriptions")
        .columns(["deviceID", "channel"])
        .execute();

    await db.schema
        .createIndex("notification_subscriptions_user_idx")
        .ifNotExists()
        .on("notification_subscriptions")
        .columns(["userID", "channel"])
        .execute();

    await db.schema
        .createIndex("notification_subscriptions_token_idx")
        .ifNotExists()
        .on("notification_subscriptions")
        .columns(["channel", "token"])
        .execute();
}
