/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import {
    setCryptoProfile,
    xBoxKeyPairAsync,
    xConstants,
    xEncode,
    xSignAsync,
    xSignKeyPair,
    XUtils,
} from "@vex-chat/crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
    verifyDevicePayloadPreKeySignature,
    verifyPreKeyWsSignature,
} from "../utils/preKeySignature.ts";

async function makeSignedPreKey() {
    const signKeys = xSignKeyPair();
    const preKey = await xBoxKeyPairAsync();
    const signature = await xSignAsync(
        xEncode(xConstants.CURVE, preKey.publicKey),
        signKeys.secretKey,
    );
    return { preKey, signature, signKeys };
}

describe("prekey signature validation", () => {
    beforeEach(() => {
        setCryptoProfile("tweetnacl");
    });

    it("accepts a prekey signed by the device signing key", async () => {
        const { preKey, signature, signKeys } = await makeSignedPreKey();

        await expect(
            verifyDevicePayloadPreKeySignature({
                preKey: XUtils.encodeHex(preKey.publicKey),
                preKeySignature: XUtils.encodeHex(signature),
                signKey: XUtils.encodeHex(signKeys.publicKey),
            }),
        ).resolves.toBe(true);
        await expect(
            verifyPreKeyWsSignature(
                {
                    deviceID: "device-a",
                    index: 1,
                    publicKey: preKey.publicKey,
                    signature,
                },
                XUtils.encodeHex(signKeys.publicKey),
            ),
        ).resolves.toBe(true);
    });

    it("rejects a stale prekey signature from a different signing key", async () => {
        const stale = await makeSignedPreKey();
        const currentSignKeys = xSignKeyPair();

        await expect(
            verifyDevicePayloadPreKeySignature({
                preKey: XUtils.encodeHex(stale.preKey.publicKey),
                preKeySignature: XUtils.encodeHex(stale.signature),
                signKey: XUtils.encodeHex(currentSignKeys.publicKey),
            }),
        ).resolves.toBe(false);
    });
});
