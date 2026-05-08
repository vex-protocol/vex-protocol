/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device, MailWS } from "@vex-chat/types";

import { MailType } from "@vex-chat/types";

import { describe, expect, it, vi } from "vitest";

import { validateMailIngress } from "../server/mailIngress.ts";

const senderDeviceID = "sender-device";
const senderUserID = "sender-user";
const recipientDeviceID = "recipient-device";
const recipientUserID = "recipient-user";

const recipientDevice: Device = {
    deleted: false,
    deviceID: recipientDeviceID,
    lastLogin: new Date(0).toISOString(),
    name: "recipient",
    owner: recipientUserID,
    signKey: "recipient-sign-key",
};

function makeDb(device: Device | null = recipientDevice) {
    return {
        retrieveDevice: vi.fn(() => Promise.resolve(device)),
    };
}

function makeMail(overrides: Partial<MailWS> = {}): MailWS {
    return {
        authorID: senderUserID,
        cipher: new Uint8Array([1, 2, 3]),
        extra: new Uint8Array([4, 5, 6]),
        forward: false,
        group: null,
        mailID: "mail-id",
        mailType: MailType.initial,
        nonce: new Uint8Array([7, 8, 9]),
        readerID: recipientUserID,
        recipient: recipientDeviceID,
        sender: senderDeviceID,
        ...overrides,
    };
}

describe("validateMailIngress", () => {
    it("accepts mail bound to the authenticated sender and recipient owner", async () => {
        const db = makeDb();

        await expect(
            validateMailIngress(db, makeMail(), senderDeviceID, senderUserID),
        ).resolves.toEqual({ recipientDevice });
        expect(db.retrieveDevice).toHaveBeenCalledWith(recipientDeviceID);
    });

    it("rejects sender spoofing before looking up the recipient", async () => {
        const db = makeDb();

        await expect(
            validateMailIngress(
                db,
                makeMail({ sender: "other-device" }),
                senderDeviceID,
                senderUserID,
            ),
        ).rejects.toMatchObject({
            message: "Mail sender does not match the authenticated device.",
            status: 403,
        });
        expect(db.retrieveDevice).not.toHaveBeenCalled();
    });

    it("rejects author spoofing before looking up the recipient", async () => {
        const db = makeDb();

        await expect(
            validateMailIngress(
                db,
                makeMail({ authorID: "other-user" }),
                senderDeviceID,
                senderUserID,
            ),
        ).rejects.toMatchObject({
            message: "Mail author does not match the authenticated user.",
            status: 403,
        });
        expect(db.retrieveDevice).not.toHaveBeenCalled();
    });

    it("rejects mail to a missing or deleted recipient device", async () => {
        const db = makeDb(null);

        await expect(
            validateMailIngress(db, makeMail(), senderDeviceID, senderUserID),
        ).rejects.toMatchObject({
            message: "No associated user record found for recipient device.",
            status: 400,
        });
    });

    it("rejects reader spoofing against the recipient device owner", async () => {
        const db = makeDb();

        await expect(
            validateMailIngress(
                db,
                makeMail({ readerID: "other-reader" }),
                senderDeviceID,
                senderUserID,
            ),
        ).rejects.toMatchObject({
            message: "Mail reader does not match the recipient device owner.",
            status: 400,
        });
    });
});
