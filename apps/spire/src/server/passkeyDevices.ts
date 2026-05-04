/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";

import express from "express";

import { msgpack } from "../utils/msgpack.ts";

import { resolveDeviceEnrollmentRequest } from "./user.ts";
import { getParam, getUser } from "./utils.ts";

import { protectPasskey } from "./index.ts";

/**
 * Routes that grant a passkey-authenticated session a strictly
 * bounded admin/recovery surface:
 *
 * - `GET    /user/:id/passkey/devices`                              — list
 * - `DELETE /user/:id/passkey/devices/:deviceID`                    — remove
 * - `POST   /user/:id/passkey/devices/requests/:requestID/approve`  — approve
 * - `POST   /user/:id/passkey/devices/requests/:requestID/reject`   — reject
 *
 * The route family is parallel to `/user/:id/devices/...` so the
 * existing device-authenticated flow stays untouched (and there's no
 * confusion about which kind of credential is doing what when a
 * single endpoint accepts both).
 *
 * Mail/server/permissions/etc. routes are intentionally NOT mirrored
 * here — passkeys are an administrative credential, not a messaging
 * device.
 */
export const getPasskeyDeviceRouter = (
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

    router.get(
        "/user/:id/passkey/devices",
        protectPasskey,
        async (req, res) => {
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            const list = await db.retrieveUserDeviceList([userID]);
            res.send(msgpack.encode(list));
        },
    );

    router.delete(
        "/user/:id/passkey/devices/:deviceID",
        protectPasskey,
        async (req, res) => {
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            const deviceID = getParam(req, "deviceID");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            const device = await db.retrieveDevice(deviceID);
            if (!device || device.owner !== userID) {
                res.sendStatus(404);
                return;
            }
            // The device-auth `DELETE /user/:id/devices/:deviceID`
            // refuses to delete the user's last device (a device
            // can't lock itself out). Passkeys may delete the last
            // device on purpose: that's the entire recovery story —
            // "I lost my phone, sign in with the passkey, wipe the
            // old device, then enroll a new one with the passkey
            // standing in as the approver."
            await db.deleteDevice(deviceID);
            // Tell whoever's online that the device-list shape
            // changed; clients use this to refresh the Settings →
            // Devices view in real time.
            notify(userID, "deviceListChanged", crypto.randomUUID());
            res.sendStatus(200);
        },
    );

    router.post(
        "/user/:id/passkey/devices/requests/:requestID/approve",
        protectPasskey,
        async (req, res) => {
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            const requestID = getParam(req, "requestID");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            // No second-factor signature here: the passkey JWT itself
            // is fresh proof of user presence (5 min TTL, freshly
            // minted from a WebAuthn ceremony with userVerification).
            // Reusing it within those 5 minutes to approve an
            // enrollment is fine — the equivalent guarantee that the
            // device flow gets from a per-request Ed25519 sig.
            const result = await resolveDeviceEnrollmentRequest({
                action: "approve",
                db,
                notify,
                requestID,
                userID,
            });
            if (result.kind === "ok") {
                res.send(msgpack.encode(result.device));
                return;
            }
            res.status(result.status).send({ error: result.error });
        },
    );

    router.post(
        "/user/:id/passkey/devices/requests/:requestID/reject",
        protectPasskey,
        async (req, res) => {
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            const requestID = getParam(req, "requestID");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            const result = await resolveDeviceEnrollmentRequest({
                action: "reject",
                db,
                notify,
                requestID,
                userID,
            });
            if (result.kind === "ok") {
                res.sendStatus(200);
                return;
            }
            res.status(result.status).send({ error: result.error });
        },
    );

    return router;
};
