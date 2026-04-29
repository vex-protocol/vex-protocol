import { z } from "zod/v4";

import { uint8 } from "./common.js";

// ── Interfaces ──────────────────────────────────────────────────────────────

/** Custom server emoji. */
export interface Emoji {
    emojiID: string;
    name: string;
    owner: string;
}

/** File upload payload (HTTP). */
export interface FilePayload {
    file?: string | undefined;
    nonce: string;
    owner: string;
    signed: string;
}

/** File response with metadata and data. */
export interface FileResponse {
    data: Uint8Array;
    details: FileSQL;
}

/** File database record. */
export interface FileSQL {
    fileID: string;
    nonce: string;
    owner: string;
}

// ── Schemas ─────────────────────────────────────────────────────────────────

/** File upload payload (HTTP). */
export const FilePayloadSchema: z.ZodType<FilePayload> = z
    .object({
        file: z.string().optional().describe("Optional file ID for updates"),
        nonce: z.string().describe("Encryption nonce (hex)"),
        owner: z.string().describe("File owner user ID"),
        signed: z.string().describe("Signed file data"),
    })
    .describe("File upload payload");

const _fileSQLSchema = z.object({
    fileID: z.string().describe("File identifier"),
    nonce: z.string().describe("Unique nonce identifier"),
    owner: z.string().describe("File owner user ID"),
});

/** File database record. */
export const FileSQLSchema: z.ZodType<FileSQL> = _fileSQLSchema.describe(
    "File database record",
);

/** File response with metadata and data. */
export const FileResponseSchema: z.ZodType<FileResponse> = z
    .object({
        data: uint8.describe("File binary data"),
        details: _fileSQLSchema.describe("File metadata"),
    })
    .describe("File response with metadata");

/** Custom server emoji. */
export const EmojiSchema: z.ZodType<Emoji> = z
    .object({
        emojiID: z.string().describe("Emoji identifier"),
        name: z.string().describe("Emoji display name"),
        owner: z.string().describe("Server ID that owns this emoji"),
    })
    .describe("Custom server emoji");
