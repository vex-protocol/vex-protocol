/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientManager } from "../ClientManager.ts";
import type { Database } from "../Database.ts";
import type { BaseMsg } from "@vex-chat/types";

import { describe, expect, it, vi } from "vitest";

import { NotificationService } from "../NotificationService.ts";

interface FakeClient {
    getDeviceID: () => null | string;
    getUserID: () => null | string;
    hasFailed: () => boolean;
    send: (msg: BaseMsg) => void;
}

function createSpireHarness(clients: FakeClient[]) {
    const db = {
        retrieveNotificationSubscriptions: vi.fn(() => Promise.resolve([])),
    } as unknown as Database;
    const managers = clients as unknown as ClientManager[];
    const removeClient = (client: ClientManager) => {
        const idx = managers.indexOf(client);
        if (idx >= 0) managers.splice(idx, 1);
    };
    const notifications = new NotificationService(db, managers, removeClient);
    return { clients: managers, notifications };
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

describe("Spire notify fanout", () => {
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
});
