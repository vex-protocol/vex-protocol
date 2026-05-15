/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device, ReceiptMsg } from "@vex-chat/types";

import { describe, expect, it, vi } from "vitest";

import { ClientManager } from "../ClientManager.ts";

const RECEIPT_NONCE = new Uint8Array([1, 2, 3]);

interface ManagerHarness {
    authed: boolean;
    db: { deleteMail: ReturnType<typeof vi.fn> };
    device: Device | null;
    failed: boolean;
    handleReceipt: (msg: ReceiptMsg) => Promise<void>;
    sendErr: ReturnType<typeof vi.fn>;
}

function createManagerHarness({
    authed,
    deleteMail = vi.fn(),
    deviceID,
}: {
    authed: boolean;
    deleteMail?: ReturnType<typeof vi.fn>;
    deviceID: null | string;
}) {
    const manager = Object.create(
        ClientManager.prototype,
    ) as unknown as ManagerHarness;
    manager.authed = authed;
    manager.db = { deleteMail };
    manager.device =
        deviceID === null
            ? null
            : ({
                  deviceID,
              } as Device);
    manager.failed = false;
    manager.sendErr = vi.fn();
    return manager;
}

function createReceipt(): ReceiptMsg {
    return {
        nonce: RECEIPT_NONCE,
        transmissionID: "00000000-0000-0000-0000-000000000001",
        type: "receipt",
    };
}

describe("ClientManager receipt handling", () => {
    it("rejects receipts before a device is authenticated", async () => {
        const deleteMail = vi.fn();
        const manager = createManagerHarness({
            authed: false,
            deleteMail,
            deviceID: null,
        });

        await manager.handleReceipt(createReceipt());

        expect(deleteMail).not.toHaveBeenCalled();
        expect(manager.sendErr).toHaveBeenCalledWith(
            "00000000-0000-0000-0000-000000000001",
            "You are not authenticated.",
        );
    });

    it("deletes mail receipts for the authenticated device", async () => {
        const deleteMail = vi.fn();
        const manager = createManagerHarness({
            authed: true,
            deleteMail,
            deviceID: "device-a",
        });

        await manager.handleReceipt(createReceipt());

        expect(deleteMail).toHaveBeenCalledWith(RECEIPT_NONCE, "device-a");
        expect(manager.sendErr).not.toHaveBeenCalled();
    });

    it("contains receipt deletion failures", async () => {
        const deleteMail = vi.fn(() =>
            Promise.reject(new Error("database unavailable")),
        );
        const manager = createManagerHarness({
            authed: true,
            deleteMail,
            deviceID: "device-a",
        });

        await manager.handleReceipt(createReceipt());

        expect(manager.sendErr).toHaveBeenCalledWith(
            "00000000-0000-0000-0000-000000000001",
            "Error: database unavailable",
        );
    });
});
