/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientManager } from "../ClientManager.ts";
import type { Database, NotificationSubscription } from "../Database.ts";
import type { BaseMsg } from "@vex-chat/types";

import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationService } from "../NotificationService.ts";

interface FakeClient {
    getDeviceID: () => null | string;
    getUserID: () => null | string;
    hasFailed: () => boolean;
    send: (msg: BaseMsg) => void;
}

const subscription: NotificationSubscription = {
    channel: "expo",
    createdAt: "2026-05-12T00:00:00.000Z",
    deviceID: "device-b",
    enabled: true,
    events: ["mail"],
    platform: "android",
    subscriptionID: "sub-b",
    token: "ExponentPushToken[test]",
    updatedAt: "2026-05-12T00:00:00.000Z",
    userID: "user-b",
};

function createSpireHarness(
    clients: FakeClient[],
    subscriptions: NotificationSubscription[] = [],
    removeNotificationSubscription = vi.fn(() => Promise.resolve(true)),
) {
    const db = {
        removeNotificationSubscription,
        retrieveNotificationSubscriptions: vi.fn(() =>
            Promise.resolve(subscriptions),
        ),
    } as unknown as Database;
    const managers = clients as unknown as ClientManager[];
    const removeClient = (client: ClientManager) => {
        const idx = managers.indexOf(client);
        if (idx >= 0) managers.splice(idx, 1);
    };
    const notifications = new NotificationService(db, managers, removeClient);
    return {
        clients: managers,
        db,
        notifications,
        removeNotificationSubscription,
    };
}

function fakeClient(overrides: Partial<FakeClient> = {}): FakeClient {
    return {
        getDeviceID: vi.fn(() => "device-a"),
        getUserID: vi.fn(() => "user-a"),
        hasFailed: vi.fn(() => false),
        send: vi.fn(),
        ...overrides,
    };
}

function pendingReceiptCount(service: NotificationService): number {
    return (
        service as unknown as {
            pendingReceipts: Map<string, unknown>;
        }
    ).pendingReceipts.size;
}

