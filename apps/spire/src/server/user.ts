/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { DevicePayload } from "@vex-chat/types";

import express from "express";

import { xRandomBytes } from "@vex-chat/crypto";
import { XUtils } from "@vex-chat/crypto";
import { DevicePayloadSchema, TokenScopes } from "@vex-chat/types";

import { stringify } from "uuid";
import { z } from "zod/v4";

import { msgpack } from "../utils/msgpack.ts";
import { spireXSignOpenAsync } from "../utils/spireXSignOpenAsync.ts";

import { censorUser, getParam, getUser } from "./utils.ts";

import { protect } from "./index.ts";

const DEVICE_REQUEST_TTL_MS = 10 * 60 * 1000;
const RESOLVED_REQUEST_TTL_MS = 30 * 60 * 1000;

interface DeviceEnrollmentRequest {
    approvedDeviceID?: string;
    challengeHex: string;
    createdAt: number;
    devicePayload: DevicePayload;
    error?: string;
    requestID: string;
    resolvedAt?: number;
    status: DeviceEnrollmentStatus;
    userID: string;
}

type DeviceEnrollmentStatus = "approved" | "expired" | "pending" | "rejected";

const approvePayloadSchema = z.object({
    signed: z.string().min(1),
});

const deviceEnrollments = new Map<string, DeviceEnrollmentRequest>();

function pruneDeviceEnrollmentRequests(nowMs = Date.now()): void {
    for (const [requestID, req] of deviceEnrollments.entries()) {
        if (
            req.status === "pending" &&
            nowMs - req.createdAt > DEVICE_REQUEST_TTL_MS
        ) {
            req.status = "expired";
            req.resolvedAt = nowMs;
            deviceEnrollments.set(requestID, req);
            continue;
        }
        if (
            req.status !== "pending" &&
            req.resolvedAt !== undefined &&
            nowMs - req.resolvedAt > RESOLVED_REQUEST_TTL_MS
        ) {
            deviceEnrollments.delete(requestID);
        }
    }
}

function requestSummary(req: DeviceEnrollmentRequest): {
    approvedDeviceID?: string;
    createdAt: string;
    deviceName: string;
    error?: string;
    expiresAt: string;
    requestID: string;
    signKey: string;
    status: DeviceEnrollmentStatus;
    username?: string;
} {
    return {
        createdAt: new Date(req.createdAt).toISOString(),
        deviceName: req.devicePayload.deviceName,
        expiresAt: new Date(
            req.createdAt + DEVICE_REQUEST_TTL_MS,
        ).toISOString(),
        requestID: req.requestID,
        signKey: req.devicePayload.signKey,
        status: req.status,
        ...(req.devicePayload.username !== undefined
            ? { username: req.devicePayload.username }
            : {}),
        ...(req.approvedDeviceID !== undefined
            ? { approvedDeviceID: req.approvedDeviceID }
            : {}),
        ...(req.error !== undefined ? { error: req.error } : {}),
    };
}

