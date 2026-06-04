/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "./Database.ts";
import type {
    CallAction,
    CallEvent,
    CallResourceData,
    CallSession,
    CallSignalPayload,
    Device,
    User,
} from "@vex-chat/types";

import { CallResourceDataSchema } from "@vex-chat/types";

const CALL_INVITE_TTL_MS = 60_000;
const CALL_MAX_TTL_MS = 2 * 60 * 60 * 1000;

interface Actor {
    device: Device;
    user: User;
}

interface InternalCall {
    session: CallSession;
    timeout?: ReturnType<typeof setTimeout>;
}

type NotifyFn = (
    userID: string,
    event: string,
    transmissionID: string,
    data?: unknown,
    deviceID?: string,
    headlessPushUserID?: string,
) => void;

export class CallManager {
    private readonly calls = new Map<string, InternalCall>();
    private readonly db: Database;
    private readonly notify: NotifyFn;

    constructor(db: Database, notify: NotifyFn) {
        this.db = db;
        this.notify = notify;
    }

    public activeCallsForUser(userID: string): CallSession[] {
        this.pruneExpired();
        const calls: CallSession[] = [];
        for (const call of this.calls.values()) {
            if (
                call.session.status !== "ended" &&
                call.session.participants.some((p) => p.userID === userID)
            ) {
                calls.push(cloneCallSession(call.session));
            }
        }
        return calls;
    }

    public async handleResource(args: {
        action: string;
        actor: Actor;
        data: unknown;
        transmissionID: string;
    }): Promise<CallEvent> {
        this.pruneExpired();
        const action = normalizeAction(args.action);
        const parsed = CallResourceDataSchema.safeParse(args.data);
        if (!parsed.success) {
            throw new Error(
                "Invalid call payload: " + JSON.stringify(parsed.error.issues),
            );
        }

        switch (action) {
            case "accept":
                return this.accept(
                    args.actor,
                    parsed.data,
                    args.transmissionID,
                );
            case "cancel":
            case "hangup":
            case "reject":
                return this.endCall(
                    action,
                    args.actor,
                    parsed.data,
                    args.transmissionID,
                );
            case "ice":
            case "signal":
                return this.signal(
                    action,
                    args.actor,
                    parsed.data,
                    args.transmissionID,
                );
            case "invite":
                return this.invite(
                    args.actor,
                    parsed.data,
                    args.transmissionID,
                );
            case "end":
            case "timeout":
                throw new Error("Call action is server-owned: " + action);
            default:
                action satisfies never;
                throw new Error("Unsupported call action.");
        }
    }

    private accept(
        actor: Actor,
        data: CallResourceData,
        transmissionID: string,
    ): CallEvent {
        const call = this.requireExistingCall(data);
        this.requireParticipant(call.session, actor.user.userID);
        if (call.session.status === "ended") {
            throw new Error("Call has already ended.");
        }

        const now = new Date().toISOString();
        call.session.status = "active";
        call.session.expiresAt = new Date(
            Date.now() + CALL_MAX_TTL_MS,
        ).toISOString();
        call.session.participants = call.session.participants.map((p) =>
            p.userID === actor.user.userID
                ? {
                      ...p,
                      acceptedAt: p.acceptedAt ?? now,
                      deviceID: actor.device.deviceID,
                      joinedAt: p.joinedAt ?? now,
                      state: "accepted",
                  }
                : p,
        );
        this.scheduleExpiry(call, CALL_MAX_TTL_MS);

        const event = this.event("accept", call.session, actor, data.signal);
        this.notifyParticipants(call.session, "call", transmissionID, event);
        return event;
    }

    private clearExpiry(call: InternalCall): void {
        if (call.timeout) {
            clearTimeout(call.timeout);
            delete call.timeout;
        }
    }

    private endCall(
        action: Extract<CallAction, "cancel" | "hangup" | "reject">,
        actor: Actor,
        data: CallResourceData,
        transmissionID: string,
    ): CallEvent {
        const call = this.requireExistingCall(data);
        this.requireParticipant(call.session, actor.user.userID);
        const now = new Date().toISOString();
        call.session.status = "ended";
        call.session.endedAt = now;
        call.session.participants = call.session.participants.map((p) =>
            p.userID === actor.user.userID
                ? {
                      ...p,
                      leftAt: p.leftAt ?? now,
                      state: action === "reject" ? "rejected" : "left",
                  }
                : p,
        );
        this.clearExpiry(call);
        this.calls.delete(call.session.callID);

        const event = this.event(action, call.session, actor, data.signal);
        this.notifyParticipants(call.session, "call", transmissionID, event);
        return event;
    }

