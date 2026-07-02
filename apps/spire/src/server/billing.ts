/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database, StoreSubscriptionUpsertInput } from "../Database.ts";
import type {
    BillingAccountState,
    BillingProduct,
    BillingSubscription,
} from "@vex-chat/types";

import express from "express";

import {
    AccountTierSchema,
    AppleServerNotificationRequestSchema,
    AppleTransactionVerificationRequestSchema,
    datetime,
    GooglePlayDeveloperNotificationRequestSchema,
    GooglePurchaseVerificationRequestSchema,
} from "@vex-chat/types";

import { z } from "zod/v4";

import {
    BillingVerificationError,
    decodeAppleServerNotificationPayload,
    decodeGooglePlayPubSubNotificationPayload,
    getBillingProductCatalog,
    resolveBillingProduct,
    type VerifiedStorePurchase,
    verifyAppleTransaction,
    verifyGooglePurchase,
} from "../BillingVerification.ts";

import { devApiKeyMatches } from "./rateLimit.ts";
import { getUser } from "./utils.ts";
import { sendWireResponse } from "./wireResponse.ts";

import { protect } from "./index.ts";

const devGrantPayload = z.object({
    expiresAt: datetime.nullable().optional(),
    tier: AccountTierSchema,
    userID: z.string().min(1),
});

export function devBillingGrantRoutesEnabled(
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    return (
        env["NODE_ENV"] !== "production" &&
        env["VEX_ENABLE_DEV_BILLING_GRANTS"] === "1" &&
        (env["DEV_API_KEY"]?.trim().length ?? 0) > 0
    );
}

export const getBillingRouter = (
    db: Database,
    notify: (
        userID: string,
        event: string,
        transmissionID: string,
        data?: unknown,
        deviceID?: string,
    ) => void,
) => {
    const router = express.Router();

    router.get("/billing/products", protect, (_req, res) => {
        sendWireResponse(_req, res, getBillingProductCatalog());
    });

    router.get("/billing/account", protect, async (req, res) => {
        const userID = getUser(req).userID;
        const state = await db.retrieveBillingAccountState(userID);
        sendWireResponse(req, res, state);
    });

    router.post("/billing/apple/transactions", protect, async (req, res) => {
        const parsed = AppleTransactionVerificationRequestSchema.safeParse(
            req.body,
        );
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid Apple transaction payload",
                issues: parsed.error.issues,
            });
            return;
        }

        await handleVerifiedPurchase(req, res, {
            db,
            eventType: "apple_transaction_verified",
            notify,
            purchase: await verifyAppleTransaction(parsed.data),
            userID: getUser(req).userID,
        });
    });

    router.post("/billing/google/purchases", protect, async (req, res) => {
        const parsed = GooglePurchaseVerificationRequestSchema.safeParse(
            req.body,
        );
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid Google Play purchase payload",
                issues: parsed.error.issues,
            });
            return;
        }

        await handleVerifiedPurchase(req, res, {
            db,
            eventType: "google_purchase_verified",
            notify,
            purchase: await verifyGooglePurchase(parsed.data),
            userID: getUser(req).userID,
        });
    });

    router.post("/billing/webhooks/apple", async (req, res) => {
        const parsed = AppleServerNotificationRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid Apple server notification payload",
                issues: parsed.error.issues,
            });
            return;
        }

        const notification = decodeAppleServerNotificationPayload(
            parsed.data.signedPayload,
        );
        const signedTransactionInfo = notification.data?.signedTransactionInfo;
        if (!signedTransactionInfo) {
            res.sendStatus(202);
            return;
        }

        const purchase = await verifyAppleTransaction({
            signedTransactionInfo,
        });
        const userID = await db.retrieveStoreSubscriptionOwner({
            environment: purchase.environment,
            externalOriginalID: purchase.externalOriginalID,
            platform: purchase.platform,
        });
        if (!userID) {
            res.sendStatus(202);
            return;
        }

        await handleVerifiedPurchase(req, res, {
            db,
            eventType: `apple_webhook_${notification.notificationType ?? "unknown"}`,
            notify,
            purchase,
            userID,
        });
    });

    router.post("/billing/webhooks/google", async (req, res) => {
        const parsed = GooglePlayDeveloperNotificationRequestSchema.safeParse(
            req.body,
        );
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid Google Play notification payload",
                issues: parsed.error.issues,
            });
            return;
        }
        const notification = decodeGooglePlayPubSubNotificationPayload(
            req.body,
        );
        const purchaseToken =
            notification.subscriptionNotification?.purchaseToken;
        if (!purchaseToken) {
            res.sendStatus(202);
            return;
        }

        const purchase = await verifyGooglePurchase({
            packageName: notification.packageName,
            productID: notification.subscriptionNotification?.subscriptionId,
            purchaseToken,
        });
        const userID = await db.retrieveStoreSubscriptionOwner({
            environment: purchase.environment,
            platform: purchase.platform,
            purchaseToken,
        });
        if (!userID) {
            res.sendStatus(202);
            return;
        }

        await handleVerifiedPurchase(req, res, {
            db,
            eventType: "google_webhook_subscription",
            notify,
            purchase,
            userID,
        });
    });

    if (devBillingGrantRoutesEnabled()) {
        router.post("/__dev/billing/grants", async (req, res) => {
            if (!devBillingGrantRoutesEnabled()) {
                res.sendStatus(404);
                return;
            }
            if (!devApiKeyMatches(req)) {
                res.sendStatus(403);
                return;
            }
            const parsed = devGrantPayload.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    error: "Invalid dev billing grant payload",
                    issues: parsed.error.issues,
                });
                return;
            }

            const entitlements = await db.setAccountEntitlementTier(
                parsed.data.userID,
                parsed.data.tier,
                {
                    expiresAt: parsed.data.expiresAt ?? null,
                    source: "store",
                },
            );
            notify(
                parsed.data.userID,
                "accountEntitlementsChanged",
                crypto.randomUUID(),
                { tier: entitlements.tier },
            );
            sendWireResponse(req, res, entitlements);
        });
    }

    router.use(
        (
            err: unknown,
            _req: express.Request,
            res: express.Response,
            next: express.NextFunction,
        ) => {
            if (err instanceof BillingVerificationError) {
                res.status(err.status).json({ error: err.message });
                return;
            }
            next(err);
        },
    );

    return router;
};

