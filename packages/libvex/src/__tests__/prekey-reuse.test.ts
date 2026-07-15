/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { PreKeysCrypto, UnsavedPreKey, XKeyRing } from "../types/index.js";
import type { KeyPair } from "@vex-chat/crypto";

import {
    xBoxKeyPairAsync,
    XKeyConvert,
    xPreKeySignaturePayload,
    xSignAsync,
    xSignKeyPair,
    xSignOpenAsync,
    XUtils,
} from "@vex-chat/crypto";

import { describe, expect, it } from "vitest";

import { Client } from "../Client.js";

import { MemoryStorage } from "./harness/memory-storage.js";

interface KeyRingHarness {
    createPreKey: (kind: "one-time" | "signed") => Promise<UnsavedPreKey>;
    database: MemoryStorage;
    idKeys: KeyPair;
    isPreKeySignedByCurrentDevice: (preKey: PreKeysCrypto) => Promise<boolean>;
    runCrypto: <T>(fn: () => Promise<T>) => Promise<T>;
    sessionRecords: Record<string, unknown>;
    signKeys: KeyPair;
    xKeyRing?: XKeyRing;
}

const clientMethods = Client.prototype as unknown as {
    createPreKey: (kind: "one-time" | "signed") => Promise<UnsavedPreKey>;
    isPreKeySignedByCurrentDevice: (preKey: PreKeysCrypto) => Promise<boolean>;
    populateKeyRing: () => Promise<void>;
    runCrypto: <T>(fn: () => Promise<T>) => Promise<T>;
};

async function isValidFor(
    preKey: PreKeysCrypto,
    signKeys: KeyPair,
): Promise<boolean> {
    const opened = await xSignOpenAsync(preKey.signature, signKeys.publicKey);
    const payload = xPreKeySignaturePayload(preKey.keyPair.publicKey, "signed");
    return Boolean(opened && XUtils.bytesEqual(opened, payload));
}

async function makeSignedPreKey(signKeys: KeyPair): Promise<UnsavedPreKey> {
    const keyPair = await xBoxKeyPairAsync();
    const payload = xPreKeySignaturePayload(keyPair.publicKey, "signed");
    return {
        keyPair,
        signature: await xSignAsync(payload, signKeys.secretKey),
    };
}

describe("local signed prekey reuse", () => {
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
            database: storage,
            idKeys,
            isPreKeySignedByCurrentDevice:
                clientMethods.isPreKeySignedByCurrentDevice,
            runCrypto: clientMethods.runCrypto,
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
});
