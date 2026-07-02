/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { z } from "zod/v4";

import { datetime } from "./common.js";
import {
    type AccountEntitlements,
    AccountEntitlementsSchema,
    type AccountTier,
    AccountTierSchema,
} from "./entitlements.js";

export const BillingPlatformValues = [
    "apple_app_store",
    "google_play",
] as const;

export type BillingPlatform = (typeof BillingPlatformValues)[number];

export const BillingPlatformSchema: z.ZodType<BillingPlatform> = z.enum(
    BillingPlatformValues,
);

export const BillingEnvironmentValues = ["production", "sandbox"] as const;

export type BillingEnvironment = (typeof BillingEnvironmentValues)[number];

export const BillingEnvironmentSchema: z.ZodType<BillingEnvironment> = z.enum(
    BillingEnvironmentValues,
);

export const BillingSubscriptionStatusValues = [
    "active",
    "billing_retry",
    "expired",
    "grace_period",
    "pending",
    "revoked",
] as const;

export type BillingSubscriptionStatus =
    (typeof BillingSubscriptionStatusValues)[number];

export const BillingSubscriptionStatusSchema: z.ZodType<BillingSubscriptionStatus> =
    z.enum(BillingSubscriptionStatusValues);

export interface BillingProduct {
    environment: BillingEnvironment;
    platform: BillingPlatform;
    productID: string;
    storeProductID: string;
    tier: AccountTier;
}

export const BillingProductSchema: z.ZodType<BillingProduct> = z.object({
    environment: BillingEnvironmentSchema,
    platform: BillingPlatformSchema,
    productID: z.string().min(1),
    storeProductID: z.string().min(1),
    tier: AccountTierSchema,
});

export interface BillingSubscription {
    environment: BillingEnvironment;
    expiresAt: null | string;
    platform: BillingPlatform;
    productID: string;
    status: BillingSubscriptionStatus;
    storeProductID: string;
    subscriptionID: string;
    tier: AccountTier;
    updatedAt: string;
}

export const BillingSubscriptionSchema: z.ZodType<BillingSubscription> =
    z.object({
        environment: BillingEnvironmentSchema,
        expiresAt: datetime.nullable(),
        platform: BillingPlatformSchema,
        productID: z.string().min(1),
        status: BillingSubscriptionStatusSchema,
        storeProductID: z.string().min(1),
        subscriptionID: z.string().min(1),
        tier: AccountTierSchema,
        updatedAt: datetime,
    });

export interface BillingAccountState {
    entitlements: AccountEntitlements;
    subscriptions: BillingSubscription[];
}

export const BillingAccountStateSchema: z.ZodType<BillingAccountState> =
    z.object({
        entitlements: AccountEntitlementsSchema,
        subscriptions: z.array(BillingSubscriptionSchema),
    });

export interface AppleTransactionVerificationRequest {
    environment?: BillingEnvironment | undefined;
    signedTransactionInfo?: string | undefined;
    transactionID?: string | undefined;
}

export const AppleTransactionVerificationRequestSchema: z.ZodType<AppleTransactionVerificationRequest> =
    z
        .object({
            environment: BillingEnvironmentSchema.optional(),
            signedTransactionInfo: z.string().min(1).optional(),
            transactionID: z.string().min(1).optional(),
        })
        .refine(
            (value) =>
                Boolean(value.transactionID) ||
                Boolean(value.signedTransactionInfo),
            {
                message:
                    "Provide transactionID or signedTransactionInfo for Apple verification.",
            },
        );

export interface GooglePurchaseVerificationRequest {
    environment?: BillingEnvironment | undefined;
    packageName?: string | undefined;
    productID?: string | undefined;
    purchaseToken: string;
}

export const GooglePurchaseVerificationRequestSchema: z.ZodType<GooglePurchaseVerificationRequest> =
    z.object({
        environment: BillingEnvironmentSchema.optional(),
        packageName: z.string().min(1).optional(),
        productID: z.string().min(1).optional(),
        purchaseToken: z.string().min(1),
    });

export interface AppleServerNotificationRequest {
    signedPayload: string;
}

export const AppleServerNotificationRequestSchema: z.ZodType<AppleServerNotificationRequest> =
    z.object({
        signedPayload: z.string().min(1),
    });

export interface GooglePlayDeveloperNotificationRequest {
    message?:
        | undefined
        | {
              data?: string | undefined;
          };
    subscriptionNotification?:
        | undefined
        | {
              purchaseToken: string;
              subscriptionId?: string | undefined;
          };
}

export const GooglePlayDeveloperNotificationRequestSchema: z.ZodType<GooglePlayDeveloperNotificationRequest> =
    z.object({
        message: z
            .object({
                data: z.string().min(1).optional(),
            })
            .optional(),
        subscriptionNotification: z
            .object({
                purchaseToken: z.string().min(1),
                subscriptionId: z.string().min(1).optional(),
            })
            .optional(),
    });