export function billingAccountPath(): string {
    return "/billing/account";
}

export function billingAppleTransactionPath(): string {
    return "/billing/apple/transactions";
}

export function billingDevGrantPath(): string {
    return "/__dev/billing/grants";
}

export function billingGooglePurchasePath(): string {
    return "/billing/google/purchases";
}

export function billingProductsPath(): string {
    return "/billing/products";
}

export function billingUserPath(userID: string): string {
    return `/user/${encodeURIComponent(userID)}/billing`;
}

async function handleVerifiedPurchase(
    req: express.Request,
    res: express.Response,
    args: {
        db: Database;
        eventType: string;
        notify: (
            userID: string,
            event: string,
            transmissionID: string,
            data?: unknown,
            deviceID?: string,
        ) => void;
        purchase: VerifiedStorePurchase;
        userID: string;
    },
): Promise<void> {
    const product = resolveBillingProduct(args.purchase);
    const subscription = await persistVerifiedPurchase(args.db, {
        product,
        purchase: args.purchase,
        userID: args.userID,
    });
    await args.db.recordStoreTransaction({
        eventType: args.eventType,
        externalTransactionID: args.purchase.externalTransactionID,
        rawPayload: args.purchase.rawPayload,
        subscriptionID: subscription.subscriptionID,
        userID: args.userID,
    });
    const entitlements = await args.db.recalculateStoreEntitlements(
        args.userID,
    );
    args.notify(
        args.userID,
        "accountEntitlementsChanged",
        crypto.randomUUID(),
        {
            tier: entitlements.tier,
        },
    );

    const state: BillingAccountState = {
        entitlements,
        subscriptions: await args.db.retrieveBillingSubscriptions(args.userID),
    };
    sendWireResponse(req, res, state);
}

async function persistVerifiedPurchase(
    db: Database,
    args: {
        product: BillingProduct;
        purchase: VerifiedStorePurchase;
        userID: string;
    },
): Promise<BillingSubscription> {
    const input: StoreSubscriptionUpsertInput = {
        environment: args.purchase.environment,
        expiresAt: args.purchase.expiresAt,
        externalOriginalID: args.purchase.externalOriginalID,
        externalTransactionID: args.purchase.externalTransactionID,
        platform: args.purchase.platform,
        productID: args.product.productID,
        purchaseToken: args.purchase.purchaseToken,
        rawPayload: args.purchase.rawPayload,
        status: args.purchase.status,
        storeProductID: args.product.storeProductID,
        tier: args.product.tier,
        userID: args.userID,
    };
    return db.upsertStoreSubscription(input);
}
