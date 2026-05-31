/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Message } from "../index.js";
import type { MessageUpdatePatch, Storage } from "../Storage.js";
import type {
    PreKeysCrypto,
    SessionCrypto,
    UnsavedPreKey,
} from "../types/index.js";
import type {
    ClientDatabase,
    DeviceRow,
    MessageRow,
    SessionRow,
} from "./schema.js";
import type { Device, PreKeysSQL, SessionSQL } from "@vex-chat/types";

/**
 * Unified Kysely-based SQLite storage implementation.
 *
 * Accepts any `Kysely<ClientDatabase>` instance — the caller picks the
 * dialect (better-sqlite3, Tauri plugin-sql, expo-sqlite, etc.) and
 * passes the configured Kysely handle here.
 *
 * This replaces three separate storage classes (Storage.ts, TauriStorage,
 * ExpoStorage) with a single implementation.
 *
 * **One database file today** holds both `sessions` (Double Ratchet /
 * X3DH state — required to decrypt *new* traffic) and `messages` (history).
 * If the file is lost or corrupted you lose both; restoring from backup
 * re-seeds device keys but cannot reconstruct dropped ratchet chains from
 * the server alone. A future split could park `sessions` + OTKs in a
 * smaller “crypto state” store separate from bulk message history.
 */
import {
    getCryptoProfile,
    xBoxKeyPairFromSecret,
    xBoxKeyPairFromSecretAsync,
    xMakeNonce,
    xSecretbox,
    xSecretboxAsync,
    xSecretboxOpen,
    xSecretboxOpenAsync,
    XUtils,
} from "@vex-chat/crypto";

import { EventEmitter } from "eventemitter3";
import { type Kysely, sql } from "kysely";

import { effectiveMessageRetentionHintDays } from "../retention.js";
import { parseSkippedKeysStrict } from "../utils/ratchet.js";

const STORAGE_MESSAGE_BLOB_PREFIX = "vex-storage-message:1\n";

export class SqliteStorage extends EventEmitter implements Storage {
    public ready = false;
    /** 32-byte AES-256 (or nacl) key for local at-rest `secretbox` (see `XUtils.deriveLocalAtRestAesKey`). */
    private readonly atRestAesKey: Uint8Array;
    private closing = false;
    private readonly db: Kysely<ClientDatabase>;
    /** Shared across concurrent `init()` callers; `close()` awaits it before `destroy()`. */
    private initInFlight: null | Promise<void> = null;

    constructor(db: Kysely<ClientDatabase>, atRestAesKey: Uint8Array) {
        super();
        this.db = db;
        if (atRestAesKey.length !== 32) {
            throw new Error("SqliteStorage requires a 32-byte atRestAes key.");
        }
        this.atRestAesKey = atRestAesKey;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────────

    async close(): Promise<void> {
        this.closing = true;
        const pending = this.initInFlight;
        if (pending) {
            try {
                await pending;
            } catch {
                // Schema init may have failed; still tear down the driver.
            }
        }
        await this.db.destroy();
    }

    async deleteHistory(channelOrUserID: string): Promise<void> {
        await this.db
            .deleteFrom("messages")
            .where((eb) =>
                eb.or([
                    eb("group", "=", channelOrUserID),
                    eb.and([
                        eb("group", "is", null),
                        eb("authorID", "=", channelOrUserID),
                    ]),
                    eb.and([
                        eb("group", "is", null),
                        eb("readerID", "=", channelOrUserID),
                    ]),
                ]),
            )
            .execute();
    }

    async deleteMessage(mailID: string): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .deleteFrom("messages")
            .where("mailID", "=", mailID)
            .execute();
    }

    // ── Messages ─────────────────────────────────────────────────────────────

