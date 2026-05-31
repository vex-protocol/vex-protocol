/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type express from "express";

import { msgpack } from "../utils/msgpack.ts";

/**
 * Normal SDK clients expect msgpack from Spire. Browser-only helpers
 * can opt into JSON with `?format=json` so they do not need to ship a
 * msgpack codec just to complete a short WebAuthn bridge ceremony.
 */
export function sendWireResponse(
    req: express.Request,
    res: express.Response,
    payload: unknown,
): void {
    if (req.query["format"] === "json") {
        res.json(payload);
        return;
    }
    res.send(msgpack.encode(payload));
}
