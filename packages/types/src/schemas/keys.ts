import type { MailType } from "./messages.js";

import { z } from "zod/v4";

import { datetime, uint8 } from "./common.js";

// ── Interfaces ──────────────────────────────────────────────────────────────

/** X3DH key bundle for session establishment. */
export interface KeyBundle {
    otk?: KeyBundleEntry | undefined;
    preKey: KeyBundleEntry;
    signKey: Uint8Array;
}

/** Key bundle entry (shared shape for OTK and pre-key). */
export interface KeyBundleEntry {
    deviceID: string;
    index: null | number;
    publicKey: Uint8Array;
    signature: Uint8Array;
}

/** Mail message (SQL/database format). */
export interface MailSQL {
    authorID: string;
    cipher: string;
    extra: string;
    forward: boolean;
    group: null | string;
    header: string;
    mailID: string;
    mailType: MailType;
    nonce: string;
    readerID: string;
    recipient: string;
    sender: string;
    time: string;
}

/** Encrypted mail message (WebSocket format). */
export interface MailWS {
    authorID: string;
    cipher: Uint8Array;
    extra: Uint8Array;
    forward: boolean;
    group: null | Uint8Array;
    mailID: string;
    mailType: MailType;
    nonce: Uint8Array;
    readerID: string;
    recipient: string;
    sender: string;
}

/** Pre-key database record (shared — used by both spire and libvex). */
export interface PreKeysSQL {
    deviceID: string;
    index: null | number;
    keyID: string;
    privateKey?: string | undefined;
    publicKey: string;
    signature: string;
    userID: string;
}

/** WebSocket pre-key payload. */
export type PreKeysWS = KeyBundleEntry;

// ── Schemas ─────────────────────────────────────────────────────────────────

const keyBundleEntry = z.object({
    deviceID: z.string().describe("Device identifier"),
    index: z.number().nullable().describe("Key index"),
    publicKey: uint8.describe("Public key (bytes)"),
    signature: uint8.describe("Signature (bytes)"),
});

/** X3DH key bundle for session establishment. */
export const KeyBundleSchema: z.ZodType<KeyBundle> = z
    .object({
        otk: keyBundleEntry
            .optional()
            .describe("One-time key (consumed after use)"),
        preKey: keyBundleEntry.describe("Signed pre-key"),
        signKey: uint8.describe("Ed25519 signing public key"),
    })
    .describe("X3DH key bundle for session establishment");

/** WebSocket pre-key payload. */
export const PreKeysWSSchema: z.ZodType<PreKeysWS> = z
    .object({
        deviceID: z.string().describe("Device identifier"),
        index: z.number().nullable().describe("Pre-key index"),
        publicKey: uint8.describe("Pre-key public key (bytes)"),
        signature: uint8.describe("Pre-key signature (bytes)"),
    })
    .describe("WebSocket pre-key payload");

/** Pre-key database record (shared — used by both spire and libvex). */
export const PreKeysSQLSchema: z.ZodType<PreKeysSQL> = z
    .object({
        deviceID: z.string().describe("Device identifier"),
        index: z.number().nullable().describe("Key index"),
        keyID: z.string().describe("Key record identifier"),
        privateKey: z.string().optional().describe("Private key (hex)"),
        publicKey: z.string().describe("Public key (hex)"),
        signature: z.string().describe("Signature (hex)"),
        userID: z.string().describe("Owner user ID"),
    })
    .describe("Pre-key database record");

/** Encrypted mail message (WebSocket format). */
export const MailWSSchema: z.ZodType<MailWS> = z
    .object({
        authorID: z.string().describe("Original author user ID"),
        cipher: uint8.describe("Encrypted message content"),
        extra: uint8.describe("Extra metadata"),
        forward: z.boolean().describe("Whether this is a multi-device forward"),
        group: uint8.nullable().describe("Channel ID for group messages"),
        mailID: z.string().describe("Unique mail identifier"),
        mailType: z
            .union([z.literal(0), z.literal(1)])
            .describe("Mail type (0=initial, 1=subsequent)"),
        nonce: uint8.describe("Encryption nonce"),
        readerID: z.string().describe("Intended reader user ID"),
        recipient: z.string().describe("Recipient device ID"),
        sender: z.string().describe("Sender device ID"),
    })
    .describe("Encrypted mail message");

/** Mail message (SQL/database format). */
export const MailSQLSchema: z.ZodType<MailSQL> = z
    .object({
        authorID: z.string().describe("Original author user ID"),
        cipher: z.string().describe("Encrypted content (hex)"),
        extra: z.string().describe("Extra metadata (hex)"),
        forward: z.boolean().describe("Multi-device forward flag"),
        group: z.string().nullable().describe("Channel ID for group messages"),
        header: z.string().describe("Message header (hex)"),
        mailID: z.string().describe("Mail identifier"),
        mailType: z.union([z.literal(0), z.literal(1)]).describe("Mail type"),
        nonce: z.string().describe("Encryption nonce (hex)"),
        readerID: z.string().describe("Intended reader user ID"),
        recipient: z.string().describe("Recipient device ID"),
        sender: z.string().describe("Sender device ID"),
        time: datetime.describe("Server timestamp"),
    })
    .describe("Mail database record");
