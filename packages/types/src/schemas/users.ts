/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { z } from "zod/v4";

import { datetime } from "./common.js";

/** Minimum length accepted for a new account password. */
export const ACCOUNT_PASSWORD_MIN_LENGTH = 15;
/** Maximum length accepted for account-password input. */
export const ACCOUNT_PASSWORD_MAX_LENGTH = 1024;

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
    username?: string | undefined;
}

/** Password replacement after current-password or passkey proof. */
export interface PasswordUpdatePayload {
    /** Existing password required for an approved-device session. */
    currentPassword?: string | undefined;
    /** Replacement account password. */
    newPassword: string;
}

/** User registration payload (HTTP). */
export interface RegistrationPayload extends DevicePayload {
    intent: "create-account" | "enroll-device";
    /** Required for new accounts and existing-account device approval requests unless passkey-authorized. */
    password?: string | undefined;
    username: string;
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
        passwordHash: z.string().describe("Encoded Argon2id password hash"),
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
    username: z.string().optional().describe("Account username"),
});

/** Device registration payload. */
export const DevicePayloadSchema: z.ZodType<DevicePayload> =
    _devicePayloadSchema.describe("Device registration payload");

/** Password replacement payload. */
export const PasswordUpdatePayloadSchema: z.ZodType<PasswordUpdatePayload> = z
    .object({
        currentPassword: z
            .string()
            .min(1)
            .max(ACCOUNT_PASSWORD_MAX_LENGTH)
            .optional(),
        newPassword: z
            .string()
            .min(ACCOUNT_PASSWORD_MIN_LENGTH)
            .max(ACCOUNT_PASSWORD_MAX_LENGTH),
    })
    .strict()
    .describe("Password replacement payload");

/** User registration payload. */
export const RegistrationPayloadSchema: z.ZodType<RegistrationPayload> =
    _devicePayloadSchema
        .extend({
            intent: z
                .enum(["create-account", "enroll-device"])
                .describe(
                    "Explicit account creation or device enrollment intent",
                ),
            password: z
                .string()
                .min(ACCOUNT_PASSWORD_MIN_LENGTH)
                .max(ACCOUNT_PASSWORD_MAX_LENGTH)
                .optional()
                .describe(
                    "Account password. Required for new accounts and for existing-account device approval requests unless the request is authorized by passkey.",
                ),
            username: z.string().describe("Account username"),
        })
        .describe("User registration payload");
