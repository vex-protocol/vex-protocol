/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";

import express from "express";

import { AccountTierSchema, datetime } from "@vex-chat/types";

import { z } from "zod/v4";

import { devApiKeyMatches } from "./rateLimit.ts";
import { getParam, getUser } from "./utils.ts";
import { sendWireResponse } from "./wireResponse.ts";

import { protect } from "./index.ts";

const devEntitlementPatchPayload = z.object({
    expiresAt: datetime.nullable().optional(),
    tier: AccountTierSchema,
});

export function devEntitlementRoutesEnabled(
    env: NodeJS.ProcessEnv = process.env,
): boolean {
    return (
        env["NODE_ENV"] !== "production" &&
        env["VEX_ENABLE_DEV_ENTITLEMENTS"] === "1" &&
        (env["DEV_API_KEY"]?.trim().length ?? 0) > 0
    );
}

export const getEntitlementRouter = (
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

    router.get("/user/:id/entitlements", protect, async (req, res) => {
        const userDetails = getUser(req);
        const userID = getParam(req, "id");
        if (userDetails.userID !== userID) {
            res.sendStatus(401);
            return;
        }

        const entitlements = await db.retrieveAccountEntitlements(userID);
        sendWireResponse(req, res, entitlements);
    });

    if (!devEntitlementRoutesEnabled()) {
        return router;
    }

    router.patch("/__dev/user/:id/entitlements", protect, async (req, res) => {
        if (!devEntitlementRoutesEnabled()) {
            res.sendStatus(404);
            return;
        }
        const userDetails = getUser(req);
        const userID = getParam(req, "id");
        if (userDetails.userID !== userID) {
            res.sendStatus(401);
            return;
        }
        if (!devApiKeyMatches(req)) {
            res.sendStatus(403);
            return;
        }

        const parsed = devEntitlementPatchPayload.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid entitlement payload",
                issues: parsed.error.issues,
            });
            return;
        }

        const entitlements = await db.setAccountEntitlementTier(
            userID,
            parsed.data.tier,
            {
                expiresAt: parsed.data.expiresAt ?? null,
                source: "dev_override",
            },
        );
        notify(userID, "accountEntitlementsChanged", crypto.randomUUID(), {
            tier: entitlements.tier,
        });
        sendWireResponse(req, res, entitlements);
    });

    return router;
};
