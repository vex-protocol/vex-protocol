/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { SessionCrypto } from "../types/index.js";
import type { SessionSQL } from "@vex-chat/types";

import { XUtils } from "@vex-chat/crypto";

import { parseSkippedKeysStrict } from "./ratchet.js";

export function sqlSessionToCrypto(session: SessionSQL): SessionCrypto {
    const skippedKeys = parseSkippedKeysStrict(session.skippedKeys);
    return {
        CKr: session.CKr ? XUtils.decodeHex(session.CKr) : null,
        CKs: session.CKs ? XUtils.decodeHex(session.CKs) : null,
        DHr: session.DHr ? XUtils.decodeHex(session.DHr) : null,
        DHsPrivate: XUtils.decodeHex(session.DHsPrivate),
        DHsPublic: XUtils.decodeHex(session.DHsPublic),
        fingerprint: XUtils.decodeHex(session.fingerprint),
        lastUsed: session.lastUsed,
        mode: session.mode,
        Nr: session.Nr,
        Ns: session.Ns,
        PN: session.PN,
        publicKey: XUtils.decodeHex(session.publicKey),
        RK: XUtils.decodeHex(session.RK),
        sessionID: session.sessionID,
        SK: XUtils.decodeHex(session.SK),
        skippedKeys,
        userID: session.userID,
        verified: session.verified,
    };
}
