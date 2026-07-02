/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Kysely } from "kysely";

export async function down(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .dropTable("billing_store_transactions")
        .ifExists()
        .execute();
    await db.schema
        .dropTable("billing_store_subscriptions")
        .ifExists()
        .execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
    await db.schema
        .createTable("billing_store_subscriptions")
        .ifNotExists()
        .addColumn("subscriptionID", "varchar(255)", (cb) => cb.primaryKey())
        .addColumn("userID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("platform", "varchar(32)", (cb) => cb.notNull())
        .addColumn("environment", "varchar(32)", (cb) => cb.notNull())
        .addColumn("productID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("storeProductID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("tier", "varchar(32)", (cb) => cb.notNull())
        .addColumn("status", "varchar(32)", (cb) => cb.notNull())
        .addColumn("expiresAt", "text")
        .addColumn("externalOriginalID", "varchar(255)")
        .addColumn("externalTransactionID", "varchar(255)")
        .addColumn("purchaseToken", "text")
        .addColumn("purchaseTokenHash", "varchar(128)")
        .addColumn("rawPayload", "text", (cb) => cb.notNull())
        .addColumn("createdAt", "text", (cb) => cb.notNull())
        .addColumn("updatedAt", "text", (cb) => cb.notNull())
        .execute();

    await db.schema
        .createIndex("billing_store_subscriptions_user_idx")
        .ifNotExists()
        .on("billing_store_subscriptions")
        .column("userID")
        .execute();

    await db.schema
        .createIndex("billing_store_subscriptions_original_idx")
        .ifNotExists()
        .on("billing_store_subscriptions")
        .columns(["platform", "environment", "externalOriginalID"])
        .execute();

    await db.schema
        .createIndex("billing_store_subscriptions_token_hash_idx")
        .ifNotExists()
        .on("billing_store_subscriptions")
        .columns(["platform", "environment", "purchaseTokenHash"])
        .execute();

    await db.schema
        .createTable("billing_store_transactions")
        .ifNotExists()
        .addColumn("transactionID", "varchar(255)", (cb) => cb.primaryKey())
        .addColumn("subscriptionID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("userID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("platform", "varchar(32)", (cb) => cb.notNull())
        .addColumn("environment", "varchar(32)", (cb) => cb.notNull())
        .addColumn("storeProductID", "varchar(255)", (cb) => cb.notNull())
        .addColumn("eventType", "varchar(64)", (cb) => cb.notNull())
        .addColumn("externalTransactionID", "varchar(255)")
        .addColumn("purchaseTokenHash", "varchar(128)")
        .addColumn("rawPayload", "text", (cb) => cb.notNull())
        .addColumn("processedAt", "text", (cb) => cb.notNull())
        .execute();

    await db.schema
        .createIndex("billing_store_transactions_subscription_idx")
        .ifNotExists()
        .on("billing_store_transactions")
        .column("subscriptionID")
        .execute();

    await db.schema
        .createIndex("billing_store_transactions_user_idx")
        .ifNotExists()
        .on("billing_store_transactions")
        .column("userID")
        .execute();
}
