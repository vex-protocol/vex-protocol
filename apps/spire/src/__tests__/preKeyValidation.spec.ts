/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { CryptoProfile, KeyPair } from "@vex-chat/crypto";
import type { Device, DevicePayload, PreKeysWS } from "@vex-chat/types";

import {
    setCryptoProfile,
    xBoxKeyPairAsync,
    xSignAsync,
    xSignKeyPairAsync,
    XUtils,
} from "@vex-chat/crypto";

import { afterEach, describe, expect, it } from "vitest";

import {
    assertDevicePayloadPreKeySignature,
    assertPreKeysBelongToDevice,
    preKeySignaturePayload,
} from "../utils/preKeyValidation.ts";

describe("preKeyValidation", () => {
    afterEach(() => {
        setCryptoProfile("tweetnacl");
    });

    it("accepts a valid tweetnacl device signed prekey payload", async () => {
        const { payload } = await makeMaterial("tweetnacl");

        await expect(
            assertDevicePayloadPreKeySignature(payload),
        ).resolves.toBeUndefined();
    });

    it("accepts a valid fips device signed prekey payload", async () => {
        const { payload } = await makeMaterial("fips");

        await expect(
            assertDevicePayloadPreKeySignature(payload),
        ).resolves.toBeUndefined();
    });

    it("rejects a tampered device signed prekey payload", async () => {
        const { payload } = await makeMaterial("tweetnacl");
        payload.preKey = flipHexByte(payload.preKey);

        await expect(
            assertDevicePayloadPreKeySignature(payload),
        ).rejects.toMatchObject({
            message: "signed prekey signature is invalid.",
            status: 401,
        });
    });

    it("rejects a batch when any uploaded OTK signature is invalid", async () => {
        const { device, otks } = await makeMaterial("tweetnacl", 2);
        otks[1]!.publicKey = flipFirstByte(otks[1]!.publicKey);

        await expect(
            assertPreKeysBelongToDevice(device, otks, { oneTime: true }),
        ).rejects.toMatchObject({
            message: "one-time prekey #2 signature is invalid.",
            status: 401,
        });
    });

    it("rejects uploaded OTKs for a different device", async () => {
        const { device, otks } = await makeMaterial("tweetnacl");
        otks[0]!.deviceID = "other-device";

        await expect(
            assertPreKeysBelongToDevice(device, otks, { oneTime: true }),
        ).rejects.toMatchObject({
            message: "one-time prekey #1 belongs to a different device.",
            status: 400,
        });
    });

    it("rejects null or zero OTK indexes", async () => {
        const { device, otks } = await makeMaterial("tweetnacl");
        otks[0]!.index = 0;

        await expect(
            assertPreKeysBelongToDevice(device, otks, { oneTime: true }),
        ).rejects.toMatchObject({
            message: "one-time prekey #1 has an invalid index.",
            status: 400,
        });
    });
});

function flipFirstByte(bytes: Uint8Array): Uint8Array {
    const copy = new Uint8Array(bytes);
    copy[0] = (copy[0] ?? 0) ^ 1;
    return copy;
}

function flipHexByte(hex: string): string {
    return XUtils.encodeHex(flipFirstByte(XUtils.decodeHex(hex)));
}

async function makeMaterial(
    profile: CryptoProfile,
    otkCount = 1,
): Promise<{
    device: Device;
    otks: PreKeysWS[];
    payload: DevicePayload;
}> {
    setCryptoProfile(profile);
    const signKeyPair = await xSignKeyPairAsync();
    const preKeyPair = await xBoxKeyPairAsync();
    const preKeySignature = await signPreKey(preKeyPair, signKeyPair);
    const deviceID = "device-1";
    const signKey = XUtils.encodeHex(signKeyPair.publicKey);
    const payload: DevicePayload = {
        deviceName: "test device",
        preKey: XUtils.encodeHex(preKeyPair.publicKey),
        preKeyIndex: 1,
        preKeySignature: XUtils.encodeHex(preKeySignature),
        signed: "",
        signKey,
    };
    const device: Device = {
        deleted: false,
        deviceID,
        lastLogin: new Date(0).toISOString(),
        name: payload.deviceName,
        owner: "user-1",
        signKey,
    };
    const otks: PreKeysWS[] = [];
    for (let i = 0; i < otkCount; i += 1) {
        const keyPair = await xBoxKeyPairAsync();
        otks.push({
            deviceID,
            index: i + 1,
            publicKey: keyPair.publicKey,
            signature: await signPreKey(keyPair, signKeyPair),
        });
    }
    return { device, otks, payload };
}

async function signPreKey(
    preKeyPair: KeyPair,
    signKeyPair: KeyPair,
): Promise<Uint8Array> {
    return xSignAsync(
        preKeySignaturePayload(preKeyPair.publicKey),
        signKeyPair.secretKey,
    );
}
