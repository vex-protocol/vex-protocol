/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Device, User } from "@vex-chat/types";
import type { Server } from "node:http";

import express from "express";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPasskeyRouter } from "../server/passkey.ts";

const user: User = {
    lastSeen: new Date(0).toISOString(),
    userID: "user-a",
    username: "alice",
};

const device: Device = {
    deleted: false,
    deviceID: "device-a",
    lastLogin: new Date(0).toISOString(),
    name: "desktop",
    owner: user.userID,
    signKey: "a".repeat(64),
};

const originalRpID = process.env["SPIRE_PASSKEY_RP_ID"];
const originalOrigins = process.env["SPIRE_PASSKEY_ORIGINS"];

beforeEach(() => {
    process.env["SPIRE_PASSKEY_RP_ID"] = "vex.example";
    process.env["SPIRE_PASSKEY_ORIGINS"] = "https://vex.example";
});

afterEach(() => {
    restoreEnv("SPIRE_PASSKEY_RP_ID", originalRpID);
    restoreEnv("SPIRE_PASSKEY_ORIGINS", originalOrigins);
});

describe("browser passkey registration", () => {
    it("issues a scoped browser handoff from an authenticated registration", async () => {
        let approvedDevice: Device | null = device;
        const db = {
            retrieveDevice: vi.fn(() => Promise.resolve(approvedDevice)),
            retrievePasskeysByUser: vi.fn(() => Promise.resolve([])),
        } as unknown as Database;
        const app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.device = device;
            req.user = user;
            next();
        });
        app.use(getPasskeyRouter(db));
        const server = await listen(app);

        try {
            const baseUrl = serverBaseUrl(server);
            const createResponse = await fetch(
                `${baseUrl}/user/${user.userID}/passkeys/register/begin?format=json`,
                {
                    body: JSON.stringify({ name: "MacBook Touch ID" }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                },
            );
            const created = (await createResponse.json()) as {
                options: {
                    rp: { id: string };
                    vexBrowserHandoff: {
                        browserToken: string;
                        expiresAt: string;
                        requestID: string;
                    };
                };
                requestID: string;
            };
            const handoff = created.options.vexBrowserHandoff;

            expect(createResponse.status).toBe(200);
            expect(created.options.rp.id).toBe("vex.example");
            expect(handoff.browserToken.length).toBeGreaterThanOrEqual(32);
            expect(new Date(handoff.expiresAt).getTime()).toBeGreaterThan(
                Date.now(),
            );
            expect(handoff.requestID).not.toBe(created.requestID);

            const wrongTokenResponse = await fetch(
                `${baseUrl}/auth/passkey/browser-registration/${handoff.requestID}/begin?format=json`,
                {
                    body: JSON.stringify({ token: "x".repeat(43) }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                },
            );
            expect(wrongTokenResponse.status).toBe(401);

            const beginResponse = await fetch(
                `${baseUrl}/auth/passkey/browser-registration/${handoff.requestID}/begin?format=json`,
                {
                    body: JSON.stringify({ token: handoff.browserToken }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                },
            );
            const begin = (await beginResponse.json()) as {
                options: { rp: { id: string } };
            };
            expect(beginResponse.status).toBe(200);
            expect(begin.options.rp.id).toBe("vex.example");

            const nativeFinishResponse = await fetch(
                `${baseUrl}/user/${user.userID}/passkeys/register/finish?format=json`,
                {
                    body: JSON.stringify({
                        name: "MacBook Touch ID",
                        requestID: created.requestID,
                        response: {},
                    }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                },
            );
            expect(nativeFinishResponse.status).toBe(404);

            approvedDevice = null;
            const revokedDeviceResponse = await fetch(
                `${baseUrl}/auth/passkey/browser-registration/${handoff.requestID}/begin?format=json`,
                {
                    body: JSON.stringify({ token: handoff.browserToken }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                },
            );
            expect(revokedDeviceResponse.status).toBe(401);
        } finally {
            await close(server);
        }
    });
});

function close(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
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

function restoreEnv(name: string, value: string | undefined): void {
    if (value === undefined) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- restores the process environment exactly
        delete process.env[name];
        return;
    }
    process.env[name] = value;
}

function serverBaseUrl(server: Server): string {
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Expected TCP listener.");
    }
    return `http://127.0.0.1:${String(address.port)}`;
}
