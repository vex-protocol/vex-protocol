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
    deviceID: string;
    fingerprint: string;
    lastUsed: string;
    mode: "initiator" | "receiver";
    publicKey: string;
    sessionID: string;
    SK: string;
    userID: string;
    verified: boolean;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

/** Session database record. */
export const SessionSQLSchema: z.ZodType<SessionSQL> = z
    .object({
        deviceID: z.string().describe("Device identifier"),
        fingerprint: z.string().describe("Session fingerprint"),
        lastUsed: datetime.describe("Last activity timestamp"),
        mode: z.enum(["initiator", "receiver"]).describe("Session role"),
        publicKey: z.string().describe("Remote public key (hex)"),
        sessionID: z.string().describe("Session identifier"),
        SK: z.string().describe("Shared secret key (hex)"),
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
