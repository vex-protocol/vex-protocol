/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { CryptoProfile, KeyPair } from "@vex-chat/crypto";
import type { Device, KeyBundle, KeyBundleEntry } from "@vex-chat/types";

import {
    setCryptoProfile,
    xBoxKeyPairAsync,
    xEcdhKeyPairFromEcdsaKeyPairAsync,
    xPreKeySignaturePayload,
    xSignAsync,
    xSignKeyPairAsync,
    XUtils,
} from "@vex-chat/crypto";

import { afterEach, describe, expect, it } from "vitest";

import { verifyKeyBundleSignatures } from "../utils/verifyKeyBundle.js";

describe.sequential("verifyKeyBundleSignatures", () => {
    afterEach(() => {
        setCryptoProfile("tweetnacl");
    });

    it("accepts a valid tweetnacl key bundle", async () => {
        const { device, keyBundle } = await makeBundle("tweetnacl");

        await expect(
            verifyKeyBundleSignatures(keyBundle, device, "tweetnacl"),
        ).resolves.toBeUndefined();
    });

    it("rejects a tampered signed prekey public key", async () => {
        const { device, keyBundle } = await makeBundle("tweetnacl");
        const tampered = cloneBundle(keyBundle);
        tampered.preKey.publicKey = flipFirstByte(tampered.preKey.publicKey);

        await expect(
            verifyKeyBundleSignatures(tampered, device, "tweetnacl"),
        ).rejects.toThrow("signed prekey signature is invalid");
    });

    it("rejects a tampered one-time prekey public key", async () => {
        const { device, keyBundle } = await makeBundle("tweetnacl", true);
        const tampered = cloneBundle(keyBundle);
        if (!tampered.otk) {
            throw new Error("Expected OTK fixture.");
        }
        tampered.otk.publicKey = flipFirstByte(tampered.otk.publicKey);

        await expect(
            verifyKeyBundleSignatures(tampered, device, "tweetnacl"),
        ).rejects.toThrow("one-time prekey signature is invalid");
    });

    it("rejects a bundle identity key that does not match the device", async () => {
        const { device, keyBundle } = await makeBundle("tweetnacl");
        const other = await xSignKeyPairAsync();
        const tampered = cloneBundle(keyBundle);
        tampered.signKey = other.publicKey;

        await expect(
            verifyKeyBundleSignatures(tampered, device, "tweetnacl"),
        ).rejects.toThrow("identity key does not match");
    });

    it("accepts a valid FIPS key bundle", async () => {
        const { device, keyBundle } = await makeBundle("fips", true);

        await expect(
            verifyKeyBundleSignatures(keyBundle, device, "fips"),
        ).resolves.toBeUndefined();
    });
});

function cloneBundle(bundle: KeyBundle): KeyBundle {
    return {
        ...(bundle.otk ? { otk: cloneEntry(bundle.otk) } : {}),
        preKey: cloneEntry(bundle.preKey),
        signKey: Uint8Array.from(bundle.signKey),
    };
}

function cloneEntry(entry: KeyBundleEntry): KeyBundleEntry {
    return {
        deviceID: entry.deviceID,
        index: entry.index,
        publicKey: Uint8Array.from(entry.publicKey),
        signature: Uint8Array.from(entry.signature),
    };
}

function flipFirstByte(value: Uint8Array): Uint8Array {
    const out = Uint8Array.from(value);
    const first = out[0];
    if (first === undefined) {
        throw new Error("Cannot tamper empty byte array.");
    }
    out[0] = first ^ 0xff;
    return out;
}

async function makeBundle(
    profile: CryptoProfile,
    includeOtk = false,
): Promise<{ device: Device; keyBundle: KeyBundle }> {
    setCryptoProfile(profile);
    const signKeys = await xSignKeyPairAsync();
    const identityPublic =
        profile === "fips"
            ? (await xEcdhKeyPairFromEcdsaKeyPairAsync(signKeys)).publicKey
            : signKeys.publicKey;
    const device: Device = {
        deleted: false,
        deviceID: "device-a",
        lastLogin: new Date(0).toISOString(),
        name: "test-device",
        owner: "user-a",
        signKey: XUtils.encodeHex(signKeys.publicKey),
    };

    const keyBundle: KeyBundle = {
        preKey: await makeBundleEntry(
            signKeys,
            profile,
            device.deviceID,
            1,
            "signed",
        ),
        signKey: identityPublic,
    };
    if (includeOtk) {
        keyBundle.otk = await makeBundleEntry(
            signKeys,
            profile,
            device.deviceID,
            2,
            "one-time",
        );
    }

    return { device, keyBundle };
}

async function makeBundleEntry(
    signKeys: KeyPair,
    profile: CryptoProfile,
    deviceID: string,
    index: number,
    kind: "one-time" | "signed",
): Promise<KeyBundleEntry> {
    const preKey = await xBoxKeyPairAsync();
    const payload = xPreKeySignaturePayload(preKey.publicKey, kind, profile);
    return {
        deviceID,
        index,
        publicKey: preKey.publicKey,
        signature: await xSignAsync(payload, signKeys.secretKey),
    };
}
