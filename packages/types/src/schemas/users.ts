import { z } from "zod/v4";

import { datetime } from "./common.js";

// ── Interfaces ──────────────────────────────────────────────────────────────

/** Device record for multi-device support. */
export interface Device {
    deleted: boolean;
    deviceID: string;
    lastLogin: string;
    name: string;
    owner: string;
    signKey: string;
}

/** Device registration payload (HTTP). */
export interface DevicePayload {
    deviceName: string;
    preKey: string;
    preKeyIndex: number;
    preKeySignature: string;
    signed: string;
    signKey: string;
    username: string;
}

/** User registration payload (HTTP). */
export interface RegistrationPayload extends DevicePayload {
    password: string;
}

/** Public user profile. */
export interface User {
    lastSeen: string;
    userID: string;
    username: string;
}

/** Database user record with auth fields. */
export interface UserRecord extends User {
    passwordHash: string;
    passwordSalt: string;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

const _userSchema = z.object({
    lastSeen: datetime.describe("Last activity timestamp"),
    userID: z.string().describe("Unique user identifier"),
    username: z.string().describe("Display username"),
});

/** Public user profile. */
export const UserSchema: z.ZodType<User> = _userSchema.describe(
    "Public user profile",
);

/** Database user record with password hash. */
export const UserRecordSchema: z.ZodType<UserRecord> = _userSchema
    .extend({
        passwordHash: z.string().describe("PBKDF2-SHA512 password hash"),
        passwordSalt: z.string().describe("Password salt"),
    })
    .describe("Database user record with password hash");

/** Device registration record. */
export const DeviceSchema: z.ZodType<Device> = z
    .object({
        deleted: z.boolean().describe("Soft-delete flag"),
        deviceID: z.string().describe("Unique device identifier"),
        lastLogin: z.string().describe("Last login timestamp"),
        name: z.string().describe("Device display name"),
        owner: z.string().describe("Owner user ID"),
        signKey: z.string().describe("Ed25519 signing public key (hex)"),
    })
    .describe("Device registration record");

const _devicePayloadSchema = z.object({
    deviceName: z.string().describe("Device display name"),
    preKey: z.string().describe("Pre-key public key (hex)"),
    preKeyIndex: z.number().describe("Pre-key index"),
    preKeySignature: z.string().describe("Pre-key signature (hex)"),
    signed: z.string().describe("Signed registration data"),
    signKey: z.string().describe("Ed25519 public signing key (hex)"),
    username: z.string().describe("Account username"),
});

/** Device registration payload. */
export const DevicePayloadSchema: z.ZodType<DevicePayload> =
    _devicePayloadSchema.describe("Device registration payload");

/** User registration payload. */
export const RegistrationPayloadSchema: z.ZodType<RegistrationPayload> =
    _devicePayloadSchema
        .extend({
            password: z.string().describe("Account password"),
        })
        .describe("User registration payload");
