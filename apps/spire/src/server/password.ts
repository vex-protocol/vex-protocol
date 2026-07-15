/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";

import express from "express";

import { PasswordUpdatePayloadSchema } from "@vex-chat/types";

import {
    hashPasswordArgon2,
    validateAccountPassword,
    verifyPassword,
} from "../Database.ts";

import { AppError } from "./errors.ts";
import { passwordUpdateLimiter } from "./rateLimit.ts";
import { getParam, getUser } from "./utils.ts";

import { protectAnyAuth } from "./index.ts";

export const getPasswordRouter = (db: Database) => {
    const router = express.Router();

    router.patch(
        "/user/:id/password",
        protectAnyAuth,
        passwordUpdateLimiter,
        async (req, res) => {
            const authenticatedUser = getUser(req);
            const userID = getParam(req, "id");
            if (authenticatedUser.userID !== userID) {
                throw new AppError(403, "Not authorized for this account");
            }

            const payload = PasswordUpdatePayloadSchema.parse(req.body);
            const user = await db.retrieveUser(userID);
            if (!user) {
                throw new AppError(404, "Account not found");
            }

            const passwordError = validateAccountPassword(
                payload.newPassword,
                user.username,
            );
            if (passwordError) {
                throw new AppError(400, passwordError);
            }

            if (req.passkey) {
                const passkey = await db.retrievePasskeyInternal(
                    req.passkey.passkeyID,
                );
                if (!passkey || passkey.userID !== userID) {
                    throw new AppError(401, "Passkey authentication required");
                }
            } else {
                if (
                    !req.device ||
                    req.device.owner !== userID ||
                    !payload.currentPassword
                ) {
                    throw new AppError(
                        401,
                        "Current-password authentication required",
                    );
                }
                const current = await verifyPassword(
                    payload.currentPassword,
                    user,
                );
                if (!current.valid) {
                    throw new AppError(401, "Current password is incorrect");
                }
            }

            const reused = await verifyPassword(payload.newPassword, user);
            if (reused.valid) {
                throw new AppError(
                    409,
                    "New password must be different from the current password",
                );
            }

            const passwordHash = await hashPasswordArgon2(payload.newPassword);
            await db.rehashPassword(userID, passwordHash);
            res.setHeader("Cache-Control", "no-store");
            res.sendStatus(204);
        },
    );

    return router;
};
