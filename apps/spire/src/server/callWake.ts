/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { MailWS } from "@vex-chat/types";

import { XUtils } from "@vex-chat/crypto";

export interface CallWakeDispatchData {
    callID: string;
    expiresAt?: string | undefined;
    mailID: string;
    mailNonce: string;
}

export function callWakeDispatchData(
    mail: MailWS,
): CallWakeDispatchData | null {
    if (mail.notify?.event !== "callWake") {
        return null;
    }
    return {
        callID: mail.notify.callID,
        ...(mail.notify.expiresAt ? { expiresAt: mail.notify.expiresAt } : {}),
        mailID: mail.mailID,
        mailNonce: XUtils.encodeHex(new Uint8Array(mail.nonce)),
    };
}