    private event(
        action: CallAction,
        session: CallSession,
        actor: Actor,
        signal?: CallSignalPayload,
    ): CallEvent {
        return {
            action,
            call: cloneCallSession(session),
            fromDeviceID: actor.device.deviceID,
            fromUserID: actor.user.userID,
            ...(signal ? { signal } : {}),
        };
    }

    private async invite(
        actor: Actor,
        data: CallResourceData,
        transmissionID: string,
    ): Promise<CallEvent> {
        if (!("conversationType" in data)) {
            throw new Error("Only one-to-one voice calls are supported.");
        }
        const recipient = await this.db.retrieveUser(data.recipientUserID);
        if (!recipient) {
            throw new Error("Call recipient not found.");
        }

        const now = new Date();
        const call: InternalCall = {
            session: {
                callID: crypto.randomUUID(),
                conversationID: recipient.userID,
                conversationType: "dm",
                createdAt: now.toISOString(),
                createdBy: actor.user.userID,
                createdByDeviceID: actor.device.deviceID,
                expiresAt: new Date(
                    now.getTime() + CALL_INVITE_TTL_MS,
                ).toISOString(),
                media: "audio",
                participants: [
                    {
                        acceptedAt: now.toISOString(),
                        deviceID: actor.device.deviceID,
                        joinedAt: now.toISOString(),
                        state: "accepted",
                        userID: actor.user.userID,
                    },
                    {
                        state: "ringing",
                        userID: recipient.userID,
                    },
                ],
                status: "ringing",
            },
        };
        this.calls.set(call.session.callID, call);
        this.scheduleExpiry(call, CALL_INVITE_TTL_MS);

        const event = this.event("invite", call.session, actor, data.signal);
        this.notify(recipient.userID, "callInvite", transmissionID, event);
        return event;
    }

    private notifyParticipants(
        session: CallSession,
        event: string,
        transmissionID: string,
        data: CallEvent,
    ): void {
        for (const userID of new Set(
            session.participants.map((p) => p.userID),
        )) {
            this.notify(userID, event, transmissionID, data);
        }
    }

    private pruneExpired(): void {
        const now = Date.now();
        for (const call of [...this.calls.values()]) {
            if (Date.parse(call.session.expiresAt) <= now) {
                this.timeout(call);
            }
        }
    }

    private requireExistingCall(data: CallResourceData): InternalCall {
        if (!("callID" in data)) {
            throw new Error("callID is required for this action.");
        }
        const call = this.calls.get(data.callID);
        if (!call) {
            throw new Error("Call not found.");
        }
        return call;
    }

    private requireParticipant(session: CallSession, userID: string): void {
        if (!session.participants.some((p) => p.userID === userID)) {
            throw new Error("You are not a participant in this call.");
        }
    }

    private scheduleExpiry(call: InternalCall, ttlMs: number): void {
        this.clearExpiry(call);
        call.timeout = setTimeout(() => {
            this.timeout(call);
        }, ttlMs);
        call.timeout.unref();
    }

    private signal(
        action: Extract<CallAction, "ice" | "signal">,
        actor: Actor,
        data: CallResourceData,
        transmissionID: string,
    ): CallEvent {
        const call = this.requireExistingCall(data);
        this.requireParticipant(call.session, actor.user.userID);
        if (!("signal" in data) || !data.signal) {
            throw new Error("signal is required.");
        }
        const event = this.event(action, call.session, actor, data.signal);
        this.notifyParticipants(call.session, "call", transmissionID, event);
        return event;
    }

    private timeout(call: InternalCall): void {
        if (!this.calls.has(call.session.callID)) {
            return;
        }
        const now = new Date().toISOString();
        call.session.status = "ended";
        call.session.endedAt = now;
        call.session.participants = call.session.participants.map((p) =>
            p.state === "ringing" ? { ...p, leftAt: now, state: "left" } : p,
        );
        this.calls.delete(call.session.callID);
        this.clearExpiry(call);
        const event: CallEvent = {
            action: "timeout",
            call: cloneCallSession(call.session),
            fromDeviceID: call.session.createdByDeviceID,
            fromUserID: call.session.createdBy,
        };
        this.notifyParticipants(
            call.session,
            "call",
            crypto.randomUUID(),
            event,
        );
    }
}

function cloneCallSession(session: CallSession): CallSession {
    return {
        ...session,
        participants: session.participants.map((p) => ({ ...p })),
    };
}

function normalizeAction(action: string): CallAction {
    switch (action.toLowerCase()) {
        case "accept":
            return "accept";
        case "cancel":
            return "cancel";
        case "hangup":
            return "hangup";
        case "ice":
            return "ice";
        case "invite":
            return "invite";
        case "reject":
            return "reject";
        case "signal":
            return "signal";
        default:
            throw new Error("Unsupported call action: " + action);
    }
}
