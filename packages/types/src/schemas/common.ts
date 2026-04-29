import { z } from "zod/v4";

/**
 * Uint8Array schema. Uses `z.custom` instead of `z.instanceof` because
 * `z.instanceof(Uint8Array)` infers `Uint8Array<ArrayBuffer>`, which is
 * not assignable to the default `Uint8Array<ArrayBufferLike>` used by
 * the interfaces (TS 6's strict generic inference).
 */
export const uint8: z.ZodType<Uint8Array> = z.custom<Uint8Array>(
    (val) => val instanceof Uint8Array,
);

/**
 * ISO 8601 datetime string. Used for all timestamp fields on the wire.
 * No Date objects — strings everywhere, apps convert for display.
 */
export const datetime: z.ZodType<string> = z
    .string()
    .describe("ISO 8601 datetime");

/** Scoped token types for action tokens. */
export const TokenScopes: {
    readonly Avatar: 2;
    readonly Connect: 6;
    readonly Device: 3;
    readonly Emoji: 5;
    readonly File: 1;
    readonly Invite: 4;
    readonly Register: 0;
} = {
    Avatar: 2,
    Connect: 6,
    Device: 3,
    Emoji: 5,
    File: 1,
    Invite: 4,
    Register: 0,
} as const;
/** Action token for scoped operations with TTL. */
export interface ActionToken {
    key: string;
    scope: TokenScopes;
    time: string;
}

// ── Interfaces ──────────────────────────────────────────────────────────────

export type TokenScopes = (typeof TokenScopes)[keyof typeof TokenScopes];

// ── Schemas ─────────────────────────────────────────────────────────────────

/** Action token for scoped operations with TTL. */
export const ActionTokenSchema: z.ZodType<ActionToken> = z
    .object({
        key: z.string().describe("Token value"),
        scope: z
            .union([
                z.literal(0),
                z.literal(1),
                z.literal(2),
                z.literal(3),
                z.literal(4),
                z.literal(5),
                z.literal(6),
            ])
            .describe("Token scope"),
        time: datetime.describe("Token creation time"),
    })
    .describe("Scoped action token with TTL");
