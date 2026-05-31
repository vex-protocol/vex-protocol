/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { DevicePayload, PreKeysWS } from "@vex-chat/types";

import {
    getCryptoProfile,
    xConcat,
    xConstants,
    xEncode,
    XUtils,
} from "@vex-chat/crypto";

import { spireXSignOpenAsync } from "./spireXSignOpenAsync.ts";

export async function verifyDevicePayloadPreKeySignature(
    payload: Pick<DevicePayload, "preKey" | "preKeySignature" | "signKey">,
): Promise<boolean> {
    try {
        return await verifySignedPreKey(
            XUtils.decodeHex(payload.preKey),
            XUtils.decodeHex(payload.preKeySignature),
            payload.signKey,
        );
    } catch {
        return false;
    }
}

export async function verifyPreKeyWsSignature(
    preKey: PreKeysWS,
    signKeyHex: string,
): Promise<boolean> {
    return verifySignedPreKey(preKey.publicKey, preKey.signature, signKeyHex);
}

function preKeySignPayload(publicKey: Uint8Array): Uint8Array {
    return getCryptoProfile() === "fips"
        ? xConcat(new Uint8Array([0xa1]), publicKey)
        : xEncode(xConstants.CURVE, publicKey);
}

async function verifySignedPreKey(
    publicKey: Uint8Array,
    signature: Uint8Array,
    signKeyHex: string,
): Promise<boolean> {
    try {
        const opened = await spireXSignOpenAsync(
            signature,
            XUtils.decodeHex(signKeyHex),
        );
        return Boolean(
            opened && XUtils.bytesEqual(opened, preKeySignPayload(publicKey)),
        );
    } catch {
        return false;
    }
}
