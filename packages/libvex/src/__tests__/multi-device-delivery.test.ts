/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device, User } from "@vex-chat/types";

import { describe, expect, it, vi } from "vitest";

import { Client } from "../Client.js";

type SendGroupMessage = (
    this: unknown,
    channelID: string,
    message: string,
) => Promise<void>;

type SendMessage = (
    this: unknown,
    userID: string,
    message: string,
) => Promise<void>;

const now = "2026-07-14T00:00:00.000Z";

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
    return { lastSeen: now, userID, username };
}

describe("multi-device delivery", () => {
    it("succeeds when one direct-message recipient device is unavailable", async () => {
        const sender = user("user-a", "alice");
        const recipient = user("user-b", "bob");
        const unavailable = device("device-b-1", recipient.userID);
        const available = device("device-b-2", recipient.userID);
        const sendMailWithRecovery = vi.fn((target: Device) =>
            target === unavailable
                ? Promise.reject(new Error("Device is unavailable."))
                : Promise.resolve(null),
        );
        const fakeClient = {
            fetchUser: vi.fn(() => Promise.resolve([recipient, null])),
            fetchUserDeviceListOnce: vi.fn(() =>
                Promise.resolve([unavailable, available]),
            ),
            fetchUserDeviceListWithBackoff: vi.fn(() =>
                Promise.resolve([unavailable, available]),
            ),
            getUser: () => sender,
            sendMailWithRecovery,
        };
        const sendMessage = Reflect.get(
            Client.prototype,
            "sendMessage",
        ) as SendMessage;

        await expect(
            sendMessage.call(fakeClient, recipient.userID, "hello"),
        ).resolves.toBeUndefined();
        expect(sendMailWithRecovery).toHaveBeenCalledTimes(2);
    });

    it("succeeds when another device for each group recipient receives the message", async () => {
        const sender = user("user-a", "alice");
        const recipient = user("user-b", "bob");
        const ownDevice = device("device-a-1", sender.userID);
        const unavailable = device("device-b-1", recipient.userID);
        const available = device("device-b-2", recipient.userID);
        const sendMailWithRecovery = vi.fn((target: Device) =>
            target === unavailable
                ? Promise.reject(new Error("Device is unavailable."))
                : Promise.resolve(null),
        );
        const fakeClient = {
            fetchUserDeviceListWithBackoff: vi.fn(() =>
                Promise.resolve([ownDevice]),
            ),
            getMultiUserDeviceList: vi.fn(() =>
                Promise.resolve([unavailable, available]),
            ),
            getUser: () => sender,
            getUserList: vi.fn(() => Promise.resolve([sender, recipient])),
            sendMailWithRecovery,
            userRecords: {} as Record<string, User>,
        };
        const sendGroupMessage = Reflect.get(
            Client.prototype,
            "sendGroupMessage",
        ) as SendGroupMessage;

        await expect(
            sendGroupMessage.call(
                fakeClient,
                "1b0a66e2-8275-4f8b-84d5-cb7309d41410",
                "hello channel",
            ),
        ).resolves.toBeUndefined();
        expect(sendMailWithRecovery).toHaveBeenCalledTimes(3);
    });

    it("still fails a group send when a recipient has no successful device delivery", async () => {
        const sender = user("user-a", "alice");
        const recipient = user("user-b", "bob");
        const ownDevice = device("device-a-1", sender.userID);
        const recipientDevice = device("device-b-1", recipient.userID);
        const fakeClient = {
            fetchUserDeviceListWithBackoff: vi.fn(() =>
                Promise.resolve([ownDevice]),
            ),
            getMultiUserDeviceList: vi.fn(() =>
                Promise.resolve([recipientDevice]),
            ),
            getUser: () => sender,
            getUserList: vi.fn(() => Promise.resolve([sender, recipient])),
            sendMailWithRecovery: vi.fn((target: Device) =>
                target === recipientDevice
                    ? Promise.reject(new Error("Recipient is unavailable."))
                    : Promise.resolve(null),
            ),
            userRecords: {} as Record<string, User>,
        };
        const sendGroupMessage = Reflect.get(
            Client.prototype,
            "sendGroupMessage",
        ) as SendGroupMessage;

        await expect(
            sendGroupMessage.call(
                fakeClient,
                "1b0a66e2-8275-4f8b-84d5-cb7309d41410",
                "hello channel",
            ),
        ).rejects.toThrow("Recipient is unavailable.");
    });
});
