import { z } from "zod/v4";

import { uint8 } from "./common.js";

/** WebSocket authentication error codes. */
export const SocketAuthErrors: {
    readonly BadSignature: 0;
    readonly InvalidToken: 1;
    readonly UserNotRegistered: 2;
} = {
    BadSignature: 0,
    InvalidToken: 1,
    UserNotRegistered: 2,
} as const;
export type SocketAuthErrors =
    (typeof SocketAuthErrors)[keyof typeof SocketAuthErrors];

/** Mail type: initial (X3DH) or subsequent (ratchet). */
export const MailType: {
    readonly initial: 0;
    readonly subsequent: 1;
} = {
    initial: 0,
    subsequent: 1,
} as const;
/** Authorization confirmation. */
export interface AuthorizedMsg extends BaseMsg {
    type: "authorized";
}

// ── Interfaces ──────────────────────────────────────────────────────────────

/** Base WebSocket message. */
export interface BaseMsg {
    transmissionID: string;
    type: string;
}

/** Auth challenge. */
export interface ChallMsg extends BaseMsg {
    challenge: Uint8Array;
    type: "challenge";
}

/** Messages the client sends to the server. */
export type ClientMessage =
    | PingMsg
    | PongMsg
    | ReceiptMsg
    | ResourceMsg
    | RespMsg;

/** Error response. */
export interface ErrMsg extends BaseMsg {
    data?: unknown;
    error: string;
    type: "error";
}

export type MailType = (typeof MailType)[keyof typeof MailType];

/** Server notification. */
export interface NotifyMsg extends BaseMsg {
    data?: unknown;
    event: string;
    type: "notify";
}

/** Ping message. */
export interface PingMsg extends BaseMsg {
    type: "ping";
}

/** Pong message. */
export interface PongMsg extends BaseMsg {
    type: "pong";
}

/** Mail receipt acknowledgment. */
export interface ReceiptMsg extends BaseMsg {
    nonce: Uint8Array;
    type: "receipt";
}

/** Resource CRUD message. */
export interface ResourceMsg extends BaseMsg {
    action: string;
    data?: unknown;
    resourceType: string;
    type: "resource";
}

/** Auth response. */
export interface RespMsg extends BaseMsg {
    signed: Uint8Array;
    type: "response";
}

/** Success response. */
export interface SuccessMsg extends BaseMsg {
    data: unknown;
    timestamp?: string | undefined;
    type: "success";
}

/** Authorization failure. */
export interface UnauthorizedMsg extends BaseMsg {
    type: "unauthorized";
}

/** Discriminated union of all WebSocket message types. */
export type WSMessage =
    | AuthorizedMsg
    | ChallMsg
    | ErrMsg
    | NotifyMsg
    | PingMsg
    | PongMsg
    | ReceiptMsg
    | ResourceMsg
    | RespMsg
    | SuccessMsg
    | UnauthorizedMsg;

// ── Schemas ─────────────────────────────────────────────────────────────────

const _baseMsgSchema = z.object({
    transmissionID: z.string().describe("Unique transmission identifier"),
    type: z.string().describe("Message type discriminator"),
});

/** Base WebSocket message. */
export const BaseMsgSchema: z.ZodType<BaseMsg> = _baseMsgSchema.describe(
    "Base WebSocket message",
);

const _successMsgSchema = _baseMsgSchema.extend({
    data: z.unknown().describe("Response payload"),
    timestamp: z.string().optional().describe("Server timestamp"),
    type: z.literal("success"),
});
/** Success response message. */
export const SuccessMsgSchema: z.ZodType<SuccessMsg> = _successMsgSchema;

const _errMsgSchema = _baseMsgSchema.extend({
    data: z.unknown().optional().describe("Error context"),
    error: z.string().describe("Error message"),
    type: z.literal("error"),
});
/** Error response message. */
export const ErrMsgSchema: z.ZodType<ErrMsg> = _errMsgSchema;

const _challMsgSchema = _baseMsgSchema.extend({
    challenge: uint8.describe("Challenge nonce bytes"),
    type: z.literal("challenge"),
});
/** Authentication challenge. */
export const ChallMsgSchema: z.ZodType<ChallMsg> = _challMsgSchema;

const _respMsgSchema = _baseMsgSchema.extend({
    signed: uint8.describe("Signed response bytes"),
    type: z.literal("response"),
});
/** Authentication response. */
export const RespMsgSchema: z.ZodType<RespMsg> = _respMsgSchema;

const _receiptMsgSchema = _baseMsgSchema.extend({
    nonce: uint8.describe("Mail nonce being acknowledged"),
    type: z.literal("receipt"),
});
/** Mail receipt. */
export const ReceiptMsgSchema: z.ZodType<ReceiptMsg> = _receiptMsgSchema;

const _resourceMsgSchema = _baseMsgSchema.extend({
    action: z.string().describe("CRUD action"),
    data: z.unknown().optional().describe("Resource payload"),
    resourceType: z.string().describe("Resource type"),
    type: z.literal("resource"),
});
/** Resource operation message. */
export const ResourceMsgSchema: z.ZodType<ResourceMsg> = _resourceMsgSchema;

const _notifyMsgSchema = _baseMsgSchema.extend({
    data: z.unknown().optional().describe("Event payload"),
    event: z.string().describe("Notification event type"),
    type: z.literal("notify"),
});
/** Server notification. */
export const NotifyMsgSchema: z.ZodType<NotifyMsg> = _notifyMsgSchema;

const _pingMsgSchema = _baseMsgSchema.extend({
    type: z.literal("ping"),
});
/** Ping message. */
export const PingMsgSchema: z.ZodType<PingMsg> = _pingMsgSchema;

const _pongMsgSchema = _baseMsgSchema.extend({
    type: z.literal("pong"),
});
/** Pong message. */
export const PongMsgSchema: z.ZodType<PongMsg> = _pongMsgSchema;

const _authorizedMsgSchema = _baseMsgSchema.extend({
    type: z.literal("authorized"),
});
/** Authorization confirmation. */
export const AuthorizedMsgSchema: z.ZodType<AuthorizedMsg> =
    _authorizedMsgSchema;

const _unauthorizedMsgSchema = _baseMsgSchema.extend({
    type: z.literal("unauthorized"),
});
/** Authorization failure. */
export const UnauthorizedMsgSchema: z.ZodType<UnauthorizedMsg> =
    _unauthorizedMsgSchema;

/** Discriminated union of all WebSocket message types. */
export const WSMessageSchema: z.ZodType<WSMessage> = z.discriminatedUnion(
    "type",
    [
        _authorizedMsgSchema,
        _challMsgSchema,
        _errMsgSchema,
        _notifyMsgSchema,
        _pingMsgSchema,
        _pongMsgSchema,
        _receiptMsgSchema,
        _resourceMsgSchema,
        _respMsgSchema,
        _successMsgSchema,
        _unauthorizedMsgSchema,
    ],
);