    async deleteOneTimeKey(index: number): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .deleteFrom("oneTimeKeys")
            .where("index", "=", index)
            .execute();
    }

    async getAllSessions(): Promise<SessionSQL[]> {
        if (this.closing) {
            return [];
        }
        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .orderBy("lastUsed", "desc")
            .execute();

        return await Promise.all(rows.map((s) => this.sessionRowToSQLAsync(s)));
    }

    async getDevice(deviceID: string): Promise<Device | null> {
        const rows = await this.db
            .selectFrom("devices")
            .selectAll()
            .where("deviceID", "=", deviceID)
            .execute();

        const row = rows[0];
        if (!row) {
            return null;
        }
        return this.deviceRowToDevice(row);
    }

    async getGroupHistory(channelID: string): Promise<Message[]> {
        if (this.closing) {
            return [];
        }

        const messages = await this.db
            .selectFrom("messages")
            .selectAll()
            .where("group", "=", channelID)
            .orderBy("timestamp", "asc")
            .execute();

        return this.decryptMessagesAsync(messages);
    }

    async getMessageHistory(userID: string): Promise<Message[]> {
        if (this.closing) {
            return [];
        }

        const messages = await this.db
            .selectFrom("messages")
            .selectAll()
            .where((eb) =>
                eb.or([
                    eb.and([
                        eb("direction", "=", "incoming"),
                        eb("authorID", "=", userID),
                        eb("group", "is", null),
                    ]),
                    eb.and([
                        eb("direction", "=", "outgoing"),
                        eb("readerID", "=", userID),
                        eb("group", "is", null),
                    ]),
                ]),
            )
            .orderBy("timestamp", "asc")
            .execute();

        return this.decryptMessagesAsync(messages);
    }

    async getOneTimeKey(index: number): Promise<null | PreKeysCrypto> {
        await this.untilReady();
        if (this.closing) {
            return null;
        }

        const rows = await this.db
            .selectFrom("oneTimeKeys")
            .selectAll()
            .where("index", "=", index)
            .execute();

        const otkInfo = rows[0];
        if (!otkInfo) {
            return null;
        }
        const rawSk = await this.unsealHex(otkInfo.privateKey);
        return {
            index: otkInfo.index,
            keyPair:
                getCryptoProfile() === "fips"
                    ? await xBoxKeyPairFromSecretAsync(XUtils.decodeHex(rawSk))
                    : xBoxKeyPairFromSecret(XUtils.decodeHex(rawSk)),
            signature: XUtils.decodeHex(otkInfo.signature),
        };
    }

    async getPreKeys(): Promise<null | PreKeysCrypto> {
        await this.untilReady();
        if (this.closing) {
            return null;
        }

        const rows = await this.db.selectFrom("preKeys").selectAll().execute();

        const preKeyInfo = rows[0];
        if (!preKeyInfo) {
            return null;
        }
        const rawPk = await this.unsealHex(preKeyInfo.privateKey);
        return {
            index: preKeyInfo.index,
            keyPair:
                getCryptoProfile() === "fips"
                    ? await xBoxKeyPairFromSecretAsync(XUtils.decodeHex(rawPk))
                    : xBoxKeyPairFromSecret(XUtils.decodeHex(rawPk)),
            signature: XUtils.decodeHex(preKeyInfo.signature),
        };
    }

    // ── Sessions ─────────────────────────────────────────────────────────────

    async getSessionByDeviceID(
        deviceID: string,
    ): Promise<null | SessionCrypto> {
        if (this.closing) {
            return null;
        }
        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .where("deviceID", "=", deviceID)
            .orderBy("lastUsed", "desc")
            .limit(1)
            .execute();

        const sessionRow = rows[0];
        if (!sessionRow) {
            return null;
        }

        return this.sqlToCrypto(await this.sessionRowToSQLAsync(sessionRow));
    }

    async getSessionByPublicKey(
        publicKey: Uint8Array,
    ): Promise<null | SessionCrypto> {
        if (this.closing) {
            return null;
        }
        const hex = XUtils.encodeHex(publicKey);

        const rows = await this.db
            .selectFrom("sessions")
            .selectAll()
            .where((eb) =>
                eb.or([eb("publicKey", "=", hex), eb("DHr", "=", hex)]),
            )
            .limit(1)
            .execute();

        const sessionRow = rows[0];
        if (!sessionRow) {
            return null;
        }

        return this.sqlToCrypto(await this.sessionRowToSQLAsync(sessionRow));
    }

    async hasMessage(mailID: string): Promise<boolean> {
        await this.untilReady();
        if (this.closing) {
            return false;
        }
        const row = await this.db
            .selectFrom("messages")
            .select("mailID")
            .where("mailID", "=", mailID)
            .executeTakeFirst();
        return row !== undefined;
    }

    async init(): Promise<void> {
        if (this.ready || this.closing) {
            return;
        }
        this.initInFlight ??= (async () => {
            try {
                await this.db.schema
                    .createTable("messages")
                    .ifNotExists()
                    .addColumn("nonce", "text", (col) => col.primaryKey())
                    .addColumn("sender", "text")
                    .addColumn("recipient", "text")
                    .addColumn("group", "text")
                    .addColumn("extra", "text")
                    .addColumn("mailID", "text")
                    .addColumn("message", "text")
                    .addColumn("direction", "text")
                    .addColumn("timestamp", "text")
                    .addColumn("decrypted", "integer")
                    .addColumn("forward", "integer")
                    .addColumn("authorID", "text")
                    .addColumn("readerID", "text")
                    .execute();

                await this.db.schema
                    .createTable("devices")
                    .ifNotExists()
                    .addColumn("deviceID", "text", (col) => col.primaryKey())
                    .addColumn("owner", "text")
                    .addColumn("signKey", "text")
                    .addColumn("name", "text")
                    .addColumn("lastLogin", "text")
                    .addColumn("deleted", "integer")
                    .execute();

                await this.db.schema
                    .createTable("sessions")
                    .ifNotExists()
                    .addColumn("sessionID", "text", (col) => col.primaryKey())
                    .addColumn("userID", "text")
                    .addColumn("deviceID", "text")
                    .addColumn("SK", "text", (col) => col.unique())
                    .addColumn("publicKey", "text")
                    .addColumn("fingerprint", "text")
                    .addColumn("mode", "text")
                    .addColumn("lastUsed", "text")
                    .addColumn("verified", "integer")
                    .addColumn("RK", "text")
                    .addColumn("DHsPublic", "text")
                    .addColumn("DHsPrivate", "text")
                    .addColumn("DHr", "text")
                    .addColumn("CKs", "text")
                    .addColumn("CKr", "text")
                    .addColumn("Ns", "integer", (col) => col.defaultTo(0))
                    .addColumn("Nr", "integer", (col) => col.defaultTo(0))
                    .addColumn("PN", "integer", (col) => col.defaultTo(0))
                    .addColumn("skippedKeys", "text", (col) =>
                        col.defaultTo("{}"),
                    )
                    .execute();
                await this.ensureSessionRatchetColumns();
                await this.ensureMessageExtraColumn();
                await this.ensureRetentionHintColumn();
                await this.ensureMessageMailIdIndex();

                await this.db.schema
                    .createTable("preKeys")
                    .ifNotExists()
                    .addColumn("index", "integer", (col) =>
                        col.primaryKey().autoIncrement(),
                    )
                    .addColumn("keyID", "text", (col) => col.unique())
                    .addColumn("userID", "text")
                    .addColumn("deviceID", "text")
                    .addColumn("privateKey", "text")
                    .addColumn("publicKey", "text")
                    .addColumn("signature", "text")
                    .execute();

                await this.db.schema
                    .createTable("oneTimeKeys")
                    .ifNotExists()
                    .addColumn("index", "integer", (col) =>
                        col.primaryKey().autoIncrement(),
                    )
                    .addColumn("keyID", "text", (col) => col.unique())
                    .addColumn("userID", "text")
                    .addColumn("deviceID", "text")
                    .addColumn("privateKey", "text")
                    .addColumn("publicKey", "text")
                    .addColumn("signature", "text")
                    .execute();

                this.ready = true;
                this.emit("ready");
            } catch (err: unknown) {
                this.emit(
                    "error",
                    err instanceof Error ? err : new Error(String(err)),
                );
            } finally {
                this.initInFlight = null;
            }
        })();
        await this.initInFlight;
    }

    async markSessionUsed(sessionID: string): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .updateTable("sessions")
            .set({ lastUsed: new Date(Date.now()).toISOString() })
            .where("sessionID", "=", sessionID)
            .execute();
    }

    async markSessionVerified(sessionID: string): Promise<void> {
        if (this.closing) {
            return;
        }
        await this.db
            .updateTable("sessions")
            .set({ verified: 1 })
            .where("sessionID", "=", sessionID)
            .execute();
    }

    // ── PreKeys / OneTimeKeys ────────────────────────────────────────────────

    async pruneExpiredLocalMessages(
        clientMaxRetentionDays: number,
    ): Promise<void> {
        await this.untilReady();
        if (this.closing) {
            return;
        }
        const cap = Math.min(
            30,
            Math.max(1, Math.round(clientMaxRetentionDays)),
        );
        const rows = await this.db
            .selectFrom("messages")
            .select(["mailID", "timestamp", "retentionHintDays"])
            .execute();
        const now = Date.now();
        const msPerDay = 86_400_000;
        const toDelete: string[] = [];
        for (const r of rows) {
            const hintDays = effectiveMessageRetentionHintDays(
                r.retentionHintDays,
            );
            const maxDays = Math.min(30, cap, hintDays);
            const ts = new Date(r.timestamp).getTime();
            if (!Number.isFinite(ts)) {
                continue;
            }
            if (now - ts > maxDays * msPerDay) {
                toDelete.push(r.mailID);
            }
        }
        if (toDelete.length === 0) {
            return;
        }
        for (const mailID of toDelete) {
            await this.db
                .deleteFrom("messages")
                .where("mailID", "=", mailID)
                .execute();
        }
    }

    async purgeHistory(): Promise<void> {
        await this.db.deleteFrom("messages").execute();
    }

    async purgeKeyData(): Promise<void> {
        await this.db.deleteFrom("sessions").execute();
        await this.db.deleteFrom("oneTimeKeys").execute();
        await this.db.deleteFrom("preKeys").execute();
        await this.db.deleteFrom("messages").execute();
    }

    async saveDevice(device: Device): Promise<void> {
        if (this.closing) {
            return;
        }
        try {
            await this.db
                .insertInto("devices")
                .values({
                    deleted: device.deleted ? 1 : 0,
                    deviceID: device.deviceID,
                    lastLogin: device.lastLogin,
                    name: device.name,
                    owner: device.owner,
                    signKey: device.signKey,
                })
                .execute();
        } catch (err: unknown) {
            if (this.isDuplicateError(err)) {
                // duplicate deviceID — ignore
            } else {
                throw err;
            }
        }
    }

    async saveMessage(message: Message): Promise<void> {
        if (this.isClosingNow()) {
            return;
        }
        await this.untilReady();

        // Fan-out to multiple devices reuses one `mailID` but each encrypt path
        // uses a fresh nonce (table PK). Keep a single local row per logical mail.
        const dupe = await this.db
            .selectFrom("messages")
            .select("nonce")
            .where("mailID", "=", message.mailID)
            .executeTakeFirst();
        if (dupe !== undefined) {
            return;
        }

        // Encrypt plaintext with at-rest key before saving to disk.
        const storedPlaintext = encodeStoredMessagePlaintext(message);
        const fips = getCryptoProfile() === "fips";
        const ct = fips
            ? await xSecretboxAsync(
                  XUtils.decodeUTF8(storedPlaintext),
                  XUtils.decodeHex(message.nonce),
                  this.atRestAesKey,
              )
            : xSecretbox(
                  XUtils.decodeUTF8(storedPlaintext),
                  XUtils.decodeHex(message.nonce),
                  this.atRestAesKey,
              );
        if (this.isClosingNow()) {
            return;
        }
        const encryptedMessage = XUtils.encodeHex(ct);

        try {
            await this.db
                .insertInto("messages")
                .values({
                    authorID: message.authorID,
                    decrypted: message.decrypted ? 1 : 0,
                    direction: message.direction,
                    extra: null,
                    forward: message.forward ? 1 : 0,
                    group: message.group ?? null,
                    mailID: message.mailID,
                    message: encryptedMessage,
                    nonce: message.nonce,
                    readerID: message.readerID,
                    recipient: message.recipient,
                    retentionHintDays:
                        message.retentionHintDays === undefined
                            ? null
                            : Math.min(
                                  30,
                                  Math.max(
                                      1,
                                      Math.round(message.retentionHintDays),
                                  ),
                              ),
                    sender: message.sender,
                    timestamp: message.timestamp,
                })
                .execute();
        } catch (err: unknown) {
            if (this.isDuplicateError(err)) {
                // duplicate nonce — ignore
            } else if (this.isClosingNow() || this.isTornDownError(err)) {
                // e.g. WS/mail still saving after `close()` destroyed the driver
            } else {
                throw err;
            }
        }
    }

    async savePreKeys(
        preKeys: UnsavedPreKey[],
        oneTime: boolean,
    ): Promise<PreKeysSQL[]> {
        await this.untilReady();
        if (this.closing) {
            return [];
        }

        const table = oneTime ? ("oneTimeKeys" as const) : ("preKeys" as const);
        const saved: PreKeysSQL[] = [];

        if (!oneTime) {
            await this.db.deleteFrom("preKeys").execute();
        }

        for (const preKey of preKeys) {
            const row = await this.db
                .insertInto(table)
                .values({
                    privateKey: await this.sealHex(
                        XUtils.encodeHex(preKey.keyPair.secretKey),
                    ),
                    publicKey: XUtils.encodeHex(preKey.keyPair.publicKey),
                    signature: XUtils.encodeHex(preKey.signature),
                })
                .returning([
                    "deviceID",
                    "index",
                    "keyID",
                    "publicKey",
                    "signature",
                    "userID",
                ])
                .executeTakeFirstOrThrow();

            saved.push(row);
        }

        return saved;
    }

    // ── Devices ──────────────────────────────────────────────────────────────

    async saveSession(session: SessionSQL): Promise<void> {
        if (this.closing) {
            return;
        }
        const sealedCKr = session.CKr ? await this.sealHex(session.CKr) : null;
        const sealedCKs = session.CKs ? await this.sealHex(session.CKs) : null;
        const sealedDHsPrivate = await this.sealHex(session.DHsPrivate);
        const sealedRK = await this.sealHex(session.RK);
        const sealedSK = await this.sealHex(session.SK);
        try {
            await this.db
                .insertInto("sessions")
                .values({
                    CKr: sealedCKr,
                    CKs: sealedCKs,
                    deviceID: session.deviceID,
                    DHr: session.DHr,
                    DHsPrivate: sealedDHsPrivate,
                    DHsPublic: session.DHsPublic,
                    fingerprint: session.fingerprint,
                    lastUsed: session.lastUsed,
                    mode: session.mode,
                    Nr: session.Nr,
                    Ns: session.Ns,
                    PN: session.PN,
                    publicKey: session.publicKey,
                    RK: sealedRK,
                    sessionID: session.sessionID,
                    SK: sealedSK,
                    skippedKeys: session.skippedKeys,
                    userID: session.userID,
                    verified: session.verified ? 1 : 0,
                })
                .execute();
        } catch (err: unknown) {
            if (this.isDuplicateError(err)) {
                await this.db
                    .updateTable("sessions")
                    .set({
                        CKr: sealedCKr,
                        CKs: sealedCKs,
                        deviceID: session.deviceID,
                        DHr: session.DHr,
                        DHsPrivate: sealedDHsPrivate,
                        DHsPublic: session.DHsPublic,
                        fingerprint: session.fingerprint,
                        lastUsed: session.lastUsed,
                        mode: session.mode,
                        Nr: session.Nr,
                        Ns: session.Ns,
                        PN: session.PN,
                        publicKey: session.publicKey,
                        RK: sealedRK,
                        SK: sealedSK,
                        skippedKeys: session.skippedKeys,
                        userID: session.userID,
                        verified: session.verified ? 1 : 0,
                    })
                    .where("sessionID", "=", session.sessionID)
                    .execute();
            } else {
                throw err;
            }
        }
    }

    async updateMessage(
        mailID: string,
        patch: MessageUpdatePatch,
    ): Promise<boolean> {
        if (this.isClosingNow()) {
            return false;
        }
        await this.untilReady();
        if (
            patch.message === undefined &&
            !Object.prototype.hasOwnProperty.call(patch, "extra")
        ) {
            return false;
        }

        const row = await this.db
            .selectFrom("messages")
            .selectAll()
            .where("mailID", "=", mailID)
            .executeTakeFirst();
        if (!row) {
            return false;
        }

        const current = (await this.decryptMessagesAsync([row]))[0];
        if (!current) {
            return false;
        }
        const next: Message = {
            ...current,
            ...(patch.message !== undefined ? { message: patch.message } : {}),
            ...(Object.prototype.hasOwnProperty.call(patch, "extra")
                ? { extra: patch.extra }
                : {}),
        };
        const storedPlaintext = encodeStoredMessagePlaintext(next);
        const fips = getCryptoProfile() === "fips";
        const ct = fips
            ? await xSecretboxAsync(
                  XUtils.decodeUTF8(storedPlaintext),
                  XUtils.decodeHex(row.nonce),
                  this.atRestAesKey,
              )
            : xSecretbox(
                  XUtils.decodeUTF8(storedPlaintext),
                  XUtils.decodeHex(row.nonce),
                  this.atRestAesKey,
              );
        if (this.isClosingNow()) {
            return false;
        }
        const result = await this.db
            .updateTable("messages")
            .set({
                extra: null,
                message: XUtils.encodeHex(ct),
            })
            .where("mailID", "=", mailID)
            .executeTakeFirst();
        return Number(result.numUpdatedRows) > 0;
    }

    // ── Purge ────────────────────────────────────────────────────────────────

    private async decryptMessagesAsync(
        messages: MessageRow[],
    ): Promise<Message[]> {
        const fips = getCryptoProfile() === "fips";
        const out: Message[] = [];
        let processed = 0;
        /** Yield so RN / web UIs can paint between at-rest decrypt blocks. */
        const yieldToHost = (): Promise<void> =>
            new Promise((resolve) => {
                setTimeout(resolve, 0);
            });
        const yieldEvery = 28;

        for (const msg of messages) {
            const decryptedFlag = msg.decrypted !== 0;
            let plaintext = msg.message;
            if (decryptedFlag) {
                const cipher = XUtils.decodeHex(msg.message);
                const nonce = XUtils.decodeHex(msg.nonce);
                const decrypted = fips
                    ? await xSecretboxOpenAsync(
                          cipher,
                          nonce,
                          this.atRestAesKey,
                      )
                    : xSecretboxOpen(cipher, nonce, this.atRestAesKey);
                if (decrypted) {
                    plaintext = XUtils.encodeUTF8(decrypted);
                } else {
                    throw new Error("Couldn't decrypt messages on disk!");
                }
            }
            const direction =
                msg.direction === "incoming" ? "incoming" : "outgoing";
            const storedPlaintext = decodeStoredMessagePlaintext(
                plaintext,
                msg.extra,
            );
            const rowMessage: Message = {
                authorID: msg.authorID,
                decrypted: decryptedFlag,
                direction,
                forward: msg.forward !== 0,
                group: msg.group,
                mailID: msg.mailID,
                ...storedPlaintext,
                nonce: msg.nonce,
                readerID: msg.readerID,
                recipient: msg.recipient,
                sender: msg.sender,
                timestamp: msg.timestamp,
            };
            if (msg.retentionHintDays != null) {
                rowMessage.retentionHintDays = msg.retentionHintDays;
            }
            out.push(rowMessage);

            processed += 1;
            if (processed % yieldEvery === 0) {
                await yieldToHost();
            }
        }
        return out;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private deviceRowToDevice(row: DeviceRow): Device {
        return {
            deleted: row.deleted !== 0,
            deviceID: row.deviceID,
            lastLogin: row.lastLogin,
            name: row.name,
            owner: row.owner,
            signKey: row.signKey,
        };
    }

    private async ensureMessageExtraColumn(): Promise<void> {
        try {
            await sql
                .raw("ALTER TABLE messages ADD COLUMN extra text")
                .execute(this.db);
        } catch {
            // Existing databases may already have this column.
        }
    }

    /** Speeds up mailID existence checks for saveMessage deduplication. */
    private async ensureMessageMailIdIndex(): Promise<void> {
        try {
            await sql
                .raw(
                    "CREATE INDEX IF NOT EXISTS messages_mailID_idx ON messages(mailID)",
                )
                .execute(this.db);
        } catch {
            // Extremely defensive — `messages` always exists at this point.
        }
    }

    private async ensureRetentionHintColumn(): Promise<void> {
        try {
            await sql
                .raw(
                    "ALTER TABLE messages ADD COLUMN retentionHintDays integer",
                )
                .execute(this.db);
        } catch {
            // Existing databases may already have this column.
        }
    }

    private async ensureSessionRatchetColumns(): Promise<void> {
        const add = async (
            column: string,
            type: "integer" | "text",
            defaultSql: null | string = null,
        ) => {
            const defaultClause = defaultSql ? ` DEFAULT ${defaultSql}` : "";
            try {
                await sql
                    .raw(
                        `ALTER TABLE sessions ADD COLUMN ${column} ${type}${defaultClause}`,
                    )
                    .execute(this.db);
            } catch {
                // Existing databases may already have this column.
            }
        };
        await add("RK", "text");
        await add("DHsPublic", "text");
        await add("DHsPrivate", "text");
        await add("DHr", "text");
        await add("CKs", "text");
        await add("CKr", "text");
        await add("Ns", "integer", "0");
        await add("Nr", "integer", "0");
        await add("PN", "integer", "0");
        await add("skippedKeys", "text", "'{}'");
    }

    /**
     * Read `closing` where TypeScript would incorrectly assume it cannot
     * become true after an earlier guard (e.g. across `await`).
     */
    private isClosingNow(): boolean {
        return this.closing;
    }

    private isDuplicateError(err: unknown): boolean {
        if (err instanceof Error) {
            return err.message.includes("UNIQUE");
        }
        if (typeof err === "object" && err !== null && "errno" in err) {
            return err.errno === 19;
        }
        return false;
    }

    /**
     * After `close` runs, Kysely / better-sqlite3 can reject with this if a
     * message handler is still in flight.
     */
    private isTornDownError(err: unknown): boolean {
        if (err instanceof Error) {
            const m = err.message.toLowerCase();
            return (
                m.includes("driver has already been destroyed") ||
                m.includes("connection is not open") ||
                m.includes("database is closed")
            );
        }
        return false;
    }

    /**
     * Encrypt a hex-encoded secret for at-rest storage.
     * Returns hex(nonce || ciphertext) where nonce is 24 random bytes.
     */
    private async sealHex(plainHex: string): Promise<string> {
        const nonce = xMakeNonce();
        const fips = getCryptoProfile() === "fips";
        const ct = fips
            ? await xSecretboxAsync(
                  XUtils.decodeHex(plainHex),
                  nonce,
                  this.atRestAesKey,
              )
            : xSecretbox(XUtils.decodeHex(plainHex), nonce, this.atRestAesKey);
        const sealed = new Uint8Array(nonce.length + ct.length);
        sealed.set(nonce);
        sealed.set(ct, nonce.length);
        return XUtils.encodeHex(sealed);
    }

    private async sessionRowToSQLAsync(row: SessionRow): Promise<SessionSQL> {
        const rawSK = await this.unsealHex(row.SK);
        const rawRK = row.RK ? await this.unsealHex(row.RK) : rawSK;
        return {
            CKr: row.CKr ? await this.unsealHex(row.CKr) : null,
            CKs: row.CKs ? await this.unsealHex(row.CKs) : null,
            deviceID: row.deviceID,
            DHr: row.DHr,
            DHsPrivate: row.DHsPrivate
                ? await this.unsealHex(row.DHsPrivate)
                : rawSK,
            DHsPublic: row.DHsPublic,
            fingerprint: row.fingerprint,
            lastUsed: row.lastUsed,
            mode: row.mode === "initiator" ? "initiator" : "receiver",
            Nr: row.Nr,
            Ns: row.Ns,
            PN: row.PN,
            publicKey: row.publicKey,
            RK: rawRK,
            sessionID: row.sessionID,
            SK: rawSK,
            skippedKeys: row.skippedKeys,
            userID: row.userID,
            verified: row.verified !== 0,
        };
    }

    private sqlToCrypto(session: SessionSQL): SessionCrypto {
        const skippedKeys = parseSkippedKeysStrict(session.skippedKeys);
        return {
            CKr: session.CKr ? XUtils.decodeHex(session.CKr) : null,
            CKs: session.CKs ? XUtils.decodeHex(session.CKs) : null,
            DHr: session.DHr ? XUtils.decodeHex(session.DHr) : null,
            DHsPrivate: XUtils.decodeHex(session.DHsPrivate),
            DHsPublic: XUtils.decodeHex(session.DHsPublic),
            fingerprint: XUtils.decodeHex(session.fingerprint),
            lastUsed: session.lastUsed,
            mode: session.mode,
            Nr: session.Nr,
            Ns: session.Ns,
            PN: session.PN,
            publicKey: XUtils.decodeHex(session.publicKey),
            RK: XUtils.decodeHex(session.RK),
            sessionID: session.sessionID,
            SK: XUtils.decodeHex(session.SK),
            skippedKeys,
            userID: session.userID,
            verified: session.verified,
        };
    }

    /**
     * Decrypt a value produced by sealHex().
     * Expects hex(nonce || ciphertext), returns the original hex string.
     */
    private async unsealHex(sealed: string): Promise<string> {
        const bytes = XUtils.decodeHex(sealed);
        const nonce = bytes.slice(0, 24);
        const ct = bytes.slice(24);
        const fips = getCryptoProfile() === "fips";
        const plain = fips
            ? await xSecretboxOpenAsync(ct, nonce, this.atRestAesKey)
            : xSecretboxOpen(ct, nonce, this.atRestAesKey);
        if (!plain) {
            throw new Error("Failed to decrypt sealed column value.");
        }
        return XUtils.encodeHex(plain);
    }

    private async untilReady(): Promise<void> {
        if (this.ready) return;
        return new Promise((resolve) => {
            const check = () => {
                if (this.ready) {
                    resolve();
                    return;
                }
                setTimeout(check, 10);
            };
            check();
        });
    }
}

