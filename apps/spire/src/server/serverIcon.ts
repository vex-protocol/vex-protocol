/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Server } from "@vex-chat/types";

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";

import express from "express";

import { XUtils } from "@vex-chat/crypto";

import { fileTypeFromBuffer, fileTypeFromFile } from "file-type";
import multer from "multer";
import { z } from "zod/v4";

import { POWER_LEVELS } from "../ClientManager.ts";
import { msgpack } from "../utils/msgpack.ts";

import { hasPermission } from "./permissions.ts";
import { uploadLimiter } from "./rateLimit.ts";
import { getParam, getUser } from "./utils.ts";

import { ALLOWED_IMAGE_TYPES, protect } from "./index.ts";

const SERVER_ICON_DIR = "server-icons";
const MAX_SERVER_ICON_BYTES = 5 * 1024 * 1024;
const safePathParam = z.string().regex(/^[a-zA-Z0-9._-]+$/);
const serverIconUpload = multer({
    limits: { fields: 1, files: 1, fileSize: MAX_SERVER_ICON_BYTES, parts: 2 },
});
const serverIconJsonPayload = z.object({
    file: z
        .string()
        .min(1)
        .max(Math.ceil((MAX_SERVER_ICON_BYTES * 4) / 3) + 4),
});

type NotifyServerChange = (serverID: string) => Promise<void>;

export async function deleteServerIconFile(iconID: string): Promise<void> {
    const safeID = safePathParam.safeParse(iconID);
    if (!safeID.success) return;
    await fsp
        .unlink(`${SERVER_ICON_DIR}/${safeID.data}`)
        .catch(() => undefined);
}

export const getServerIconRouter = (
    db: Database,
    notifyServerChange: NotifyServerChange,
) => {
    const router = express.Router();

    router.get("/:iconID", async (req, res) => {
        const safeID = safePathParam.safeParse(getParam(req, "iconID"));
        if (!safeID.success) {
            res.sendStatus(400);
            return;
        }

        const filePath = `${SERVER_ICON_DIR}/${safeID.data}`;
        const typeDetails = await fileTypeFromFile(filePath).catch(() => null);
        if (!typeDetails) {
            res.sendStatus(404);
            return;
        }

        res.set("Content-Type", typeDetails.mime);
        res.set("Cache-Control", "public, max-age=31536000, immutable");
        res.set("Cross-Origin-Resource-Policy", "cross-origin");
        const stream = fs.createReadStream(filePath);
        stream.on("error", () => {
            if (!res.headersSent) res.sendStatus(500);
            else res.destroy();
        });
        stream.pipe(res);
    });

    router.post("/:serverID/json", uploadLimiter, protect, async (req, res) => {
        const parsed = serverIconJsonPayload.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid server icon payload",
                issues: parsed.error.issues,
            });
            return;
        }

        let buffer: Buffer;
        try {
            buffer = Buffer.from(XUtils.decodeBase64(parsed.data.file));
        } catch {
            res.status(400).json({ error: "Icon must be valid base64." });
            return;
        }
        await saveIcon(req, res, db, notifyServerChange, buffer);
    });

    router.post(
        "/:serverID",
        uploadLimiter,
        protect,
        serverIconUpload.single("icon"),
        async (req, res) => {
            if (!req.file) {
                res.sendStatus(400);
                return;
            }
            await saveIcon(req, res, db, notifyServerChange, req.file.buffer);
        },
    );

    router.delete("/:serverID", protect, async (req, res) => {
        const serverID = getParam(req, "serverID");
        if (!(await canManageServer(db, getUser(req).userID, serverID))) {
            res.sendStatus(403);
            return;
        }

        const existing = await db.retrieveServer(serverID);
        if (!existing) {
            res.sendStatus(404);
            return;
        }
        const updated = await db.updateServer(serverID, { icon: null });
        if (!updated) {
            res.sendStatus(404);
            return;
        }

        if (existing.icon) await deleteServerIconFile(existing.icon);
        await notifyServerChange(serverID);
        res.send(msgpack.encode(updated));
    });

    return router;
};

async function canManageServer(
    db: Database,
    userID: string,
    serverID: string,
): Promise<boolean> {
    const permissions = await db.retrievePermissions(userID, "server");
    return hasPermission(permissions, serverID, POWER_LEVELS.CREATE);
}

async function saveIcon(
    req: express.Request,
    res: express.Response,
    db: Database,
    notifyServerChange: NotifyServerChange,
    buffer: Buffer,
): Promise<void> {
    const serverID = getParam(req, "serverID");
    if (!(await canManageServer(db, getUser(req).userID, serverID))) {
        res.sendStatus(403);
        return;
    }
    if (buffer.byteLength > MAX_SERVER_ICON_BYTES) {
        res.sendStatus(413);
        return;
    }

    const typeDetails = await fileTypeFromBuffer(buffer);
    if (!ALLOWED_IMAGE_TYPES.includes(typeDetails?.mime ?? "")) {
        res.status(400).json({
            error: "Unsupported icon type. Use JPEG, PNG, GIF, APNG, AVIF, or WebP.",
        });
        return;
    }

    const existing = await db.retrieveServer(serverID);
    if (!existing) {
        res.sendStatus(404);
        return;
    }

    const iconID = crypto.randomUUID();
    const filePath = `${SERVER_ICON_DIR}/${iconID}`;
    try {
        await fsp.writeFile(filePath, buffer, { flag: "wx" });
        const updated = await db.updateServer(serverID, { icon: iconID });
        if (!updated) {
            throw new Error("Server disappeared while its icon was updating.");
        }
        if (existing.icon) await deleteServerIconFile(existing.icon);
        await notifyServerChange(serverID);
        res.send(msgpack.encode(updated satisfies Server));
    } catch (error: unknown) {
        await fsp.unlink(filePath).catch(() => undefined);
        throw error;
    }
}
