/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { SpireOptions } from "../Spire.ts";
import type { AddressInfo } from "node:net";

import express from "express";

import { buildAccountEntitlements } from "@vex-chat/types";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Database } from "../Database.ts";
import {
    devEntitlementRoutesEnabled,
    getEntitlementRouter,
} from "../server/entitlements.ts";

const options: SpireOptions = {
    dbType: "sqlite3mem",
};

const userID = "4e67b90f-cbf8-44bc-8ce3-d3b248f033f1";
const servers: Array<{ close: () => void }> = [];
const originalEnv = { ...process.env };

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.close();
    }
    process.env = { ...originalEnv };
});

async function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    const provider = new Database(options);
    return new Promise<T>((resolve, reject) => {
        provider.once("ready", () => {
            void (async () => {
                try {
                    const result = await fn(provider);
                    await provider.close();
                    resolve(result);
                } catch (e: unknown) {
                    await provider.close().catch(() => {
                        // best-effort cleanup; ignore close failures here
                    });
                    reject(e instanceof Error ? e : new Error(String(e)));
                }
            })();
        });
    });
}

describe("Database account entitlements", () => {
    it("returns a computed free snapshot when the user has no row", async () => {
        expect.assertions(7);
        await withDb(async (db) => {
            const entitlements = await db.retrieveAccountEntitlements(userID);

            expect(entitlements.userID).toBe(userID);
            expect(entitlements.tier).toBe("free");
            expect(entitlements.source).toBe("default");
            expect(entitlements.expiresAt).toBeNull();
            expect(
                entitlements.capabilities["attachments.encrypted_uploads"],
            ).toBe(true);
            expect(entitlements.capabilities["calls.relay_priority"]).toBe(
                false,
            );
            expect(entitlements.limits["devices.max_trusted_devices"]).toBe(2);
        });
    });

    it("persists a dev override tier and derives its capabilities", async () => {
        expect.assertions(5);
        await withDb(async (db) => {
            const updated = await db.setAccountEntitlementTier(userID, "pro", {
                source: "dev_override",
            });
            const retrieved = await db.retrieveAccountEntitlements(userID);

            expect(updated.tier).toBe("pro");
            expect(retrieved.tier).toBe("pro");
            expect(retrieved.source).toBe("dev_override");
            expect(retrieved.capabilities["calls.relay_priority"]).toBe(true);
            expect(retrieved.limits["attachments.max_encrypted_bytes"]).toBe(
                500 * 1024 * 1024,
            );
        });
    });
});

describe("dev entitlement route guard", () => {
    it("is disabled by default and in production", () => {
        expect(devEntitlementRoutesEnabled({})).toBe(false);
        expect(
            devEntitlementRoutesEnabled({
                DEV_API_KEY: "local",
                NODE_ENV: "production",
                VEX_ENABLE_DEV_ENTITLEMENTS: "1",
            }),
        ).toBe(false);
    });

    it("requires an explicit flag and dev API key", () => {
        expect(
            devEntitlementRoutesEnabled({
                DEV_API_KEY: "local",
                NODE_ENV: "development",
                VEX_ENABLE_DEV_ENTITLEMENTS: "1",
            }),
        ).toBe(true);
        expect(
            devEntitlementRoutesEnabled({
                NODE_ENV: "development",
                VEX_ENABLE_DEV_ENTITLEMENTS: "1",
            }),
        ).toBe(false);
    });
});

describe("entitlement routes", () => {
    it("returns the authenticated user's entitlement snapshot", async () => {
        const retrieveAccountEntitlements = vi.fn((id: string) =>
            Promise.resolve(
                buildAccountEntitlements({ tier: "plus", userID: id }),
            ),
        );
        const db = {
            retrieveAccountEntitlements,
        } as unknown as Database;
        const { baseUrl } = mountEntitlementRouter(db);

        const res = await fetch(
            `${baseUrl}/user/${userID}/entitlements?format=json`,
        );
        const body = (await res.json()) as { tier?: unknown; userID?: unknown };

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ tier: "plus", userID });
        expect(retrieveAccountEntitlements).toHaveBeenCalledWith(userID);
    });

    it("does not mount the dev override route unless explicitly enabled", async () => {
        const setAccountEntitlementTier = vi.fn();
        const db = {
            retrieveAccountEntitlements: vi.fn(),
            setAccountEntitlementTier,
        } as unknown as Database;
        const { baseUrl } = mountEntitlementRouter(db);

        const res = await fetch(
            `${baseUrl}/__dev/user/${userID}/entitlements?format=json`,
            {
                body: JSON.stringify({ tier: "pro" }),
                headers: { "Content-Type": "application/json" },
                method: "PATCH",
            },
        );

        expect(res.status).toBe(404);
        expect(setAccountEntitlementTier).not.toHaveBeenCalled();
    });

    it("allows dev overrides only with the explicit flag and dev API key", async () => {
        process.env["NODE_ENV"] = "development";
        process.env["VEX_ENABLE_DEV_ENTITLEMENTS"] = "1";
        process.env["DEV_API_KEY"] = "local-secret";

        const setAccountEntitlementTier = vi.fn((id: string) =>
            Promise.resolve(
                buildAccountEntitlements({
                    source: "dev_override",
                    tier: "pro",
                    userID: id,
                }),
            ),
        );
        const db = {
            retrieveAccountEntitlements: vi.fn(),
            setAccountEntitlementTier,
        } as unknown as Database;
        const notify = vi.fn();
        const { baseUrl } = mountEntitlementRouter(db, notify);

        const res = await fetch(
            `${baseUrl}/__dev/user/${userID}/entitlements?format=json`,
            {
                body: JSON.stringify({ tier: "pro" }),
                headers: {
                    "Content-Type": "application/json",
                    "x-dev-api-key": "local-secret",
                },
                method: "PATCH",
            },
        );
        const body = (await res.json()) as { source?: unknown; tier?: unknown };

        expect(res.status).toBe(200);
        expect(body).toMatchObject({ source: "dev_override", tier: "pro" });
        expect(setAccountEntitlementTier).toHaveBeenCalledWith(userID, "pro", {
            expiresAt: null,
            source: "dev_override",
        });
        expect(notify).toHaveBeenCalledWith(
            userID,
            "accountEntitlementsChanged",
            expect.any(String),
            { tier: "pro" },
        );
    });
});

function mountEntitlementRouter(
    db: Database,
    notify = vi.fn(),
): { baseUrl: string } {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        (
            req as express.Request & {
                user?: { lastSeen: string; userID: string; username: string };
            }
        ).user = {
            lastSeen: new Date().toISOString(),
            userID,
            username: "alice",
        };
        next();
    });
    app.use(getEntitlementRouter(db, notify));

    const server = app.listen(0);
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${String(port)}` };
}
