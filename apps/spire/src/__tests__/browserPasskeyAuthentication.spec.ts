/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Passkey, User } from "@vex-chat/types";
import type { Server } from "node:http";

import express from "express";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPasskeyRouter } from "../server/passkey.ts";

const user: User = {
    lastSeen: new Date(0).toISOString(),
    userID: "user-browser-auth",
    username: "alice",
};

const passkey: Passkey = {
    createdAt: new Date(0).toISOString(),
    lastUsedAt: null,
    name: "MacBook Touch ID",
    passkeyID: "passkey-browser-auth",
    transports: ["internal"],
    userID: user.userID,
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

describe("browser passkey authentication", () => {
    it("returns an HTTPS assertion to the original authentication request", async () => {
        const db = {
            retrievePasskeyInternal: vi.fn(() =>
                Promise.resolve({ credentialID: "credential-browser-auth" }),
            ),
            retrievePasskeysByUser: vi.fn(() => Promise.resolve([passkey])),
            retrieveUser: vi.fn(() => Promise.resolve(user)),
        } as unknown as Database;
        const app = express();
        app.use(express.json());
        app.use(getPasskeyRouter(db));
        const server = await listen(app);

        try {
            const baseUrl = serverBaseUrl(server);
            const authBeginResponse = await post(
                `${baseUrl}/auth/passkey/begin?format=json`,
                { username: user.username },
            );
            const authBegin = (await authBeginResponse.json()) as {
                options: {
                    challenge: string;
                    rpId: string;
                    vexBrowserHandoff: {
                        browserToken: string;
                        expiresAt: string;
                        requestID: string;
                    };
                };
                requestID: string;
            };
            const handoff = authBegin.options.vexBrowserHandoff;

            expect(authBeginResponse.status).toBe(200);
            expect(authBegin.options.rpId).toBe("vex.example");
            expect(handoff.browserToken.length).toBeGreaterThanOrEqual(32);
            expect(handoff.requestID).not.toBe(authBegin.requestID);

            const wrongTokenResponse = await post(
                `${baseUrl}/auth/passkey/browser-authentication/${handoff.requestID}/begin?format=json`,
                { token: "x".repeat(43) },
            );
            expect(wrongTokenResponse.status).toBe(401);

            const pendingResponse = await post(
                `${baseUrl}/auth/passkey/browser-authentication/${handoff.requestID}/status?format=json`,
                { token: handoff.browserToken },
            );
            expect(pendingResponse.status).toBe(202);

            const browserBeginResponse = await post(
                `${baseUrl}/auth/passkey/browser-authentication/${handoff.requestID}/begin?format=json`,
                { token: handoff.browserToken },
            );
            const browserBegin = (await browserBeginResponse.json()) as {
                options: {
                    challenge: string;
                    vexBrowserHandoff?: unknown;
                };
            };
            expect(browserBeginResponse.status).toBe(200);
            expect(browserBegin.options.challenge).toBe(
                authBegin.options.challenge,
            );
            expect(browserBegin.options.vexBrowserHandoff).toBeUndefined();

            const assertion = {
                id: "credential-browser-auth",
                response: { signature: "browser-assertion" },
                type: "public-key",
            };
            const browserFinishResponse = await post(
                `${baseUrl}/auth/passkey/browser-authentication/${handoff.requestID}/finish?format=json`,
                { response: assertion, token: handoff.browserToken },
            );
            expect(browserFinishResponse.status).toBe(200);

            const readyResponse = await post(
                `${baseUrl}/auth/passkey/browser-authentication/${handoff.requestID}/status?format=json`,
                { token: handoff.browserToken },
            );
            expect(readyResponse.status).toBe(200);
            await expect(readyResponse.json()).resolves.toEqual({
                response: assertion,
            });

            const consumeResponse = await post(
                `${baseUrl}/auth/passkey/finish?format=json`,
                { requestID: authBegin.requestID, response: {} },
            );
            expect(consumeResponse.status).toBe(400);

            const replayResponse = await post(
                `${baseUrl}/auth/passkey/browser-authentication/${handoff.requestID}/status?format=json`,
                { token: handoff.browserToken },
            );
            expect(replayResponse.status).toBe(401);
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

function post(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
        method: "POST",
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
