import type { Message } from "../index.js";
import type { ClientDatabase } from "../storage/schema.js";
import type { SessionSQL } from "@vex-chat/types";

import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { describe, expect, it } from "vitest";

import { SqliteStorage } from "../storage/sqlite.js";

describe("SqliteStorage message at-rest encryption", () => {
    it("stores generated decrypt-failure placeholders as the only plaintext exception", async () => {
        const { db, storage } = makeStorage();
        try {
            await storage.init();

            const placeholder = makeMessage({
                decrypted: false,
                mailID: "placeholder-mail",
                message: "",
                nonce: nonceHex(1),
            });
            await storage.saveMessage(placeholder);

            const row = await messageRow(db, placeholder.mailID);
            expect(row?.decrypted).toBe(0);
            expect(row?.extra).toBeNull();
            expect(row?.message).toBe("");

            const history = await storage.getMessageHistory(
                placeholder.authorID,
            );
            expect(history).toMatchObject([
                {
                    decrypted: false,
                    mailID: placeholder.mailID,
                    message: "",
                },
            ]);
        } finally {
            await storage.close();
        }
    });

    it("seals non-placeholder undecrypted messages and round-trips their content", async () => {
        const { db, storage } = makeStorage();
        try {
            await storage.init();

            const imported = makeMessage({
                decrypted: false,
                extra: JSON.stringify({ imported: true }),
                mailID: "imported-mail",
                message: "cleartext should not sit in sqlite",
                nonce: nonceHex(2),
            });
            await storage.saveMessage(imported);

            const row = await messageRow(db, imported.mailID);
            expect(row?.decrypted).toBe(0);
            expect(row?.extra).toBeNull();
            expect(row?.message).not.toContain(imported.message);
            expect(row?.message).not.toContain(imported.extra ?? "");

            const history = await storage.getMessageHistory(imported.authorID);
            expect(history).toMatchObject([
                {
                    decrypted: false,
                    extra: imported.extra,
                    mailID: imported.mailID,
                    message: imported.message,
                },
            ]);
        } finally {
            await storage.close();
        }
    });

    it("uses a fresh local nonce when a stored message is edited", async () => {
        const { db, storage } = makeStorage();
        try {
            await storage.init();
            const message = makeMessage({
                mailID: "editable-mail",
                message: "before",
                nonce: nonceHex(3),
            });
            await storage.saveMessage(message);

            const before = await messageRow(db, message.mailID);
            expect(before?.message).toMatch(/^vex-storage-cipher:2:/);
            const localNonce = before?.message
                .slice("vex-storage-cipher:2:".length)
                .slice(0, 48);
            expect(localNonce).not.toBe(message.nonce);

            await expect(
                storage.updateMessage(message.mailID, { message: "after" }),
            ).resolves.toBe(true);
            const after = await messageRow(db, message.mailID);
            expect(after?.message).toMatch(/^vex-storage-cipher:2:/);
            expect(after?.message).not.toBe(before?.message);
            expect(after?.nonce).toBe(message.nonce);

            const history = await storage.getMessageHistory(message.authorID);
            expect(history).toMatchObject([
                { mailID: message.mailID, message: "after" },
            ]);
        } finally {
            await storage.close();
        }
    });

    it("encrypts skipped Double Ratchet keys at rest", async () => {
        const { db, storage } = makeStorage();
        try {
            await storage.init();
            const skippedKeys = JSON.stringify({
                "ratchet-key:7": "ab".repeat(32),
            });
            const session = makeSession({ skippedKeys });
            await storage.saveSession(session);

            const row = await db
                .selectFrom("sessions")
                .select("skippedKeys")
                .where("sessionID", "=", session.sessionID)
                .executeTakeFirstOrThrow();
            expect(row.skippedKeys).toMatch(/^vex-storage-secret:1:/);
            expect(row.skippedKeys).not.toContain("ratchet-key");
            expect(row.skippedKeys).not.toContain("ab".repeat(32));

            const roundTripped = await storage.getAllSessions();
            expect(roundTripped).toMatchObject([
                { sessionID: session.sessionID, skippedKeys },
            ]);
        } finally {
            await storage.close();
        }
    });
});

function makeMessage(overrides: Partial<Message>): Message {
    return {
        authorID: "peer-user",
        decrypted: true,
        direction: "incoming",
        forward: false,
        group: null,
        mailID: "mail",
        message: "hello",
        nonce: nonceHex(0),
        readerID: "local-user",
        recipient: "local-device",
        sender: "peer-device",
        timestamp: "2026-06-01T00:00:00.000Z",
        ...overrides,
    };
}

function makeSession(overrides: Partial<SessionSQL>): SessionSQL {
    return {
        CKr: null,
        CKs: null,
        deviceID: "peer-device",
        DHr: null,
        DHsPrivate: "11".repeat(32),
        DHsPublic: "22".repeat(32),
        fingerprint: "33".repeat(32),
        lastUsed: "2026-06-01T00:00:00.000Z",
        mode: "initiator",
        Nr: 0,
        Ns: 0,
        PN: 0,
        publicKey: "44".repeat(32),
        RK: "55".repeat(32),
        sessionID: "session-id",
        SK: "66".repeat(32),
        skippedKeys: "{}",
        userID: "peer-user",
        verified: false,
        ...overrides,
    };
}

function makeStorage(): {
    db: Kysely<ClientDatabase>;
    storage: SqliteStorage;
} {
    const db = new Kysely<ClientDatabase>({
        dialect: new SqliteDialect({
            database: new BetterSqlite3(":memory:"),
        }),
    });
    return {
        db,
        storage: new SqliteStorage(db, new Uint8Array(32).fill(7)),
    };
}

async function messageRow(db: Kysely<ClientDatabase>, mailID: string) {
    return await db
        .selectFrom("messages")
        .select(["decrypted", "extra", "message", "nonce"])
        .where("mailID", "=", mailID)
        .executeTakeFirst();
}

function nonceHex(value: number): string {
    return value.toString(16).padStart(48, "0");
}
