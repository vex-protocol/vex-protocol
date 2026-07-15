/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { FileSQL } from "@vex-chat/types";

import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";

import express from "express";

import { XUtils } from "@vex-chat/crypto";
import { FilePayloadSchema } from "@vex-chat/types";

import multer from "multer";
import { z } from "zod/v4";

import { msgpack } from "../utils/msgpack.ts";

import { uploadLimiter } from "./rateLimit.ts";
import { getParam } from "./utils.ts";

import { protect } from "./index.ts";

const safePathParam = z.string().regex(/^[a-zA-Z0-9._-]+$/);
const MAX_FILE_UPLOAD_BYTES = 25 * 1024 * 1024;
const fileUpload = multer({
    limits: {
        fields: 4,
        files: 1,
        fileSize: MAX_FILE_UPLOAD_BYTES,
        parts: 5,
    },
});

export const getFileRouter = (db: Database) => {
    const router = express.Router();

    router.get("/:id", protect, async (req, res) => {
        const safeId = safePathParam.safeParse(getParam(req, "id"));
        if (!safeId.success) {
            res.sendStatus(400);
            return;
        }
        const entry = await db.retrieveFile(safeId.data);
        if (!entry) {
            res.sendStatus(404);
        } else {
            const stream = fs.createReadStream("./files/" + entry.fileID);
            stream.on("error", (_err) => {
                // debugger: file stream read error
                res.sendStatus(500);
            });
            stream.pipe(res);
        }
    });

    router.get("/:id/details", protect, async (req, res) => {
        const safeId = safePathParam.safeParse(getParam(req, "id"));
        if (!safeId.success) {
            res.sendStatus(400);
            return;
        }
        const entry = await db.retrieveFile(safeId.data);
        if (!entry) {
            res.sendStatus(404);
        } else {
            fs.stat(path.resolve("./files/" + entry.fileID), (err, stat) => {
                if (err) {
                    res.sendStatus(500);
                    return;
                }
                res.set("Cache-control", "public, max-age=31536000");
                res.send(
                    msgpack.encode({
                        ...entry,
                        birthtime: stat.birthtime,
                        size: stat.size,
                    }),
                );
            });
        }
    });

    router.post("/json", uploadLimiter, protect, async (req, res) => {
        const deviceDetails = req.device;

        if (!deviceDetails) {
            res.sendStatus(401);
            return;
        }

        const parsed = FilePayloadSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid file payload",
                issues: parsed.error.issues,
            });
            return;
        }
        const payload = parsed.data;

        if (!payload.file) {
            res.sendStatus(400);
            return;
        }
        if (payload.owner !== deviceDetails.deviceID) {
            res.status(400).send({
                error: "File owner must match this device.",
            });
            return;
        }

        let buf: Buffer;
        try {
            buf = Buffer.from(XUtils.decodeBase64(payload.file));
        } catch {
            res.status(400).send({ error: "File must be valid base64." });
            return;
        }
        if (buf.byteLength > MAX_FILE_UPLOAD_BYTES) {
            res.sendStatus(413);
            return;
        }

        const newFile: FileSQL = {
            fileID: crypto.randomUUID(),
            nonce: payload.nonce,
            owner: deviceDetails.deviceID,
        };

        await fsp.writeFile("files/" + newFile.fileID, buf);
        await db.createFile(newFile);
        res.send(msgpack.encode(newFile));
    });

    // Multipart file upload — form fields are strings from multer, not full FilePayload
    const multipartFields = z.object({
        nonce: z.string().regex(/^[0-9a-fA-F]{48}$/),
        owner: z.string().min(1).max(128),
    });

    router.post(
        "/",
        uploadLimiter,
        protect,
        fileUpload.single("file"),
        async (req, res) => {
            const deviceDetails = req.device;

            if (!deviceDetails) {
                res.sendStatus(401);
                return;
            }

            const parsed = multipartFields.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({
                    error: "Invalid file payload",
                    issues: parsed.error.issues,
                });
                return;
            }
            const payload = parsed.data;

            if (req.file === undefined) {
                res.sendStatus(400);
                return;
            }

            if (payload.owner !== deviceDetails.deviceID) {
                res.status(400).send({
                    error: "File owner must match this device.",
                });
                return;
            }

            const newFile: FileSQL = {
                fileID: crypto.randomUUID(),
                nonce: payload.nonce,
                owner: deviceDetails.deviceID,
            };

            await fsp.writeFile("files/" + newFile.fileID, req.file.buffer);
            await db.createFile(newFile);
            res.send(msgpack.encode(newFile));
        },
    );

    return router;
};
