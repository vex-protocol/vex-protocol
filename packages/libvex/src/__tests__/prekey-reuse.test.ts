/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { PreKeysCrypto, UnsavedPreKey, XKeyRing } from "../types/index.js";
import type { CryptoProfile, KeyPair } from "@vex-chat/crypto";

import {
    setCryptoProfile,
    xBoxKeyPairAsync,
    xEcdhKeyPairFromEcdsaKeyPairAsync,
    XKeyConvert,
    xPreKeySignaturePayload,
    xSignAsync,
    xSignKeyPair,
    xSignKeyPairAsync,
    xSignOpenAsync,
    XUtils,
} from "@vex-chat/crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Client } from "../Client.js";

import { MemoryStorage } from "./harness/memory-storage.js";

interface KeyRingHarness {
    createPreKey: (kind: "one-time" | "signed") => Promise<UnsavedPreKey>;
    cryptoProfile: CryptoProfile;
    database: MemoryStorage;
    idKeys: KeyPair;
    isPreKeySignedByCurrentDevice: (preKey: PreKeysCrypto) => Promise<boolean>;
    runWithThisCryptoProfile: <T>(fn: () => Promise<T>) => Promise<T>;
    sessionRecords: Record<string, unknown>;
    signKeys: KeyPair;
    xKeyRing?: XKeyRing;
}

const clientMethods = Client.prototype as unknown as {
    createPreKey: (kind: "one-time" | "signed") => Promise<UnsavedPreKey>;
    isPreKeySignedByCurrentDevice: (preKey: PreKeysCrypto) => Promise<boolean>;
    populateKeyRing: () => Promise<void>;
    runWithThisCryptoProfile: <T>(fn: () => Promise<T>) => Promise<T>;
};

async function isValidFor(
    preKey: PreKeysCrypto,
    signKeys: KeyPair,
    profile: CryptoProfile = "tweetnacl",
): Promise<boolean> {
    setCryptoProfile(profile);
    const opened = await xSignOpenAsync(preKey.signature, signKeys.publicKey);
    const payload = xPreKeySignaturePayload(
        preKey.keyPair.publicKey,
        "signed",
        profile,
    );
    return Boolean(opened && XUtils.bytesEqual(opened, payload));
}

async function makeSignedPreKey(
    signKeys: KeyPair,
    profile: CryptoProfile = "tweetnacl",
): Promise<UnsavedPreKey> {
    setCryptoProfile(profile);
    const keyPair = await xBoxKeyPairAsync();
    const payload = xPreKeySignaturePayload(
        keyPair.publicKey,
        "signed",
        profile,
    );
    return {
        keyPair,
        signature: await xSignAsync(payload, signKeys.secretKey),
    };
}

describe("local signed prekey reuse", () => {
    beforeEach(() => {
        setCryptoProfile("tweetnacl");
    });

    afterEach(() => {
        setCryptoProfile("tweetnacl");
    });

    it("regenerates a stored prekey signed by a different device key", async () => {
        const staleSignKeys = xSignKeyPair();
        const currentSignKeys = xSignKeyPair();
        const idKeys = XKeyConvert.convertKeyPair(currentSignKeys);
        if (!idKeys) {
            throw new Error("Could not convert current signing key.");
        }

        const storage = new MemoryStorage(new Uint8Array(32).fill(7));
        await storage.init();
        await storage.savePreKeys(
            [await makeSignedPreKey(staleSignKeys)],
            false,
        );

        const harness: KeyRingHarness = {
            createPreKey: clientMethods.createPreKey,
            cryptoProfile: "tweetnacl",
            database: storage,
            idKeys,
            isPreKeySignedByCurrentDevice:
                clientMethods.isPreKeySignedByCurrentDevice,
            runWithThisCryptoProfile: clientMethods.runWithThisCryptoProfile,
            sessionRecords: {},
            signKeys: currentSignKeys,
        };

        await clientMethods.populateKeyRing.call(harness);

        expect(harness.xKeyRing).toBeDefined();
        expect(
            await isValidFor(harness.xKeyRing!.preKeys, currentSignKeys),
        ).toBe(true);
        expect(await isValidFor(harness.xKeyRing!.preKeys, staleSignKeys)).toBe(
            false,
        );

        const persisted = await storage.getPreKeys();
        expect(persisted).not.toBeNull();
        expect(await isValidFor(persisted!, currentSignKeys)).toBe(true);
    });

    it("reuses a valid FIPS prekey when the global profile is tweetnacl", async () => {
        setCryptoProfile("fips");
        const currentSignKeys = await xSignKeyPairAsync();
        const idKeys = await xEcdhKeyPairFromEcdsaKeyPairAsync(currentSignKeys);
        const storedPreKey = await makeSignedPreKey(currentSignKeys, "fips");

        const storage = new MemoryStorage(new Uint8Array(32).fill(8));
        await storage.init();
        await storage.savePreKeys([storedPreKey], false);

        setCryptoProfile("tweetnacl");
        const harness: KeyRingHarness = {
            createPreKey: clientMethods.createPreKey,
            cryptoProfile: "fips",
            database: storage,
            idKeys,
            isPreKeySignedByCurrentDevice:
                clientMethods.isPreKeySignedByCurrentDevice,
            runWithThisCryptoProfile: clientMethods.runWithThisCryptoProfile,
            sessionRecords: {},
            signKeys: currentSignKeys,
        };

        await clientMethods.populateKeyRing.call(harness);

        expect(harness.xKeyRing).toBeDefined();
        expect(harness.xKeyRing!.preKeys.index).toBe(1);
        expect(
            XUtils.bytesEqual(
                harness.xKeyRing!.preKeys.keyPair.publicKey,
                storedPreKey.keyPair.publicKey,
            ),
        ).toBe(true);
        expect(
            await isValidFor(
                harness.xKeyRing!.preKeys,
                currentSignKeys,
                "fips",
            ),
        ).toBe(true);
    });
});
