/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Device, User } from "@vex-chat/types";

import { describe, expect, it, vi } from "vitest";

import { CallManager } from "../CallManager.ts";

const caller: User = {
    lastSeen: "2026-06-01T00:00:00.000Z",
    userID: "user-a",
    username: "alice",
};

const recipient: User = {
    lastSeen: "2026-06-01T00:00:00.000Z",
    userID: "user-b",
    username: "bob",
};

const callerDevice: Device = {
    deleted: false,
    deviceID: "device-a",
    lastLogin: "2026-06-01T00:00:00.000Z",
    name: "ios",
    owner: caller.userID,
    signKey: "aa",
};

const recipientDevice: Device = {
    deleted: false,
    deviceID: "device-b",
    lastLogin: "2026-06-01T00:00:00.000Z",
    name: "android",
    owner: recipient.userID,
    signKey: "bb",
};

function harness() {
    const notify = vi.fn();
    const db = {
        retrieveUser: vi.fn((userID: string) =>
            Promise.resolve(userID === recipient.userID ? recipient : null),
        ),
    } as unknown as Database;
    const calls = new CallManager(db, notify);
    return { calls, notify };
}

describe("CallManager", () => {
    it("creates a one-to-one call invite and notifies the recipient", async () => {
        const { calls, notify } = harness();

        const event = await calls.handleResource({
            action: "INVITE",
            actor: { device: callerDevice, user: caller },
            data: {
                conversationType: "dm",
                recipientUserID: recipient.userID,
                signal: {
                    description: { sdp: "offer", type: "offer" },
                    kind: "offer",
                },
            },
            transmissionID: "tx-1",
        });

        expect(event.action).toBe("invite");
        expect(event.call.status).toBe("ringing");
        expect(event.call.participants.map((p) => p.userID)).toEqual([
            caller.userID,
            recipient.userID,
        ]);
        expect(notify).toHaveBeenCalledWith(
            recipient.userID,
            "callInvite",
            "tx-1",
            expect.objectContaining({ action: "invite" }),
        );
        expect(calls.activeCallsForUser(recipient.userID)).toHaveLength(1);
    });

    it("accepts a ringing call and notifies participants", async () => {
        const { calls, notify } = harness();
        const invite = await calls.handleResource({
            action: "INVITE",
            actor: { device: callerDevice, user: caller },
            data: {
                conversationType: "dm",
                recipientUserID: recipient.userID,
            },
            transmissionID: "tx-1",
        });

        const accepted = await calls.handleResource({
            action: "ACCEPT",
            actor: { device: recipientDevice, user: recipient },
            data: {
                callID: invite.call.callID,
                signal: {
                    description: { sdp: "answer", type: "answer" },
                    kind: "answer",
                },
            },
            transmissionID: "tx-2",
        });

        expect(accepted.call.status).toBe("active");
        expect(
            accepted.call.participants.find(
                (p) => p.userID === recipient.userID,
            ),
        ).toMatchObject({
            deviceID: recipientDevice.deviceID,
            state: "accepted",
        });
        expect(notify).toHaveBeenCalledWith(
            caller.userID,
            "call",
            "tx-2",
            expect.objectContaining({ action: "accept" }),
        );
    });

    it("relays ICE candidates only for call participants", async () => {
        const { calls, notify } = harness();
        const invite = await calls.handleResource({
            action: "INVITE",
            actor: { device: callerDevice, user: caller },
            data: {
                conversationType: "dm",
                recipientUserID: recipient.userID,
            },
            transmissionID: "tx-1",
        });

        const ice = await calls.handleResource({
            action: "ICE",
            actor: { device: callerDevice, user: caller },
            data: {
                callID: invite.call.callID,
                signal: {
                    candidate: { candidate: "candidate:1" },
                    kind: "ice",
                },
            },
            transmissionID: "tx-3",
        });

        expect(ice.action).toBe("ice");
        expect(notify).toHaveBeenCalledWith(
            recipient.userID,
            "call",
            "tx-3",
            expect.objectContaining({
                signal: { candidate: expect.anything(), kind: "ice" },
            }),
        );

        await expect(
            calls.handleResource({
                action: "ICE",
                actor: {
                    device: { ...callerDevice, deviceID: "device-c" },
                    user: {
                        lastSeen: "2026-06-01T00:00:00.000Z",
                        userID: "user-c",
                        username: "charlie",
                    },
                },
                data: {
                    callID: invite.call.callID,
                    signal: { candidate: {}, kind: "ice" },
                },
                transmissionID: "tx-4",
            }),
        ).rejects.toThrow("not a participant");
    });

    it("ends a rejected call and removes it from active calls", async () => {
        const { calls } = harness();
        const invite = await calls.handleResource({
            action: "INVITE",
            actor: { device: callerDevice, user: caller },
            data: {
                conversationType: "dm",
                recipientUserID: recipient.userID,
            },
            transmissionID: "tx-1",
        });

        const rejected = await calls.handleResource({
            action: "REJECT",
            actor: { device: recipientDevice, user: recipient },
            data: { callID: invite.call.callID },
            transmissionID: "tx-5",
        });

        expect(rejected.call.status).toBe("ended");
        expect(calls.activeCallsForUser(caller.userID)).toEqual([]);
        expect(calls.activeCallsForUser(recipient.userID)).toEqual([]);
    });
});
