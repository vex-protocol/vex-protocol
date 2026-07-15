/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { DevicePayload, PreKeysWS } from "@vex-chat/types";

import { xPreKeySignaturePayload, XUtils } from "@vex-chat/crypto";

import { spireXSignOpenAsync } from "./spireXSignOpenAsync.ts";

export async function verifyDevicePayloadPreKeySignature(
    payload: Pick<DevicePayload, "preKey" | "preKeySignature" | "signKey">,
): Promise<boolean> {
    try {
        return await verifySignedPreKey(
            XUtils.decodeHex(payload.preKey),
            XUtils.decodeHex(payload.preKeySignature),
            payload.signKey,
            "signed",
        );
    } catch {
        return false;
    }
}

export async function verifyPreKeyWsSignature(
    preKey: PreKeysWS,
    signKeyHex: string,
    kind: "one-time" | "signed",
): Promise<boolean> {
    return verifySignedPreKey(
        preKey.publicKey,
        preKey.signature,
        signKeyHex,
        kind,
    );
}

async function verifySignedPreKey(
    publicKey: Uint8Array,
    signature: Uint8Array,
    signKeyHex: string,
    kind: "one-time" | "signed",
): Promise<boolean> {
    try {
        const opened = await spireXSignOpenAsync(
            signature,
            XUtils.decodeHex(signKeyHex),
        );
        return Boolean(
            opened &&
            XUtils.bytesEqual(opened, xPreKeySignaturePayload(publicKey, kind)),
        );
    } catch {
        return false;
    }
}
