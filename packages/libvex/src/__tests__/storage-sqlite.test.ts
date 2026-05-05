/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientDatabase } from "../storage/schema.js";
import type { SessionSQL } from "@vex-chat/types";

import { XUtils } from "@vex-chat/crypto";

import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { afterEach, describe, expect, test } from "vitest";

import { SqliteStorage } from "../storage/sqlite.js";

const dbs: Kysely<ClientDatabase>[] = [];

afterEach(async () => {
    for (const db of dbs.splice(0)) {
        await db.destroy();
    }
});

describe("SqliteStorage session secret persistence", () => {
    test("seals skipped keys and retires persisted X3DH SK", async () => {
        const db = makeDb();
        const storage = new SqliteStorage(db, key(1));
        await storage.init();

        await storage.saveSession(makeSession());

        const row = await db
            .selectFrom("sessions")
            .select(["SK", "skippedKeys"])
            .where("sessionID", "=", "session-1")
            .executeTakeFirstOrThrow();

        expect(row.skippedKeys.startsWith("{")).toBe(false);
        expect(row.skippedKeys).not.toContain("aaaaaaaa");

        const session = await storage.getSessionByDeviceID("device-1");

        expect(session?.skippedKeys["bbbb:1"]).toBe("aaaaaaaa");
        expect(session?.SK).toEqual(
            new TextEncoder().encode("retired:session-1"),
        );
    });

    test("reads legacy plaintext skipped keys", async () => {
        const db = makeDb();
        const storage = new SqliteStorage(db, key(1));
        await storage.init();
        await storage.saveSession(makeSession());

        await db
            .updateTable("sessions")
            .set({ skippedKeys: '{"bbbb:1":"aaaaaaaa"}' })
            .where("sessionID", "=", "session-1")
            .execute();

        const session = await storage.getSessionByDeviceID("device-1");

        expect(session?.skippedKeys["bbbb:1"]).toBe("aaaaaaaa");
    });

    test("reads rows sealed with the legacy TweetNaCl at-rest key", async () => {
        const db = makeDb();
        const legacyKey = key(2);
        const primaryKey = key(3);
        const legacyStorage = new SqliteStorage(db, legacyKey);
        await legacyStorage.init();
        await legacyStorage.saveSession(makeSession());

        const migratedStorage = new SqliteStorage(db, primaryKey, [legacyKey]);
        await migratedStorage.init();

        const session = await migratedStorage.getSessionByDeviceID("device-1");

        expect(session?.RK).toEqual(XUtils.decodeHex("11".repeat(32)));
        expect(session?.skippedKeys["bbbb:1"]).toBe("aaaaaaaa");
    });
});

function key(seed: number): Uint8Array {
    return Uint8Array.from({ length: 32 }, (_v, i) => (seed + i) % 256);
}

function makeDb(): Kysely<ClientDatabase> {
    const db = new Kysely<ClientDatabase>({
        dialect: new SqliteDialect({
            database: new BetterSqlite3(":memory:"),
        }),
    });
    dbs.push(db);
    return db;
}

function makeSession(): SessionSQL {
    return {
        CKr: "22".repeat(32),
        CKs: "33".repeat(32),
        deviceID: "device-1",
        DHr: "44".repeat(32),
        DHsPrivate: "55".repeat(32),
        DHsPublic: "66".repeat(32),
        fingerprint: "77".repeat(32),
        lastUsed: "2026-05-05T00:00:00.000Z",
        mode: "initiator",
        Nr: 0,
        Ns: 0,
        PN: 0,
        publicKey: "88".repeat(32),
        RK: "11".repeat(32),
        sessionID: "session-1",
        SK: "99".repeat(32),
        skippedKeys: '{"bbbb:1":"aaaaaaaa"}',
        userID: "user-1",
        verified: false,
    };
}
