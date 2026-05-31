/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device, User } from "@vex-chat/types";

import { describe, expect, it, vi } from "vitest";

import { msgpack } from "../codec.js";
import { Client, type Message } from "../index.js";

interface SendMailCall {
    device: Device;
    forceFreshSession?: boolean;
    forward: boolean;
    group: null | Uint8Array;
    mailID: null | string;
    msg: Uint8Array;
    user: User;
}

type SendMessage = (
    this: unknown,
    userID: string,
    message: string,
) => Promise<void>;

const now = "2026-05-27T00:00:00.000Z";

function device(deviceID: string, owner: string): Device {
    return {
        deleted: false,
        deviceID,
        lastLogin: now,
        name: deviceID,
        owner,
        signKey: `${deviceID}-sign-key`,
    };
}

function user(userID: string, username: string): User {
    return {
        lastSeen: now,
        userID,
        username,
    };
}

describe("direct message own-device forwarding", () => {
    it("sends a forwarded copy to the sender's other devices", async () => {
        const senderUser = user("user-a", "alice");
        const peerUser = user("user-b", "bob");
        const senderOriginalDevice = device("a-device-1", senderUser.userID);
        const senderCurrentDevice = device("a-device-2", senderUser.userID);
        const peerDevice = device("b-device-1", peerUser.userID);
        const calls: SendMailCall[] = [];

        const fakeClient = {
            fetchUser: vi.fn((userID: string) =>
                Promise.resolve([
                    userID === peerUser.userID ? peerUser : senderUser,
                    null,
                ]),
            ),
            fetchUserDeviceListOnce: vi.fn((userID: string) =>
                Promise.resolve(
                    userID === peerUser.userID
                        ? [peerDevice]
                        : [senderOriginalDevice, senderCurrentDevice],
                ),
            ),
            fetchUserDeviceListWithBackoff: vi.fn((userID: string) =>
                Promise.resolve(
                    userID === peerUser.userID
                        ? [peerDevice]
                        : [senderOriginalDevice, senderCurrentDevice],
                ),
            ),
            forward: Reflect.get(Client.prototype, "forward") as (
                message: Message,
            ) => Promise<void>,
            forwarded: new Set<string>(),
            getDevice: () => senderCurrentDevice,
            getUser: () => senderUser,
            isManualCloseInFlight: () => false,
            sendMailWithRecovery: vi.fn(
                (
                    sentDevice: Device,
                    sentUser: User,
                    msg: Uint8Array,
                    group: null | Uint8Array,
                    mailID: null | string,
                    forward: boolean,
                    forceFreshSession?: boolean,
                ): Promise<Message> => {
                    calls.push({
                        device: sentDevice,
                        forceFreshSession,
                        forward,
                        group,
                        mailID,
                        msg,
                        user: sentUser,
                    });
                    return Promise.resolve({
                        authorID: senderUser.userID,
                        decrypted: true,
                        direction: "outgoing",
                        forward,
                        group: null,
                        mailID: mailID ?? "generated-mail-id",
                        message: forward
                            ? (msgpack.decode(msg) as Message).message
                            : "hello from second device",
                        nonce: `${sentDevice.deviceID}-nonce`,
                        readerID: sentUser.userID,
                        recipient: sentDevice.deviceID,
                        sender: senderCurrentDevice.deviceID,
                        timestamp: now,
                    });
                },
            ),
        };

        const sendMessage = Reflect.get(
            Client.prototype,
            "sendMessage",
        ) as SendMessage;

        await sendMessage.call(
            fakeClient,
            peerUser.userID,
            "hello from second device",
        );

        expect(calls).toHaveLength(2);
        expect(calls[0]).toMatchObject({
            device: peerDevice,
            forceFreshSession: undefined,
            forward: false,
            user: peerUser,
        });
        expect(calls[1]).toMatchObject({
            device: senderOriginalDevice,
            forceFreshSession: true,
            forward: true,
            user: senderUser,
        });
        const forwardedPayload = msgpack.decode(calls[1]!.msg) as Message;
        expect(forwardedPayload).toMatchObject({
            authorID: senderUser.userID,
            direction: "outgoing",
            forward: false,
            message: "hello from second device",
            readerID: peerUser.userID,
            sender: senderCurrentDevice.deviceID,
        });
        expect(forwardedPayload.mailID).toBe(calls[0]!.mailID);
    });

    it("does not fail peer delivery when owned-device forwarding fails", async () => {
        const senderUser = user("user-a", "alice");
        const peerUser = user("user-b", "bob");
        const senderOriginalDevice = device("a-device-1", senderUser.userID);
        const senderCurrentDevice = device("a-device-2", senderUser.userID);
        const peerDevice = device("b-device-1", peerUser.userID);
        const calls: SendMailCall[] = [];

        const fakeClient = {
            fetchUser: vi.fn((userID: string) =>
                Promise.resolve([
                    userID === peerUser.userID ? peerUser : senderUser,
                    null,
                ]),
            ),
            fetchUserDeviceListOnce: vi.fn((userID: string) =>
                Promise.resolve(
                    userID === peerUser.userID
                        ? [peerDevice]
                        : [senderOriginalDevice, senderCurrentDevice],
                ),
            ),
            fetchUserDeviceListWithBackoff: vi.fn((userID: string) =>
                Promise.resolve(
                    userID === peerUser.userID
                        ? [peerDevice]
                        : [senderOriginalDevice, senderCurrentDevice],
                ),
            ),
            forward: Reflect.get(Client.prototype, "forward") as (
                message: Message,
            ) => Promise<void>,
            forwarded: new Set<string>(),
            getDevice: () => senderCurrentDevice,
            getUser: () => senderUser,
            isManualCloseInFlight: () => false,
            sendMailWithRecovery: vi.fn(
                (
                    sentDevice: Device,
                    sentUser: User,
                    msg: Uint8Array,
                    group: null | Uint8Array,
                    mailID: null | string,
                    forward: boolean,
                    forceFreshSession?: boolean,
                ): Promise<Message> => {
                    calls.push({
                        device: sentDevice,
                        forceFreshSession,
                        forward,
                        group,
                        mailID,
                        msg,
                        user: sentUser,
                    });
                    if (forward) {
                        return Promise.reject(
                            new Error(
                                "Failed to load keyBundle for owned device.",
                            ),
                        );
                    }
                    return Promise.resolve({
                        authorID: senderUser.userID,
                        decrypted: true,
                        direction: "outgoing",
                        forward,
                        group: null,
                        mailID: mailID ?? "generated-mail-id",
                        message: "hello from second device",
                        nonce: `${sentDevice.deviceID}-nonce`,
                        readerID: sentUser.userID,
                        recipient: sentDevice.deviceID,
                        sender: senderCurrentDevice.deviceID,
                        timestamp: now,
                    });
                },
            ),
        };

        const sendMessage = Reflect.get(
            Client.prototype,
            "sendMessage",
        ) as SendMessage;

        await expect(
            sendMessage.call(
                fakeClient,
                peerUser.userID,
                "hello from second device",
            ),
        ).resolves.toBeUndefined();

        expect(calls).toHaveLength(2);
        expect(calls[0]).toMatchObject({
            device: peerDevice,
            forceFreshSession: undefined,
            forward: false,
            user: peerUser,
        });
        expect(calls[1]).toMatchObject({
            device: senderOriginalDevice,
            forceFreshSession: true,
            forward: true,
            user: senderUser,
        });
    });
});