export const getUserRouter = (
    db: Database,
    tokenValidator: (key: string, scope: TokenScopes) => boolean,
    notify: (
        userID: string,
        event: string,
        transmissionID: string,
        data?: unknown,
        deviceID?: string,
    ) => void,
) => {
    const router = express.Router();

    router.get("/:id", protect, async (req, res) => {
        const user = await db.retrieveUser(getParam(req, "id"));

        if (user) {
            return res.send(msgpack.encode(censorUser(user)));
        } else {
            return res.sendStatus(404);
        }
    });

    router.get("/:id/devices", protect, async (req, res) => {
        const id = getParam(req, "id");
        const user = await db.retrieveUser(id);
        if (!user) {
            res.sendStatus(404);
            return;
        }
        const deviceList = await db.retrieveUserDeviceList([id]);
        return res.send(msgpack.encode(deviceList));
    });

    router.get("/:id/permissions", protect, async (req, res) => {
        const userDetails = getUser(req);
        const permissions = await db.retrievePermissions(
            userDetails.userID,
            "all",
        );
        res.send(msgpack.encode(permissions));
    });

    router.get("/:id/servers", protect, async (req, res) => {
        const userDetails = getUser(req);
        const servers = await db.retrieveServers(userDetails.userID);
        res.send(msgpack.encode(servers));
    });

    router.delete("/:userID/devices/:deviceID", protect, async (req, res) => {
        const device = await db.retrieveDevice(getParam(req, "deviceID"));

        if (!device) {
            res.sendStatus(404);
            return;
        }
        const userDetails = getUser(req);
        if (userDetails.userID !== device.owner) {
            res.sendStatus(401);
            return;
        }
        const deviceList = await db.retrieveUserDeviceList([
            userDetails.userID,
        ]);
        if (deviceList.length === 1) {
            res.status(400).send({
                error: "You can't delete your last device.",
            });
            return;
        }

        await db.deleteDevice(device.deviceID);
        res.sendStatus(200);
    });

    router.post("/:id/devices", protect, async (req, res) => {
        pruneDeviceEnrollmentRequests();
        const userDetails = getUser(req);
        const parsed = DevicePayloadSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid device payload",
                issues: parsed.error.issues,
            });
            return;
        }
        const deviceData = parsed.data;

        const token = await spireXSignOpenAsync(
            XUtils.decodeHex(deviceData.signed),
            XUtils.decodeHex(deviceData.signKey),
        );

        if (!token) {
            res.sendStatus(400);
            return;
        }

        if (userDetails.userID !== getParam(req, "id")) {
            res.sendStatus(401);
            return;
        }

        const existingBySignKey = await db.retrieveDevice(deviceData.signKey);
        if (existingBySignKey) {
            res.sendStatus(470);
            return;
        }

        if (tokenValidator(stringify(token), TokenScopes.Device)) {
            const userDevices = await db.retrieveUserDeviceList([
                userDetails.userID,
            ]);
            if (userDevices.length === 0) {
                try {
                    const device = await db.createDevice(
                        userDetails.userID,
                        deviceData,
                    );
                    res.send(msgpack.encode(device));
                    return;
                } catch (_err: unknown) {
                    // signkey already taken
                    res.sendStatus(470);
                    return;
                }
            }

            const requestID = crypto.randomUUID();
            const challengeHex = XUtils.encodeHex(xRandomBytes(32));
            const pending: DeviceEnrollmentRequest = {
                challengeHex,
                createdAt: Date.now(),
                devicePayload: deviceData,
                requestID,
                status: "pending",
                userID: userDetails.userID,
            };
            deviceEnrollments.set(requestID, pending);
            notify(userDetails.userID, "deviceRequest", crypto.randomUUID(), {
                requestID,
                status: "pending",
            });

            res.status(202).send(
                msgpack.encode({
                    challenge: challengeHex,
                    expiresAt: new Date(
                        pending.createdAt + DEVICE_REQUEST_TTL_MS,
                    ).toISOString(),
                    requestID,
                    status: "pending_approval",
                }),
            );
        } else {
            res.sendStatus(401);
        }
    });

    router.get("/:id/devices/requests", protect, (req, res) => {
        pruneDeviceEnrollmentRequests();
        const userDetails = getUser(req);
        const userID = getParam(req, "id");
        if (userDetails.userID !== userID) {
            res.sendStatus(401);
            return;
        }
        const requests: ReturnType<typeof requestSummary>[] = [];
        for (const reqItem of deviceEnrollments.values()) {
            if (reqItem.userID === userID) {
                requests.push(requestSummary(reqItem));
            }
        }
        requests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        res.send(msgpack.encode(requests));
    });

    router.get("/:id/devices/requests/:requestID", protect, (req, res) => {
        pruneDeviceEnrollmentRequests();
        const userDetails = getUser(req);
        const userID = getParam(req, "id");
        if (userDetails.userID !== userID) {
            res.sendStatus(401);
            return;
        }
        const requestID = getParam(req, "requestID");
        const pending = deviceEnrollments.get(requestID);
        if (!pending || pending.userID !== userID) {
            res.sendStatus(404);
            return;
        }
        res.send(msgpack.encode(requestSummary(pending)));
    });

    router.post(
        "/:id/devices/requests/:requestID/approve",
        protect,
        async (req, res) => {
            pruneDeviceEnrollmentRequests();
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            const approverDevice = req.device;
            if (!approverDevice || approverDevice.owner !== userID) {
                res.status(401).send({
                    error: "Approve requires an authenticated existing device.",
                });
                return;
            }

            const parsedApprove = approvePayloadSchema.safeParse(req.body);
            if (!parsedApprove.success) {
                res.status(400).json({
                    error: "Invalid approval payload",
                    issues: parsedApprove.error.issues,
                });
                return;
            }

            const requestID = getParam(req, "requestID");
            const pending = deviceEnrollments.get(requestID);
            if (!pending || pending.userID !== userID) {
                res.sendStatus(404);
                return;
            }
            if (pending.status !== "pending") {
                res.status(409).send({ error: "Request is not pending." });
                return;
            }
            if (Date.now() - pending.createdAt > DEVICE_REQUEST_TTL_MS) {
                pending.status = "expired";
                pending.resolvedAt = Date.now();
                pending.error = "Request expired.";
                deviceEnrollments.set(requestID, pending);
                res.status(410).send({ error: "Request expired." });
                return;
            }

            if (approverDevice.signKey === pending.devicePayload.signKey) {
                res.status(400).send({
                    error: "Cannot self-approve with the requesting device key.",
                });
                return;
            }

            const opened = await spireXSignOpenAsync(
                XUtils.decodeHex(parsedApprove.data.signed),
                XUtils.decodeHex(approverDevice.signKey),
            );
            if (!opened) {
                res.status(401).send({ error: "Approval signature invalid." });
                return;
            }

            const expected = XUtils.decodeUTF8(requestID);
            if (!XUtils.bytesEqual(opened, expected)) {
                res.status(401).send({ error: "Approval challenge mismatch." });
                return;
            }

            try {
                const device = await db.createDevice(
                    userID,
                    pending.devicePayload,
                );
                pending.status = "approved";
                pending.approvedDeviceID = device.deviceID;
                pending.resolvedAt = Date.now();
                deviceEnrollments.set(requestID, pending);
                notify(userID, "deviceRequest", crypto.randomUUID(), {
                    requestID,
                    status: "approved",
                });
                res.send(msgpack.encode(device));
                return;
            } catch {
                pending.status = "rejected";
                pending.error = "Could not create approved device.";
                pending.resolvedAt = Date.now();
                deviceEnrollments.set(requestID, pending);
                notify(userID, "deviceRequest", crypto.randomUUID(), {
                    requestID,
                    status: "rejected",
                });
                res.sendStatus(470);
                return;
            }
        },
    );

    router.post(
        "/:id/devices/requests/:requestID/reject",
        protect,
        (req, res) => {
            pruneDeviceEnrollmentRequests();
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            const approverDevice = req.device;
            if (!approverDevice || approverDevice.owner !== userID) {
                res.status(401).send({
                    error: "Reject requires an authenticated existing device.",
                });
                return;
            }

            const requestID = getParam(req, "requestID");
            const pending = deviceEnrollments.get(requestID);
            if (!pending || pending.userID !== userID) {
                res.sendStatus(404);
                return;
            }
            if (pending.status !== "pending") {
                res.status(409).send({ error: "Request is not pending." });
                return;
            }

            pending.status = "rejected";
            pending.resolvedAt = Date.now();
            pending.error = "Rejected by existing device.";
            deviceEnrollments.set(requestID, pending);
            notify(userID, "deviceRequest", crypto.randomUUID(), {
                requestID,
                status: "rejected",
            });
            res.sendStatus(200);
        },
    );

    return router;
};
