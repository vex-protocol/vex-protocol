/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { z } from "zod/v4";

import { datetime } from "./common.js";

export const AccountTierValues = ["free", "plus", "pro"] as const;

export type AccountTier = (typeof AccountTierValues)[number];

export const AccountTierSchema: z.ZodType<AccountTier> =
    z.enum(AccountTierValues);

export const AccountEntitlementCapabilityValues = [
    "attachments.encrypted_uploads",
    "calls.relay_priority",
    "devices.additional_slots",
    "identity.profile_customization",
    "servers.custom_invites",
    "servers.custom_profile",
    "servers.extended_assets",
] as const;

export type AccountEntitlementCapability =
    (typeof AccountEntitlementCapabilityValues)[number];

export const AccountEntitlementCapabilitySchema: z.ZodType<AccountEntitlementCapability> =
    z.enum(AccountEntitlementCapabilityValues);

export const AccountEntitlementLimitValues = [
    "attachments.max_encrypted_bytes",
    "devices.max_trusted_devices",
    "identity.max_profile_assets",
    "servers.max_custom_invites",
    "servers.max_emoji_slots",
    "servers.max_sticker_slots",
] as const;

export type AccountEntitlementLimit =
    (typeof AccountEntitlementLimitValues)[number];

export const AccountEntitlementLimitSchema: z.ZodType<AccountEntitlementLimit> =
    z.enum(AccountEntitlementLimitValues);

export type AccountEntitlementSource = "default" | "dev_override" | "store";

export const AccountEntitlementSourceSchema: z.ZodType<AccountEntitlementSource> =
    z.enum(["default", "dev_override", "store"]);

export interface AccountEntitlements {
    capabilities: Record<AccountEntitlementCapability, boolean>;
    expiresAt: null | string;
    limits: Record<AccountEntitlementLimit, number>;
    refreshedAt: string;
    source: AccountEntitlementSource;
    tier: AccountTier;
    userID: string;
}

export const AccountEntitlementsSchema: z.ZodType<AccountEntitlements> = z
    .object({
        capabilities: z.record(AccountEntitlementCapabilitySchema, z.boolean()),
        expiresAt: datetime.nullable(),
        limits: z.record(
            AccountEntitlementLimitSchema,
            z.number().int().min(0),
        ),
        refreshedAt: datetime,
        source: AccountEntitlementSourceSchema,
        tier: AccountTierSchema,
        userID: z.string(),
    })
    .describe("Server-authoritative account entitlement snapshot");

const tierCapabilities: Record<
    AccountTier,
    Record<AccountEntitlementCapability, boolean>
> = {
    free: {
        "attachments.encrypted_uploads": true,
        "calls.relay_priority": false,
        "devices.additional_slots": false,
        "identity.profile_customization": false,
        "servers.custom_invites": false,
        "servers.custom_profile": false,
        "servers.extended_assets": false,
    },
    plus: {
        "attachments.encrypted_uploads": true,
        "calls.relay_priority": false,
        "devices.additional_slots": true,
        "identity.profile_customization": true,
        "servers.custom_invites": true,
        "servers.custom_profile": true,
        "servers.extended_assets": false,
    },
    pro: {
        "attachments.encrypted_uploads": true,
        "calls.relay_priority": true,
        "devices.additional_slots": true,
        "identity.profile_customization": true,
        "servers.custom_invites": true,
        "servers.custom_profile": true,
        "servers.extended_assets": true,
    },
};

const tierLimits: Record<
    AccountTier,
    Record<AccountEntitlementLimit, number>
> = {
    free: {
        "attachments.max_encrypted_bytes": 25 * 1024 * 1024,
        "devices.max_trusted_devices": 2,
        "identity.max_profile_assets": 1,
        "servers.max_custom_invites": 3,
        "servers.max_emoji_slots": 0,
        "servers.max_sticker_slots": 0,
    },
    plus: {
        "attachments.max_encrypted_bytes": 100 * 1024 * 1024,
        "devices.max_trusted_devices": 5,
        "identity.max_profile_assets": 4,
        "servers.max_custom_invites": 25,
        "servers.max_emoji_slots": 50,
        "servers.max_sticker_slots": 50,
    },
    pro: {
        "attachments.max_encrypted_bytes": 500 * 1024 * 1024,
        "devices.max_trusted_devices": 10,
        "identity.max_profile_assets": 8,
        "servers.max_custom_invites": 100,
        "servers.max_emoji_slots": 250,
        "servers.max_sticker_slots": 250,
    },
};

export function accountEntitlementCapabilitiesForTier(
    tier: AccountTier,
): Record<AccountEntitlementCapability, boolean> {
    return { ...tierCapabilities[tier] };
}

export function accountEntitlementLimitsForTier(
    tier: AccountTier,
): Record<AccountEntitlementLimit, number> {
    return { ...tierLimits[tier] };
}

export function buildAccountEntitlements(args: {
    expiresAt?: null | string | undefined;
    refreshedAt?: string | undefined;
    source?: AccountEntitlementSource | undefined;
    tier?: AccountTier | undefined;
    userID: string;
}): AccountEntitlements {
    const tier = args.tier ?? "free";
    return {
        capabilities: accountEntitlementCapabilitiesForTier(tier),
        expiresAt: args.expiresAt ?? null,
        limits: accountEntitlementLimitsForTier(tier),
        refreshedAt: args.refreshedAt ?? new Date().toISOString(),
        source: args.source ?? "default",
        tier,
        userID: args.userID,
    };
}
