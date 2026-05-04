/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { SpireOptions } from "../Spire.ts";

import { describe, expect, it, vi } from "vitest";

import { Database } from "../Database.ts";

vi.mock("uuid", () => ({
    parse: (s: string) => {
        const matches = s.replace(/-/g, "").match(/.{2}/g);
        if (!matches) throw new Error("Invalid UUID");
        return Uint8Array.from(matches.map((b) => parseInt(b, 16)));
    },
    stringify: (b: Uint8Array) => {
        const hex = Array.from(b)
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
    },
    v4: vi.fn(() => "93ce482b-a0f2-4f6e-b1df-3aed61073552"),
    validate: () => true,
}));

const options: SpireOptions = {
    dbType: "sqlite3mem",
};

const userID = "4e67b90f-cbf8-44bc-8ce3-d3b248f033f1";

const samplePasskey = {
    algorithm: -7,
    credentialID: "credential-id-base64url",
    name: "Yubikey 5C",
    publicKeyHex:
        "30c2d0294c1cfdbb73c6b3bbe6010088c2dba8384b04ff2e2b92172431d66b5e",
    transports: ["usb", "nfc"],
};

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
                        // so we surface the original error instead.
                    });
                    reject(e instanceof Error ? e : new Error(String(e)));
                }
            })();
        });
    });
}

describe("Database passkeys", () => {
    describe("createPasskey", () => {
        it("inserts a passkey and returns the public shape (no key material)", async () => {
            expect.assertions(7);
            await withDb(async (db) => {
                const created = await db.createPasskey(
                    userID,
                    samplePasskey.name,
                    samplePasskey.credentialID,
                    samplePasskey.publicKeyHex,
                    samplePasskey.algorithm,
                    samplePasskey.transports,
                );

                expect(created.userID).toBe(userID);
                expect(created.name).toBe(samplePasskey.name);
                expect(created.transports).toEqual(samplePasskey.transports);
                expect(created.lastUsedAt).toBeNull();
                expect(typeof created.passkeyID).toBe("string");
                expect(created.passkeyID.length).toBeGreaterThan(0);
                // Internal fields should NOT be on the public shape
                expect(
                    (created as unknown as Record<string, unknown>)[
                        "publicKey"
                    ],
                ).toBeUndefined();
            });
        });
    });

    describe("retrievePasskeyByCredentialID", () => {
        it("returns the row including key material when looked up by credentialID", async () => {
            expect.assertions(4);
            await withDb(async (db) => {
                await db.createPasskey(
                    userID,
                    samplePasskey.name,
                    samplePasskey.credentialID,
                    samplePasskey.publicKeyHex,
                    samplePasskey.algorithm,
                    samplePasskey.transports,
                );

                const row = await db.retrievePasskeyByCredentialID(
                    samplePasskey.credentialID,
                );

                expect(row).not.toBeNull();
                if (row === null) return;
                expect(row.publicKey).toBe(samplePasskey.publicKeyHex);
                expect(row.algorithm).toBe(samplePasskey.algorithm);
                expect(row.signCount).toBe(0);
            });
        });

        it("returns null for an unknown credentialID", async () => {
            expect.assertions(1);
            await withDb(async (db) => {
                const row =
                    await db.retrievePasskeyByCredentialID("does-not-exist");
                expect(row).toBeNull();
            });
        });
    });

    describe("retrievePasskeysByUser", () => {
        it("returns all passkeys for the user in public shape", async () => {
            expect.assertions(3);
            await withDb(async (db) => {
                await db.createPasskey(
                    userID,
                    "yubikey",
                    "cred-1",
                    samplePasskey.publicKeyHex,
                    -7,
                    ["usb"],
                );
                await db.createPasskey(
                    userID,
                    "iCloud",
                    "cred-2",
                    samplePasskey.publicKeyHex,
                    -7,
                    [],
                );

                const list = await db.retrievePasskeysByUser(userID);
                expect(list).toHaveLength(2);
                const names = list.map((p) => p.name).sort();
                expect(names).toEqual(["iCloud", "yubikey"]);
                // empty transports column should decode to []
                const icloud = list.find((p) => p.name === "iCloud");
                expect(icloud?.transports).toEqual([]);
            });
        });

        it("returns an empty array for users with no passkeys", async () => {
            expect.assertions(1);
            await withDb(async (db) => {
                const list = await db.retrievePasskeysByUser(userID);
                expect(list).toEqual([]);
            });
        });
    });

    describe("markPasskeyUsed", () => {
        it("bumps the signature counter and lastUsedAt timestamp", async () => {
            expect.assertions(3);
            await withDb(async (db) => {
                const created = await db.createPasskey(
                    userID,
                    samplePasskey.name,
                    samplePasskey.credentialID,
                    samplePasskey.publicKeyHex,
                    samplePasskey.algorithm,
                    samplePasskey.transports,
                );

                await db.markPasskeyUsed(created.passkeyID, 42);
                const row = await db.retrievePasskeyInternal(created.passkeyID);

                expect(row).not.toBeNull();
                if (row === null) return;
                expect(row.signCount).toBe(42);
                expect(row.lastUsedAt).not.toBeNull();
            });
        });
    });

    describe("deletePasskey", () => {
        it("removes the passkey row", async () => {
            expect.assertions(2);
            await withDb(async (db) => {
                const created = await db.createPasskey(
                    userID,
                    samplePasskey.name,
                    samplePasskey.credentialID,
                    samplePasskey.publicKeyHex,
                    samplePasskey.algorithm,
                    samplePasskey.transports,
                );

                await db.deletePasskey(created.passkeyID);

                const row = await db.retrievePasskeyInternal(created.passkeyID);
                expect(row).toBeNull();

                const list = await db.retrievePasskeysByUser(userID);
                expect(list).toEqual([]);
            });
        });
    });
});
