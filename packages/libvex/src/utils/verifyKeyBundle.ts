/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { CryptoProfile } from "@vex-chat/crypto";
import type { Device, KeyBundle, KeyBundleEntry } from "@vex-chat/types";

import {
    fipsEcdhRawPublicKeyFromEcdsaSpkiAsync,
    xPreKeySignaturePayloadV1,
    xPreKeySignaturePayloadV2,
    xSignOpenAsync,
    XUtils,
} from "@vex-chat/crypto";

export async function verifyKeyBundleSignatures(
    keyBundle: KeyBundle,
    device: Device,
    cryptoProfile: CryptoProfile,
): Promise<void> {
    const deviceSignKey = XUtils.decodeHex(device.signKey);
    const expectedIdentity =
        cryptoProfile === "fips"
            ? await fipsEcdhRawPublicKeyFromEcdsaSpkiAsync(deviceSignKey)
            : deviceSignKey;

    if (!XUtils.bytesEqual(expectedIdentity, keyBundle.signKey)) {
        throw new Error("Key bundle identity key does not match device.");
    }

    await verifyKeyBundleEntrySignature(
        keyBundle.preKey,
        device,
        deviceSignKey,
        cryptoProfile,
        "signed prekey",
        "signed_prekey",
    );

    if (keyBundle.otk) {
        await verifyKeyBundleEntrySignature(
            keyBundle.otk,
            device,
            deviceSignKey,
            cryptoProfile,
            "one-time prekey",
            "one_time_prekey",
        );
    }
}

async function verifyKeyBundleEntrySignature(
    entry: KeyBundleEntry,
    device: Device,
    deviceSignKey: Uint8Array,
    cryptoProfile: CryptoProfile,
    label: string,
    keyType: "one_time_prekey" | "signed_prekey",
): Promise<void> {
    if (entry.deviceID !== device.deviceID) {
        throw new Error(`Key bundle ${label} belongs to a different device.`);
    }

    const opened = await xSignOpenAsync(entry.signature, deviceSignKey);

    if (!opened) {
        throw new Error(`Key bundle ${label} signature is invalid.`);
    }

    if (entry.index !== null) {
        const v2Payload = xPreKeySignaturePayloadV2({
            cryptoProfile,
            deviceID: entry.deviceID,
            keyIndex: entry.index,
            keyType,
            publicKey: entry.publicKey,
        });
        if (XUtils.bytesEqual(opened, v2Payload)) {
            return;
        }
    }

    if (
        XUtils.bytesEqual(
            opened,
            xPreKeySignaturePayloadV1(entry.publicKey, cryptoProfile),
        )
    ) {
        return;
    }

    throw new Error(`Key bundle ${label} signature is invalid.`);
}
