/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { SpireOptions } from "../Spire.ts";
import type { AddressInfo } from "node:net";

import express from "express";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Database } from "../Database.ts";
import {
    devBillingGrantRoutesEnabled,
    getBillingRouter,
} from "../server/billing.ts";

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

describe("Database store subscriptions", () => {
    it("derives store entitlements from active subscriptions", async () => {
        expect.assertions(4);
        await withDb(async (db) => {
            await db.upsertStoreSubscription({
                environment: "sandbox",
                expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                externalOriginalID: "orig-1",
                externalTransactionID: "tx-1",
                platform: "apple_app_store",
                productID: "apple_plus_monthly",
                rawPayload: { transactionId: "tx-1" },
                status: "active",
                storeProductID: "chat.vex.plus.monthly",
                tier: "plus",
                userID,
            });

            const entitlements = await db.recalculateStoreEntitlements(userID);
            const state = await db.retrieveBillingAccountState(userID);

            expect(entitlements.tier).toBe("plus");
            expect(entitlements.source).toBe("store");
            expect(state.subscriptions).toHaveLength(1);
            expect(state.subscriptions[0]).toMatchObject({
                platform: "apple_app_store",
                status: "active",
                tier: "plus",
            });
        });
    });

    it("downgrades expired store entitlements to free", async () => {
        expect.assertions(2);
        await withDb(async (db) => {
            await db.setAccountEntitlementTier(userID, "pro", {
                expiresAt: new Date(Date.now() - 1_000).toISOString(),
                source: "store",
            });
            await db.upsertStoreSubscription({
                environment: "sandbox",
                expiresAt: new Date(Date.now() - 1_000).toISOString(),
                externalOriginalID: "orig-2",
                externalTransactionID: "tx-2",
                platform: "apple_app_store",
                productID: "apple_pro_monthly",
                rawPayload: { transactionId: "tx-2" },
                status: "expired",
                storeProductID: "chat.vex.pro.monthly",
                tier: "pro",
                userID,
            });

            const entitlements = await db.recalculateStoreEntitlements(userID);

            expect(entitlements.tier).toBe("free");
            expect(entitlements.source).toBe("store");
        });
    });
});

describe("billing route guard", () => {
    it("requires explicit non-production grant opt-in", () => {
        expect(devBillingGrantRoutesEnabled({})).toBe(false);
        expect(
            devBillingGrantRoutesEnabled({
                DEV_API_KEY: "local",
                NODE_ENV: "production",
                VEX_ENABLE_DEV_BILLING_GRANTS: "1",
            }),
        ).toBe(false);
        expect(
            devBillingGrantRoutesEnabled({
                DEV_API_KEY: "local",
                NODE_ENV: "development",
                VEX_ENABLE_DEV_BILLING_GRANTS: "1",
            }),
        ).toBe(true);
    });
});

describe("billing routes", () => {
    it("returns configured billing products", async () => {
        process.env["VEX_BILLING_PRODUCTS_JSON"] = JSON.stringify([
            {
                environment: "sandbox",
                platform: "apple_app_store",
                productID: "apple_plus_monthly",
                storeProductID: "chat.vex.plus.monthly",
                tier: "plus",
            },
        ]);
        const { baseUrl } = mountBillingRouter({} as Database);

        const res = await fetch(`${baseUrl}/billing/products?format=json`);
        const body = (await res.json()) as unknown[];

        expect(res.status).toBe(200);
        expect(body).toEqual([
            {
                environment: "sandbox",
                platform: "apple_app_store",
                productID: "apple_plus_monthly",
                storeProductID: "chat.vex.plus.monthly",
                tier: "plus",
            },
        ]);
    });

    it("verifies a local Apple transaction payload and refreshes entitlements", async () => {
        process.env["NODE_ENV"] = "development";
        process.env["VEX_BILLING_ALLOW_LOCAL_STORE_PAYLOADS"] = "1";
        process.env["VEX_BILLING_PRODUCTS_JSON"] = JSON.stringify([
            {
                environment: "sandbox",
                platform: "apple_app_store",
                productID: "apple_plus_monthly",
                storeProductID: "chat.vex.plus.monthly",
                tier: "plus",
            },
        ]);

        await withDb(async (db) => {
            const notify = vi.fn();
            const { baseUrl } = mountBillingRouter(db, notify);
            const res = await fetch(
                `${baseUrl}/billing/apple/transactions?format=json`,
                {
                    body: JSON.stringify({
                        environment: "sandbox",
                        signedTransactionInfo: encodedPayload({
                            environment: "Sandbox",
                            expiresDate: Date.now() + 86_400_000,
                            originalTransactionId: "orig-apple-1",
                            productId: "chat.vex.plus.monthly",
                            transactionId: "tx-apple-1",
                        }),
                    }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                },
            );
            const body = (await res.json()) as {
                entitlements?: { tier?: unknown };
                subscriptions?: unknown[];
            };

            expect(res.status).toBe(200);
            expect(body.entitlements?.tier).toBe("plus");
            expect(body.subscriptions).toHaveLength(1);
            expect(notify).toHaveBeenCalledWith(
                userID,
                "accountEntitlementsChanged",
                expect.any(String),
                { tier: "plus" },
            );
        });
    });

    it("allows explicit dev billing grants with the dev key", async () => {
        process.env["NODE_ENV"] = "development";
        process.env["DEV_API_KEY"] = "local-secret";
        process.env["VEX_ENABLE_DEV_BILLING_GRANTS"] = "1";
        await withDb(async (db) => {
            const notify = vi.fn();
            const { baseUrl } = mountBillingRouter(db, notify);

            const res = await fetch(
                `${baseUrl}/__dev/billing/grants?format=json`,
                {
                    body: JSON.stringify({ tier: "pro", userID }),
                    headers: {
                        "Content-Type": "application/json",
                        "x-dev-api-key": "local-secret",
                    },
                    method: "POST",
                },
            );
            const body = (await res.json()) as {
                source?: unknown;
                tier?: unknown;
            };

            expect(res.status).toBe(200);
            expect(body).toMatchObject({ source: "store", tier: "pro" });
            expect(notify).toHaveBeenCalledWith(
                userID,
                "accountEntitlementsChanged",
                expect.any(String),
                { tier: "pro" },
            );
        });
    });
});

function encodedPayload(payload: unknown): string {
    return Buffer.from(JSON.stringify(payload))
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function mountBillingRouter(
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
    app.use(getBillingRouter(db, notify));

    const server = app.listen(0);
    servers.push(server);
    const { port } = server.address() as AddressInfo;
    return { baseUrl: `http://127.0.0.1:${String(port)}` };
}

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
