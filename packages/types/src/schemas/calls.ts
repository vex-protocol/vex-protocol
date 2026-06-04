/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { z } from "zod/v4";

export type CallAction =
    | "accept"
    | "cancel"
    | "end"
    | "hangup"
    | "ice"
    | "invite"
    | "reject"
    | "signal"
    | "timeout";

export type CallConversationType = "channel" | "dm";

export interface CallEvent {
    action: CallAction;
    call: CallSession;
    fromDeviceID: string;
    fromUserID: string;
    signal?: CallSignalPayload | undefined;
}

export interface CallParticipant {
    acceptedAt?: string | undefined;
    deviceID?: string | undefined;
    joinedAt?: string | undefined;
    leftAt?: string | undefined;
    state: "accepted" | "invited" | "left" | "rejected" | "ringing";
    userID: string;
}

export type CallResourceData =
    | {
          callID: string;
          signal?: CallSignalPayload | undefined;
      }
    | {
          conversationType: "dm";
          recipientUserID: string;
          signal?: CallSignalPayload | undefined;
      };

export interface CallSession {
    callID: string;
    conversationID: string;
    conversationType: CallConversationType;
    createdAt: string;
    createdBy: string;
    createdByDeviceID: string;
    endedAt?: string | undefined;
    expiresAt: string;
    media: "audio";
    participants: CallParticipant[];
    status: "active" | "ended" | "ringing";
}

export type CallSignalKind = "answer" | "ice" | "offer" | "renegotiate";

export interface CallSignalPayload {
    candidate?: unknown;
    description?: unknown;
    kind: CallSignalKind;
}

export interface IceServerConfig {
    credential?: string | undefined;
    urls: string | string[];
    username?: string | undefined;
}

export const CallActionSchema: z.ZodType<CallAction> = z.union([
    z.literal("accept"),
    z.literal("cancel"),
    z.literal("end"),
    z.literal("hangup"),
    z.literal("ice"),
    z.literal("invite"),
    z.literal("reject"),
    z.literal("signal"),
    z.literal("timeout"),
]);

export const CallParticipantSchema: z.ZodType<CallParticipant> = z.object({
    acceptedAt: z.string().optional(),
    deviceID: z.string().optional(),
    joinedAt: z.string().optional(),
    leftAt: z.string().optional(),
    state: z.union([
        z.literal("accepted"),
        z.literal("invited"),
        z.literal("left"),
        z.literal("rejected"),
        z.literal("ringing"),
    ]),
    userID: z.string(),
});

export const CallSessionSchema: z.ZodType<CallSession> = z.object({
    callID: z.string(),
    conversationID: z.string(),
    conversationType: z.union([z.literal("channel"), z.literal("dm")]),
    createdAt: z.string(),
    createdBy: z.string(),
    createdByDeviceID: z.string(),
    endedAt: z.string().optional(),
    expiresAt: z.string(),
    media: z.literal("audio"),
    participants: z.array(CallParticipantSchema),
    status: z.union([
        z.literal("active"),
        z.literal("ended"),
        z.literal("ringing"),
    ]),
});

export const CallSignalPayloadSchema: z.ZodType<CallSignalPayload> = z.object({
    candidate: z.unknown().optional(),
    description: z.unknown().optional(),
    kind: z.union([
        z.literal("answer"),
        z.literal("ice"),
        z.literal("offer"),
        z.literal("renegotiate"),
    ]),
});

export const CallResourceDataSchema: z.ZodType<CallResourceData> = z.union([
    z.object({
        conversationType: z.literal("dm"),
        recipientUserID: z.string(),
        signal: CallSignalPayloadSchema.optional(),
    }),
    z.object({
        callID: z.string(),
        signal: CallSignalPayloadSchema.optional(),
    }),
]);

export const CallEventSchema: z.ZodType<CallEvent> = z.object({
    action: CallActionSchema,
    call: CallSessionSchema,
    fromDeviceID: z.string(),
    fromUserID: z.string(),
    signal: CallSignalPayloadSchema.optional(),
});

export const IceServerConfigSchema: z.ZodType<IceServerConfig> = z.object({
    credential: z.string().optional(),
    urls: z.union([z.string(), z.array(z.string())]),
    username: z.string().optional(),
});