function decodeStoredMessagePlaintext(
    plaintext: string,
    rowExtra: null | string,
): Pick<Message, "extra" | "message"> {
    if (!plaintext.startsWith(STORAGE_MESSAGE_BLOB_PREFIX)) {
        return {
            ...(rowExtra !== null ? { extra: rowExtra } : {}),
            message: plaintext,
        };
    }

    try {
        const raw = JSON.parse(
            plaintext.slice(STORAGE_MESSAGE_BLOB_PREFIX.length),
        ) as unknown;
        if (!isJsonRecord(raw)) {
            return {
                ...(rowExtra !== null ? { extra: rowExtra } : {}),
                message: plaintext,
            };
        }
        const message = raw["message"];
        if (typeof message !== "string") {
            return {
                ...(rowExtra !== null ? { extra: rowExtra } : {}),
                message: plaintext,
            };
        }
        const extra = raw["extra"];
        return {
            ...(extra === null || typeof extra === "string" ? { extra } : {}),
            message,
        };
    } catch {
        return {
            ...(rowExtra !== null ? { extra: rowExtra } : {}),
            message: plaintext,
        };
    }
}

function encodeStoredMessagePlaintext(message: Message): string {
    if (message.extra === undefined) {
        return message.message;
    }
    return (
        STORAGE_MESSAGE_BLOB_PREFIX +
        JSON.stringify({
            extra: message.extra,
            message: message.message,
        })
    );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
