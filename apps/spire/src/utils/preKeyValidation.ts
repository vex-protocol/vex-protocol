/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device, DevicePayload, PreKeysWS } from "@vex-chat/types";

import {
    getCryptoProfile,
    xConcat,
    xConstants,
    xEncode,
    XUtils,
} from "@vex-chat/crypto";

import { spireXSignOpenAsync } from "./spireXSignOpenAsync.ts";

export class PreKeyValidationError extends Error {
    public readonly status: number;

    public constructor(message: string, status = 400) {
        super(message);
        this.name = "PreKeyValidationError";
        this.status = status;
    }
}

export async function assertDevicePayloadPreKeySignature(
    payload: DevicePayload,
): Promise<void> {
    if (!Number.isSafeInteger(payload.preKeyIndex) || payload.preKeyIndex < 0) {
        throw new PreKeyValidationError("Invalid signed prekey index.");
    }

    await assertPreKeySignature(
        {
            index: payload.preKeyIndex,
            publicKey: decodeHexField(payload.preKey, "signed prekey"),
            signature: decodeHexField(
                payload.preKeySignature,
                "signed prekey signature",
            ),
        },
        decodeHexField(payload.signKey, "device signing key"),
        "signed prekey",
    );
}

export async function assertPreKeysBelongToDevice(
    device: Device,
    entries: PreKeysWS[],
    options: { oneTime: boolean },
): Promise<void> {
    const signKey = decodeHexField(device.signKey, "device signing key");
    for (const [offset, entry] of entries.entries()) {
        const label = options.oneTime
            ? `one-time prekey #${offset + 1}`
            : `signed prekey #${offset + 1}`;

        if (entry.deviceID !== device.deviceID) {
            throw new PreKeyValidationError(
                `${label} belongs to a different device.`,
            );
        }
        if (
            !Number.isSafeInteger(entry.index) ||
            entry.index === null ||
            entry.index < (options.oneTime ? 1 : 0)
        ) {
            throw new PreKeyValidationError(`${label} has an invalid index.`);
        }

        await assertPreKeySignature(entry, signKey, label);
    }
}

export function preKeySignaturePayload(publicKey: Uint8Array): Uint8Array {
    return getCryptoProfile() === "fips"
        ? xConcat(new Uint8Array([0xa1]), publicKey)
        : xEncode(xConstants.CURVE, publicKey);
}

async function assertPreKeySignature(
    entry: Pick<PreKeysWS, "index" | "publicKey" | "signature">,
    signKey: Uint8Array,
    label: string,
): Promise<void> {
    const opened = await spireXSignOpenAsync(entry.signature, signKey);
    if (
        !opened ||
        !XUtils.bytesEqual(opened, preKeySignaturePayload(entry.publicKey))
    ) {
        throw new PreKeyValidationError(`${label} signature is invalid.`, 401);
    }
}

function decodeHexField(hex: string, label: string): Uint8Array {
    try {
        return XUtils.decodeHex(hex);
    } catch {
        throw new PreKeyValidationError(`Invalid ${label} encoding.`);
    }
}
