/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { CryptoProfile } from "@vex-chat/crypto";
import type { Device, KeyBundle, KeyBundleEntry } from "@vex-chat/types";

import {
    fipsEcdhRawPublicKeyFromEcdsaSpkiAsync,
    xPreKeySignaturePayload,
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
        "signed",
    );

    if (keyBundle.otk) {
        await verifyKeyBundleEntrySignature(
            keyBundle.otk,
            device,
            deviceSignKey,
            cryptoProfile,
            "one-time",
        );
    }
}

async function verifyKeyBundleEntrySignature(
    entry: KeyBundleEntry,
    device: Device,
    deviceSignKey: Uint8Array,
    cryptoProfile: CryptoProfile,
    kind: "one-time" | "signed",
): Promise<void> {
    if (entry.deviceID !== device.deviceID) {
        throw new Error(
            `Key bundle ${kind} prekey belongs to a different device.`,
        );
    }

    const payload = xPreKeySignaturePayload(
        entry.publicKey,
        kind,
        cryptoProfile,
    );
    const opened = await xSignOpenAsync(entry.signature, deviceSignKey);

    if (!opened || !XUtils.bytesEqual(opened, payload)) {
        throw new Error(`Key bundle ${kind} prekey signature is invalid.`);
    }
}
