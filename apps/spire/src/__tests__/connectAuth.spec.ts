/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Device, User } from "@vex-chat/types";
import type { Server } from "node:http";

import express from "express";

import { xSignAsync, xSignKeyPair, XUtils } from "@vex-chat/crypto";
import { TokenScopes } from "@vex-chat/types";

import jwt from "jsonwebtoken";
import { parse as uuidParse } from "uuid";
import { afterEach, describe, expect, it } from "vitest";

import { initApp } from "../server/index.ts";
import { getJwtSecret } from "../utils/jwtSecret.ts";
import { msgpack } from "../utils/msgpack.ts";

const originalJwtSecret = process.env["JWT_SECRET"];

const user: User = {
    lastSeen: new Date(0).toISOString(),
    userID: "user-a",
    username: "alice",
};

describe("device connect auth", () => {
    afterEach(() => {
        if (originalJwtSecret === undefined) {
            delete process.env["JWT_SECRET"];
        } else {
            process.env["JWT_SECRET"] = originalJwtSecret;
        }
    });

    it("allows a password-created account to connect before passkey enrollment", async () => {
        process.env["JWT_SECRET"] = "test-jwt-secret";
        const connectToken = "93ce482b-a0f2-4f6e-b1df-3aed61073552";
        const signKeys = xSignKeyPair();
        const device: Device = {
            deleted: false,
            deviceID: "device-a",
            lastLogin: new Date(0).toISOString(),
            name: "desktop",
            owner: user.userID,
            signKey: XUtils.encodeHex(signKeys.publicKey),
        };
        const db = {
            retrieveDevice: (deviceID: string) =>
                Promise.resolve(deviceID === device.deviceID ? device : null),
        } as unknown as Database;
        const app = express();
        initApp(
            app,
            db,
            (key, scope) =>
                key === connectToken && scope === TokenScopes.Connect,
            xSignKeyPair(),
            () => {},
        );
        const server = await listen(app);

        try {
            const address = server.address();
            if (!address || typeof address === "string") {
                throw new Error("Expected TCP listener.");
            }
            const signed = await xSignAsync(
                Uint8Array.from(uuidParse(connectToken)),
                signKeys.secretKey,
            );
            const token = jwt.sign({ user }, getJwtSecret());

            const res = await fetch(
                `http://127.0.0.1:${String(address.port)}/device/${device.deviceID}/connect`,
                {
                    body: msgpack.encode({ signed }),
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": "application/msgpack",
                    },
                    method: "POST",
                },
            );

            expect(res.status).toBe(200);
            const body = msgpack.decode(
                new Uint8Array(await res.arrayBuffer()),
            ) as { deviceToken?: unknown };
            expect(typeof body.deviceToken).toBe("string");
        } finally {
            await close(server);
        }
    });
});

function close(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((err) => {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

function listen(app: express.Application): Promise<Server> {
    return new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            resolve(server);
        });
    });
}
