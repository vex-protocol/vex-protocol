import type { Message } from "../index.js";
import type { ClientDatabase } from "../storage/schema.js";

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
        .select(["decrypted", "extra", "message"])
        .where("mailID", "=", mailID)
        .executeTakeFirst();
}

function nonceHex(value: number): string {
    return value.toString(16).padStart(48, "0");
}
