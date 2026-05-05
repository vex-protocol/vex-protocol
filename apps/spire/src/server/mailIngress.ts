/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Device, MailWS } from "@vex-chat/types";

export interface ValidatedMailIngress {
    readonly recipientDevice: Device;
}

export class MailIngressValidationError extends Error {
    public readonly status: number;

    public constructor(status: number, message: string) {
        super(message);
        this.name = "MailIngressValidationError";
        this.status = status;
    }
}

export async function validateMailIngress(
    db: Pick<Database, "retrieveDevice">,
    mail: MailWS,
    authenticatedDeviceID: string,
    authenticatedUserID: string,
): Promise<ValidatedMailIngress> {
    if (mail.sender !== authenticatedDeviceID) {
        throw new MailIngressValidationError(
            403,
            "Mail sender does not match the authenticated device.",
        );
    }

    if (mail.authorID !== authenticatedUserID) {
        throw new MailIngressValidationError(
            403,
            "Mail author does not match the authenticated user.",
        );
    }

    const recipientDevice = await db.retrieveDevice(mail.recipient);
    if (recipientDevice === null) {
        throw new MailIngressValidationError(
            400,
            "No associated user record found for recipient device.",
        );
    }

    if (mail.readerID !== recipientDevice.owner) {
        throw new MailIngressValidationError(
            400,
            "Mail reader does not match the recipient device owner.",
        );
    }

    return { recipientDevice };
}
