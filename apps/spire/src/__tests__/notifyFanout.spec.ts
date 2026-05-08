/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientManager } from "../ClientManager.ts";
import type { BaseMsg } from "@vex-chat/types";

import { describe, expect, it, vi } from "vitest";

import { Spire } from "../Spire.ts";

interface FakeClient {
    getDeviceID: () => null | string;
    getUserID: () => null | string;
    hasFailed: () => boolean;
    send: (msg: BaseMsg) => void;
}

type NotifyFn = (
    userID: string,
    event: string,
    transmissionID: string,
    data?: unknown,
    deviceID?: string,
) => void;

function createSpireHarness(clients: FakeClient[]) {
    const spire = Object.create(Spire.prototype) as {
        clients: ClientManager[];
        notify: NotifyFn;
    };
    spire.clients = clients as unknown as ClientManager[];
    return spire;
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
        const spire = createSpireHarness([stale, recipient, other]);

        spire.notify(
            "user-b",
            "mail",
            "00000000-0000-0000-0000-000000000001",
            null,
            "device-b",
        );

        expect(recipient.send).toHaveBeenCalledTimes(1);
        expect(other.send).not.toHaveBeenCalled();
        expect(spire.clients).toEqual([recipient, other]);
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
        const spire = createSpireHarness([broken, recipient, other]);

        spire.notify(
            "user-b",
            "device_pending_enrollment",
            "00000000-0000-0000-0000-000000000002",
        );

        expect(recipient.send).toHaveBeenCalledTimes(1);
        expect(other.send).not.toHaveBeenCalled();
        expect(spire.clients).toEqual([recipient, other]);
    });
});
