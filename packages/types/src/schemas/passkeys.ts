/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { z } from "zod/v4";

import { datetime } from "./common.js";

// ── Interfaces ──────────────────────────────────────────────────────────────

/**
 * Public-facing passkey record. The credential's public key and
 * algorithm are server-private — clients only need to see the human
 * label and timestamps when listing/deleting.
 */
export interface Passkey {
    createdAt: string;
    lastUsedAt: null | string;
    name: string;
    passkeyID: string;
    /** Hint set returned by the authenticator at registration time. */
    transports: string[];
    userID: string;
}

/**
 * WebAuthn authentication options issued in the `/auth/passkey/begin`
 * handshake. Use `requestID` to bind the assertion in `finish` back
 * to the right server-side challenge.
 */
export interface PasskeyAuthenticationOptions {
    options: PublicKeyCredentialRequestOptionsJSON;
    requestID: string;
}

/**
 * WebAuthn registration options the server hands back to a logged-in
 * device. The shape mirrors `PublicKeyCredentialCreationOptionsJSON`
 * from `@simplewebauthn/types`. `requestID` is a server-side handle
 * that ties the response in `finish` back to the challenge stored
 * in-memory; it never has to be a WebAuthn concept.
 */
export interface PasskeyRegistrationOptions {
    options: PublicKeyCredentialCreationOptionsJSON;
    requestID: string;
}

// ── PublicKeyCredentialJSON shapes (subset of @simplewebauthn/types) ───────
//
// We don't take a runtime dependency on `@simplewebauthn/types` here
// because `@vex-chat/types` ships zero runtime deps. These interfaces
// describe the JSON-friendly forms the libraries on each side
// (browser, server) already speak natively.

export interface PublicKeyCredentialCreationOptionsJSON {
    attestation?: string;
    authenticatorSelection?: {
        authenticatorAttachment?: "cross-platform" | "platform";
        requireResidentKey?: boolean;
        residentKey?: "discouraged" | "preferred" | "required";
        userVerification?: "discouraged" | "preferred" | "required";
    };
    challenge: string;
    excludeCredentials?: PublicKeyCredentialDescriptorJSON[];
    extensions?: Record<string, unknown>;
    pubKeyCredParams: { alg: number; type: "public-key" }[];
    rp: { id?: string; name: string };
    timeout?: number;
    user: { displayName: string; id: string; name: string };
}

export interface PublicKeyCredentialDescriptorJSON {
    id: string;
    transports?: string[];
    type: "public-key";
}

export interface PublicKeyCredentialRequestOptionsJSON {
    allowCredentials?: PublicKeyCredentialDescriptorJSON[];
    challenge: string;
    extensions?: Record<string, unknown>;
    rpId?: string;
    timeout?: number;
    userVerification?: "discouraged" | "preferred" | "required";
}

// ── Schemas ─────────────────────────────────────────────────────────────────

export const PasskeySchema: z.ZodType<Passkey> = z
    .object({
        createdAt: datetime.describe("ISO 8601 creation timestamp"),
        lastUsedAt: datetime
            .nullable()
            .describe("ISO 8601 last-use timestamp, or null"),
        name: z.string().describe("User-supplied passkey label"),
        passkeyID: z.string().describe("Unique passkey identifier"),
        transports: z
            .array(z.string())
            .describe("Authenticator transport hints"),
        userID: z.string().describe("Owning user ID"),
    })
    .describe("Passkey record");

export const PasskeyRegistrationStartPayloadSchema: z.ZodType<{
    name: string;
}> = z
    .object({
        name: z.string().min(1).max(255),
    })
    .describe("Begin passkey registration");

export const PasskeyRegistrationFinishPayloadSchema: z.ZodType<{
    name: string;
    requestID: string;
    response: Record<string, unknown>;
}> = z
    .object({
        name: z.string().min(1).max(255),
        requestID: z.string().min(1),
        // The browser's RegistrationResponseJSON; opaque to spire
        // beyond what @simplewebauthn/server validates.
        response: z.record(z.string(), z.unknown()),
    })
    .describe("Finish passkey registration");

export const PasskeyAuthStartPayloadSchema: z.ZodType<{
    username: string;
}> = z
    .object({
        username: z.string().min(1).max(255),
    })
    .describe("Begin passkey authentication");

export const PasskeyAuthFinishPayloadSchema: z.ZodType<{
    requestID: string;
    response: Record<string, unknown>;
}> = z
    .object({
        requestID: z.string().min(1),
        response: z.record(z.string(), z.unknown()),
    })
    .describe("Finish passkey authentication");
