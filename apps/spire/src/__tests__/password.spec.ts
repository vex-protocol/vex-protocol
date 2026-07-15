/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { AddressInfo } from "node:net";

import express from "express";

import {
    afterAll,
    afterEach,
    beforeAll,
    describe,
    expect,
    it,
    vi,
} from "vitest";

import { hashPasswordArgon2, verifyPassword } from "../Database.ts";
import { errorHandler } from "../server/errors.ts";
import { getPasswordRouter } from "../server/password.ts";

const userID = "4e67b90f-cbf8-44bc-8ce3-d3b248f033f1";
const otherUserID = "93ce482b-a0f2-4f6e-b1df-3aed61073552";
const passkeyID = "passkey-1";
const initialPassword = "This is the original password";
const replacementPassword = "This is the replacement password";
const servers: Array<{ close: () => void }> = [];
const originalDisableRateLimits = process.env["SPIRE_DISABLE_RATE_LIMITS"];
let initialPasswordHash = "";

beforeAll(async () => {
    process.env["SPIRE_DISABLE_RATE_LIMITS"] = "true";
    initialPasswordHash = await hashPasswordArgon2(initialPassword);
});

afterEach(() => {
    for (const server of servers.splice(0)) server.close();
});

afterAll(() => {
    if (originalDisableRateLimits === undefined) {
        delete process.env["SPIRE_DISABLE_RATE_LIMITS"];
    } else {
        process.env["SPIRE_DISABLE_RATE_LIMITS"] = originalDisableRateLimits;
    }
});

describe("verifyPassword", () => {
    it.each(["not-an-argon2-hash", "pbkdf2$100000$salt$hash"])(
        "fails closed for an unsupported stored hash: %s",
        async (passwordHash) => {
            await expect(
                verifyPassword(initialPassword, { passwordHash }),
            ).resolves.toEqual({ needsRehash: false, valid: false });
        },
    );
});

describe("PATCH /user/:id/password", () => {
    it("changes a password after approved-device and current-password proof", async () => {
        const harness = await mountPasswordRouter("device");
        const response = await patchPassword(harness.baseUrl, userID, {
            currentPassword: initialPassword,
            newPassword: replacementPassword,
        });

        expect(response.status).toBe(204);
        expect(harness.rehashPassword).toHaveBeenCalledOnce();
        await expectPassword(harness.passwordHash(), replacementPassword, true);
        await expectPassword(harness.passwordHash(), initialPassword, false);
    });

    it("rejects missing or incorrect current-password proof", async () => {
        const harness = await mountPasswordRouter("device");
        const missing = await patchPassword(harness.baseUrl, userID, {
            newPassword: replacementPassword,
        });
        const incorrect = await patchPassword(harness.baseUrl, userID, {
            currentPassword: "This is definitely not the password",
            newPassword: replacementPassword,
        });

        expect(missing.status).toBe(401);
        expect(incorrect.status).toBe(401);
        expect(harness.rehashPassword).not.toHaveBeenCalled();
    });

    it("resets a password after fresh passkey proof", async () => {
        const harness = await mountPasswordRouter("passkey");
        const response = await patchPassword(harness.baseUrl, userID, {
            newPassword: replacementPassword,
        });

        expect(response.status).toBe(204);
        await expectPassword(harness.passwordHash(), replacementPassword, true);
    });

    it("rejects passkeys that are no longer bound to the account", async () => {
        const harness = await mountPasswordRouter("passkey", false);
        const response = await patchPassword(harness.baseUrl, userID, {
            newPassword: replacementPassword,
        });

        expect(response.status).toBe(401);
        expect(harness.rehashPassword).not.toHaveBeenCalled();
    });

    it("rejects cross-account targeting, reuse, and common passwords", async () => {
        const harness = await mountPasswordRouter("device");
        const crossAccount = await patchPassword(harness.baseUrl, otherUserID, {
            currentPassword: initialPassword,
            newPassword: replacementPassword,
        });
        const reused = await patchPassword(harness.baseUrl, userID, {
            currentPassword: initialPassword,
            newPassword: initialPassword,
        });
        const common = await patchPassword(harness.baseUrl, userID, {
            currentPassword: initialPassword,
            newPassword: "passwordpassword",
        });

        expect(crossAccount.status).toBe(403);
        expect(reused.status).toBe(409);
        expect(common.status).toBe(400);
        expect(harness.rehashPassword).not.toHaveBeenCalled();
    });
});

async function expectPassword(
    passwordHash: string,
    password: string,
    expected: boolean,
): Promise<void> {
    const result = await verifyPassword(password, { passwordHash });
    expect(result.valid).toBe(expected);
}

async function mountPasswordRouter(
    auth: "device" | "passkey",
    passkeyExists = true,
): Promise<{
    baseUrl: string;
    passwordHash: () => string;
    rehashPassword: ReturnType<typeof vi.fn>;
}> {
    let passwordHash = initialPasswordHash;
    const rehashPassword = vi.fn((_userID: string, nextHash: string) => {
        passwordHash = nextHash;
        return Promise.resolve();
    });
    const db = {
        rehashPassword,
        retrievePasskeyInternal: vi.fn(() =>
            Promise.resolve(passkeyExists ? { passkeyID, userID } : null),
        ),
        retrieveUser: vi.fn((identifier: string) =>
            Promise.resolve(
                identifier === userID
                    ? {
                          lastSeen: new Date().toISOString(),
                          passwordHash,
                          userID,
                          username: "alice",
                      }
                    : null,
            ),
        ),
    } as unknown as Database;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.user = {
            lastSeen: new Date().toISOString(),
            userID,
            username: "alice",
        };
        if (auth === "device") {
            req.device = {
                deleted: false,
                deviceID: "device-1",
                lastLogin: new Date().toISOString(),
                name: "Test device",
                owner: userID,
                signKey: "a".repeat(64),
            };
        } else {
            req.passkey = { passkeyID };
        }
        next();
    });
    app.use(getPasswordRouter(db));
    app.use(errorHandler());

    return new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            const { port } = server.address() as AddressInfo;
            resolve({
                baseUrl: `http://127.0.0.1:${String(port)}`,
                passwordHash: () => passwordHash,
                rehashPassword,
            });
        });
        servers.push(server);
    });
}

async function patchPassword(
    baseUrl: string,
    routeUserID: string,
    body: { currentPassword?: string; newPassword: string },
): Promise<Response> {
    return fetch(`${baseUrl}/user/${routeUserID}/password`, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
    });
}
