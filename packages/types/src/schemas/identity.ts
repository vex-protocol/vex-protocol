/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { z } from "zod/v4";

import { datetime } from "./common.js";

// ── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Identity key database record.
 *
 * @remarks Will move to libvex-js in a future release (SDK-only persistence).
 */
export interface IdentityKeys {
    deviceID: string;
    keyID: string;
    privateKey?: string | undefined;
    publicKey: string;
    userID: string;
}

/**
 * Session database record.
 *
 * @remarks Will move to libvex-js in a future release (SDK-only persistence).
 */
export interface SessionSQL {
    CKr: null | string;
    CKs: null | string;
    deviceID: string;
    DHr: null | string;
    DHsPrivate: string;
    DHsPublic: string;
    fingerprint: string;
    lastUsed: string;
    mode: "initiator" | "receiver";
    Nr: number;
    Ns: number;
    PN: number;
    publicKey: string;
    RK: string;
    sessionID: string;
    SK: string;
    skippedKeys: string;
    userID: string;
    verified: boolean;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

/** Session database record. */
export const SessionSQLSchema: z.ZodType<SessionSQL> = z
    .object({
        CKr: z.string().nullable().describe("Receiving chain key (hex)"),
        CKs: z.string().nullable().describe("Sending chain key (hex)"),
        deviceID: z.string().describe("Device identifier"),
        DHr: z
            .string()
            .nullable()
            .describe("Remote DH ratchet public key (hex)"),
        DHsPrivate: z
            .string()
            .describe("Local DH ratchet private key (hex, sealed at rest)"),
        DHsPublic: z.string().describe("Local DH ratchet public key (hex)"),
        fingerprint: z.string().describe("Session fingerprint"),
        lastUsed: datetime.describe("Last activity timestamp"),
        mode: z.enum(["initiator", "receiver"]).describe("Session role"),
        Nr: z.number().int().nonnegative().describe("Received message number"),
        Ns: z.number().int().nonnegative().describe("Sent message number"),
        PN: z
            .number()
            .int()
            .nonnegative()
            .describe("Previous sending chain length"),
        publicKey: z.string().describe("Remote public key (hex)"),
        RK: z.string().describe("Root key (hex)"),
        sessionID: z.string().describe("Session identifier"),
        SK: z.string().describe("Shared secret key (hex)"),
        skippedKeys: z
            .string()
            .describe("Serialized skipped message keys map (JSON)"),
        userID: z.string().describe("User identifier"),
        verified: z.boolean().describe("Verification status"),
    })
    .describe("Session database record");

/** Identity key database record. */
export const IdentityKeysSchema: z.ZodType<IdentityKeys> = z
    .object({
        deviceID: z.string().describe("Device identifier"),
        keyID: z.string().describe("Key record identifier"),
        privateKey: z.string().optional().describe("Private key (hex)"),
        publicKey: z.string().describe("Public key (hex)"),
        userID: z.string().describe("User identifier"),
    })
    .describe("Identity key database record");
