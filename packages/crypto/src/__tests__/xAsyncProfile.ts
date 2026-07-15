/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import {
    xBoxKeyPairAsync,
    xDHAsync,
    xSecretboxAsync,
    xSecretboxOpenAsync,
    xSignAsync,
    xSignKeyPairAsync,
    xSignOpenAsync,
    XUtils,
} from "../index.js";

test("async wrappers preserve sign/open semantics", async () => {
    const keys = await xSignKeyPairAsync();
    const message = XUtils.decodeUTF8("hello async");
    const signed = await xSignAsync(message, keys.secretKey);
    const opened = await xSignOpenAsync(signed, keys.publicKey);

    if (opened === null) {
        throw new Error("Expected signed message to verify.");
    }
    expect(XUtils.encodeUTF8(opened)).toBe("hello async");
});

test("async X25519 and secretbox roundtrip", async () => {
    const alice = await xBoxKeyPairAsync();
    const bob = await xBoxKeyPairAsync();
    const aliceShared = await xDHAsync(alice.secretKey, bob.publicKey);
    const bobShared = await xDHAsync(bob.secretKey, alice.publicKey);

    expect(XUtils.bytesEqual(aliceShared, bobShared)).toBe(true);

    const nonce = new Uint8Array(24);
    nonce.set(crypto.getRandomValues(new Uint8Array(24)));
    const plaintext = XUtils.decodeUTF8("portable async path");

    const ciphertext = await xSecretboxAsync(plaintext, nonce, aliceShared);
    const decrypted = await xSecretboxOpenAsync(ciphertext, nonce, bobShared);

    if (decrypted === null) {
        throw new Error("Expected ciphertext to decrypt.");
    }
    expect(XUtils.encodeUTF8(decrypted)).toBe("portable async path");
});
