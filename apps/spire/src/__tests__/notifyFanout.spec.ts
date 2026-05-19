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
    hasMail = vi.fn(() => Promise.resolve(true)),
) {
    const retrieveNotificationSubscriptions = vi.fn(() =>
        Promise.resolve(subscriptions),
    );
    const db = {
        hasMail,
        removeNotificationSubscription,
        retrieveNotificationSubscriptions,
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
        hasMail,
        notifications,
        removeNotificationSubscription,
        retrieveNotificationSubscriptions,
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

    it("uses headless Expo pushes for sender-owned mail while keeping websocket fanout", async () => {
        const recipient = fakeClient({
            getDeviceID: vi.fn(() => "device-b"),
        });
        const fetchMock = vi.fn().mockResolvedValueOnce({
            json: () =>
                Promise.resolve({
                    data: [{ id: "receipt-a", status: "ok" }],
                }),
            ok: true,
        });
        vi.stubGlobal("fetch", fetchMock);

        const { notifications, retrieveNotificationSubscriptions } =
            createSpireHarness([recipient], [subscription]);

        notifications.notify({
            deviceID: "device-b",
            event: "mail",
            headlessPushUserID: "user-b",
            transmissionID: "00000000-0000-0000-0000-000000000007",
            userID: "user-b",
        });

        expect(recipient.send).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
        expect(retrieveNotificationSubscriptions).toHaveBeenCalledWith({
            deviceID: "device-b",
            event: "mail",
            userID: "user-b",
        });

        const init = fetchMock.mock.calls[0]?.[1] as
            | undefined
            | { body?: unknown };
        const messages = JSON.parse(String(init?.body)) as Array<{
            _contentAvailable?: boolean;
            body?: string;
            channelId?: string;
            data?: Record<string, unknown>;
            tag?: string;
            title?: string;
        }>;
        expect(messages[0]?._contentAvailable).toBe(true);
        expect(messages[0]).not.toHaveProperty("body");
        expect(messages[0]).not.toHaveProperty("channelId");
        expect(messages[0]).not.toHaveProperty("tag");
        expect(messages[0]).not.toHaveProperty("title");
        expect(messages[0]?.data).toMatchObject({
            deviceID: "device-b",
            event: "mail",
            headless: true,
            transmissionID: "00000000-0000-0000-0000-000000000007",
        });
    });

    it("skips Expo mail push when websocket delivery is acknowledged during the grace window", async () => {
        vi.useFakeTimers();
        const recipient = fakeClient({
            getDeviceID: vi.fn(() => "device-b"),
        });
        const fetchMock = vi.fn();
        const hasMail = vi.fn(() => Promise.resolve(false));
        vi.stubGlobal("fetch", fetchMock);

        const { notifications } = createSpireHarness(
            [recipient],
            [subscription],
            undefined,
            hasMail,
        );
        const mailNonce = new Uint8Array([1, 2, 3]);

        notifications.notify({
            deviceID: "device-b",
            event: "mail",
            mailNonce,
            transmissionID: "00000000-0000-0000-0000-000000000010",
            userID: "user-b",
        });

        expect(recipient.send).toHaveBeenCalledTimes(1);
        expect(fetchMock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1500);

        await vi.waitFor(() => {
            expect(hasMail).toHaveBeenCalledWith(mailNonce, "device-b");
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends Expo mail push after the grace window when websocket mail remains pending", async () => {
        vi.useFakeTimers();
        const recipient = fakeClient({
            getDeviceID: vi.fn(() => "device-b"),
        });
        const fetchMock = vi.fn().mockResolvedValueOnce({
            json: () =>
                Promise.resolve({
                    data: [{ id: "receipt-a", status: "ok" }],
                }),
            ok: true,
        });
        const hasMail = vi.fn(() => Promise.resolve(true));
        vi.stubGlobal("fetch", fetchMock);

        const { notifications } = createSpireHarness(
            [recipient],
            [subscription],
            undefined,
            hasMail,
        );

        notifications.notify({
            deviceID: "device-b",
            event: "mail",
            mailNonce: new Uint8Array([4, 5, 6]),
            transmissionID: "00000000-0000-0000-0000-000000000011",
            userID: "user-b",
        });

        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1500);

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    it("sends Expo mail push immediately when no websocket client was notified", async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce({
            json: () =>
                Promise.resolve({
                    data: [{ id: "receipt-a", status: "ok" }],
                }),
            ok: true,
        });
        const hasMail = vi.fn(() => Promise.resolve(true));
        vi.stubGlobal("fetch", fetchMock);

        const { notifications } = createSpireHarness(
            [],
            [subscription],
            undefined,
            hasMail,
        );

        notifications.notify({
            deviceID: "device-b",
            event: "mail",
            mailNonce: new Uint8Array([7, 8, 9]),
            transmissionID: "00000000-0000-0000-0000-000000000012",
            userID: "user-b",
        });

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
        expect(hasMail).not.toHaveBeenCalled();
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

    it("does not leave stale pending receipts after receipt fetch rejection", async () => {
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
            .mockRejectedValueOnce(new Error("network unavailable"));
        vi.stubGlobal("fetch", fetchMock);

        const { db } = createSpireHarness([], [subscription]);
        const service = new NotificationService(db, [], () => {}, {
            receiptDelayMs: 1,
        });

        service.notify({
            deviceID: subscription.deviceID,
            event: "mail",
            transmissionID: "00000000-0000-0000-0000-000000000008",
            userID: subscription.userID,
        });

        await vi.advanceTimersByTimeAsync(1);

        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(pendingReceiptCount(service)).toBe(0);
        });
    });

    it("does not leave stale pending receipts after receipt lookup timeout", async () => {
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
            .mockImplementationOnce((_input: string, init?: RequestInit) => {
                return new Promise<Response>((_resolve, reject) => {
                    const abortError = new Error("aborted");
                    abortError.name = "AbortError";
                    const signal = init?.signal;
                    if (signal?.aborted) {
                        reject(abortError);
                        return;
                    }
                    signal?.addEventListener(
                        "abort",
                        () => {
                            reject(abortError);
                        },
                        { once: true },
                    );
                });
            });
        vi.stubGlobal("fetch", fetchMock);

        const { db } = createSpireHarness([], [subscription]);
        const service = new NotificationService(db, [], () => {}, {
            receiptDelayMs: 1,
        });

        service.notify({
            deviceID: subscription.deviceID,
            event: "mail",
            transmissionID: "00000000-0000-0000-0000-000000000009",
            userID: subscription.userID,
        });

        await vi.advanceTimersByTimeAsync(1);
        await vi.waitFor(() => {
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
        await vi.advanceTimersByTimeAsync(10_000);

        await vi.waitFor(() => {
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
            collapseId?: string;
            data?: Record<string, unknown>;
            priority?: string;
            tag?: string;
            title?: string;
        }>;
        expect(messages[0]?.collapseId).toBe("vex-message-summary");
        expect(messages[0]?.channelId).toBe("vex-push-messages-v2");
        expect(messages[0]?.priority).toBe("high");
        expect(messages[0]?.tag).toBe("vex-message-summary");
        expect(messages[0]?.title).toBe("New Message");
        expect(messages[0]).not.toHaveProperty("body");
        expect(messages[0]?.data).toMatchObject({
            event: "mail",
            title: "New Message",
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
