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
import {
    MAX_FILE_UPLOAD_BASE64_LENGTH,
    MAX_FILE_UPLOAD_BYTES,
    MAX_FILE_UPLOAD_ENCODED_BODY_BYTES,
    TokenScopes,
} from "@vex-chat/types";

import { parse as uuidParse } from "uuid";
import { afterEach, describe, expect, it } from "vitest";

import { initApp } from "../server/index.ts";
import { signAuthJwt } from "../utils/authJwt.ts";
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
            const token = signAuthJwt({ scope: "user", user }, "5m");

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

    it("does not let a passkey-scoped token enter regular account routes", async () => {
        process.env["JWT_SECRET"] = "test-jwt-secret";
        const db = {
            retrievePasskeyInternal: () => Promise.resolve(null),
        } as unknown as Database;
        const app = express();
        initApp(
            app,
            db,
            () => false,
            xSignKeyPair(),
            () => {},
        );
        const server = await listen(app);

        try {
            const address = server.address();
            if (!address || typeof address === "string") {
                throw new Error("Expected TCP listener.");
            }
            const token = signAuthJwt(
                {
                    passkey: { passkeyID: "passkey-a" },
                    scope: "passkey",
                    user,
                },
                "5m",
            );

            const res = await fetch(
                `http://127.0.0.1:${String(address.port)}/server/server-a`,
                { headers: { Authorization: `Bearer ${token}` } },
            );

            expect(res.status).toBe(401);
        } finally {
            await close(server);
        }
    });

    it("limits the default development CORS policy to local app origins", async () => {
        const originalCorsOrigins = process.env["CORS_ORIGINS"];
        delete process.env["CORS_ORIGINS"];
        const app = express();
        initApp(
            app,
            {} as Database,
            () => false,
            xSignKeyPair(),
            () => {},
        );
        const server = await listen(app);

        try {
            const address = server.address();
            if (!address || typeof address === "string") {
                throw new Error("Expected TCP listener.");
            }
            const url = `http://127.0.0.1:${String(address.port)}/server/server-a`;
            const preflightHeaders = {
                "Access-Control-Request-Method": "GET",
            };
            const blocked = await fetch(url, {
                headers: {
                    ...preflightHeaders,
                    Origin: "https://attacker.example",
                },
                method: "OPTIONS",
            });
            const allowed = await fetch(url, {
                headers: {
                    ...preflightHeaders,
                    Origin: "http://localhost:5180",
                },
                method: "OPTIONS",
            });

            expect(
                blocked.headers.get("access-control-allow-origin"),
            ).toBeNull();
            expect(allowed.headers.get("access-control-allow-origin")).toBe(
                "http://localhost:5180",
            );
        } finally {
            if (originalCorsOrigins === undefined) {
                delete process.env["CORS_ORIGINS"];
            } else {
                process.env["CORS_ORIGINS"] = originalCorsOrigins;
            }
            await close(server);
        }
    });

    it("accepts a fallback upload body above the default parser limit", async () => {
        expect(MAX_FILE_UPLOAD_BASE64_LENGTH).toBe(
            4 * Math.ceil(MAX_FILE_UPLOAD_BYTES / 3),
        );
        expect(MAX_FILE_UPLOAD_ENCODED_BODY_BYTES).toBeGreaterThan(
            MAX_FILE_UPLOAD_BASE64_LENGTH,
        );

        const encodedFileLength = 20 * 1024 * 1024 + 1;
        expect(encodedFileLength).toBeLessThan(MAX_FILE_UPLOAD_BASE64_LENGTH);
        const app = express();
        initApp(
            app,
            {} as Database,
            () => false,
            xSignKeyPair(),
            () => {},
        );
        const server = await listen(app);

        try {
            const address = server.address();
            if (!address || typeof address === "string") {
                throw new Error("Expected TCP listener.");
            }
            const response = await fetch(
                `http://127.0.0.1:${String(address.port)}/file/json`,
                {
                    body: msgpack.encode({
                        file: "A".repeat(encodedFileLength),
                        nonce: "a".repeat(48),
                        owner: "device-a",
                    }),
                    headers: { "Content-Type": "application/msgpack" },
                    method: "POST",
                },
            );

            // Parsing succeeded; authentication is the next middleware.
            expect(response.status).toBe(401);
        } finally {
            await close(server);
        }
    }, 15_000);
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