describe("Spire notify fanout", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it("continues device fanout after pruning a stale client", () => {
        const stale = fakeClient({
            getDeviceID: vi.fn(() => null),
        });
        const recipient = fakeClient({
            getDeviceID: vi.fn(() => "device-b"),
        });
        const other = fakeClient({
            getDeviceID: vi.fn(() => "device-c"),
        });
        const { clients, notifications } = createSpireHarness([
            stale,
            recipient,
            other,
        ]);

        notifications.notify({
            data: null,
            deviceID: "device-b",
            event: "mail",
            transmissionID: "00000000-0000-0000-0000-000000000001",
            userID: "user-b",
        });

        expect(recipient.send).toHaveBeenCalledTimes(1);
        expect(other.send).not.toHaveBeenCalled();
        expect(clients).toEqual([recipient, other]);
    });

    it("continues user fanout after a client inspection throws", () => {
        const broken = fakeClient({
            getUserID: vi.fn(() => {
                throw new Error("stale client");
            }),
        });
        const recipient = fakeClient({
            getUserID: vi.fn(() => "user-b"),
        });
        const other = fakeClient({
            getUserID: vi.fn(() => "user-c"),
        });
        const { clients, notifications } = createSpireHarness([
            broken,
            recipient,
            other,
        ]);

        notifications.notify({
            event: "device_pending_enrollment",
            transmissionID: "00000000-0000-0000-0000-000000000002",
            userID: "user-b",
        });

        expect(recipient.send).toHaveBeenCalledTimes(1);
        expect(other.send).not.toHaveBeenCalled();
        expect(clients).toEqual([recipient, other]);
    });

    it("checks Expo receipts and removes unregistered devices", async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                json: () =>
                    Promise.resolve({
                        data: [{ id: "receipt-a", status: "ok" }],
                    }),
                ok: true,
            })
            .mockResolvedValueOnce({
                json: () =>
                    Promise.resolve({
                        data: {
                            "receipt-a": {
                                details: { error: "DeviceNotRegistered" },
                                message: "device is not registered",
                                status: "error",
                            },
                        },
                    }),
                ok: true,
            });
        vi.stubGlobal("fetch", fetchMock);

        const { db, removeNotificationSubscription } = createSpireHarness(
            [],
            [subscription],
        );
        const service = new NotificationService(db, [], () => {}, {
            receiptDelayMs: 1,
        });

        service.notify({
            deviceID: subscription.deviceID,
            event: "mail",
            transmissionID: "00000000-0000-0000-0000-000000000003",
            userID: subscription.userID,
        });

        await vi.advanceTimersByTimeAsync(1);

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
        expect(fetchMock.mock.calls[1]?.[0]).toBe(
            "https://exp.host/--/api/v2/push/getReceipts",
        );
        expect(removeNotificationSubscription).toHaveBeenCalledWith({
            deviceID: subscription.deviceID,
            subscriptionID: subscription.subscriptionID,
            userID: subscription.userID,
        });
    });

    it("does not leave stale pending receipts after receipt lookup failure", async () => {
        vi.useFakeTimers();
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                json: () =>
                    Promise.resolve({
                        data: [{ id: "receipt-a", status: "ok" }],
                    }),
                ok: true,
            })
            .mockResolvedValueOnce({
                ok: false,
                status: 503,
            });
        vi.stubGlobal("fetch", fetchMock);

        const { db } = createSpireHarness([], [subscription]);
        const service = new NotificationService(db, [], () => {}, {
            receiptDelayMs: 1,
        });

        service.notify({
            deviceID: subscription.deviceID,
            event: "mail",
            transmissionID: "00000000-0000-0000-0000-000000000004",
            userID: subscription.userID,
        });

        await vi.advanceTimersByTimeAsync(1);

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(pendingReceiptCount(service)).toBe(0);
        });
    });

    it("sends Android Expo pushes on the mobile push channel", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            json: () =>
                Promise.resolve({
                    data: [{ id: "receipt-a", status: "ok" }],
                }),
            ok: true,
        });
        vi.stubGlobal("fetch", fetchMock);

        const { db } = createSpireHarness([], [subscription]);
        const service = new NotificationService(db, [], () => {});

        await service["notifyPush"]({
            deviceID: subscription.deviceID,
            event: "mail",
            transmissionID: "00000000-0000-0000-0000-000000000006",
            userID: subscription.userID,
        });

        const init = fetchMock.mock.calls[0]?.[1] as
            | undefined
            | { body?: unknown };
        const messages = JSON.parse(String(init?.body)) as Array<{
            channelId?: string;
            data?: Record<string, unknown>;
            priority?: string;
        }>;
        expect(messages[0]?.channelId).toBe("vex-push");
        expect(messages[0]?.priority).toBe("high");
        expect(messages[0]?.data).toMatchObject({
            event: "mail",
            title: "New Vex message",
            transmissionID: "00000000-0000-0000-0000-000000000006",
        });
    });

    it("awaits ticket error cleanup so rejection stays on notifyPush", async () => {
        const cleanupError = new Error("database unavailable");
        const removeNotificationSubscription = vi.fn(() =>
            Promise.reject(cleanupError),
        );
        const fetchMock = vi.fn().mockResolvedValueOnce({
            json: () =>
                Promise.resolve({
                    data: [
                        {
                            details: { error: "DeviceNotRegistered" },
                            message: "device is not registered",
                            status: "error",
                        },
                    ],
                }),
            ok: true,
        });
        vi.stubGlobal("fetch", fetchMock);

        const { db } = createSpireHarness(
            [],
            [subscription],
            removeNotificationSubscription,
        );
        const service = new NotificationService(db, [], () => {});

        await expect(
            service["notifyPush"]({
                deviceID: subscription.deviceID,
                event: "mail",
                transmissionID: "00000000-0000-0000-0000-000000000005",
                userID: subscription.userID,
            }),
        ).rejects.toThrow(cleanupError);
    });
});
