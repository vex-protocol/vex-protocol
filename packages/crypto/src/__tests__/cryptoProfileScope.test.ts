/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import {
    enterCryptoProfileScope,
    getCryptoProfile,
    leaveCryptoProfileScope,
    setCryptoProfile,
    xBoxKeyPairAsync,
    xDHAsync,
    xSecretboxAsync,
    xSecretboxOpenAsync,
    XUtils,
} from "../index.js";

afterEach(() => {
    setCryptoProfile("tweetnacl");
});

test("leaveCryptoProfileScope without enter throws", () => {
    setCryptoProfile("tweetnacl");
    expect(() => {
        leaveCryptoProfileScope();
    }).toThrow(
        /leaveCryptoProfileScope called without a matching enterCryptoProfileScope/,
    );
});

test("nested enter/leave restores outer profile", () => {
    setCryptoProfile("tweetnacl");
    enterCryptoProfileScope("fips");
    expect(getCryptoProfile()).toBe("fips");
    enterCryptoProfileScope("fips");
    expect(getCryptoProfile()).toBe("fips");
    leaveCryptoProfileScope();
    expect(getCryptoProfile()).toBe("fips");
    leaveCryptoProfileScope();
    expect(getCryptoProfile()).toBe("tweetnacl");
});

test("concurrent fips scopes: overlapping decrypts stay on fips", async () => {
    setCryptoProfile("tweetnacl");
    enterCryptoProfileScope("fips");
    const alice = await xBoxKeyPairAsync();
    const bob = await xBoxKeyPairAsync();
    const shared = await xDHAsync(alice.secretKey, bob.publicKey);
    const nonce = new Uint8Array(24);
    nonce.set(crypto.getRandomValues(new Uint8Array(24)));
    const plaintext = XUtils.decodeUTF8("concurrent-scope");
    const ciphertext = await xSecretboxAsync(plaintext, nonce, shared);
    leaveCryptoProfileScope();
    expect(getCryptoProfile()).toBe("tweetnacl");

    const decryptOnce = async (delayMs: number): Promise<string> => {
        enterCryptoProfileScope("fips");
        try {
            if (delayMs > 0) {
                await new Promise((r) => setTimeout(r, delayMs));
            }
            const opened = await xSecretboxOpenAsync(ciphertext, nonce, shared);
            if (opened === null) {
                throw new Error("Expected decrypt under stacked fips scope.");
            }
            return XUtils.encodeUTF8(opened);
        } finally {
            leaveCryptoProfileScope();
        }
    };

    const [a, b] = await Promise.all([decryptOnce(0), decryptOnce(15)]);
    expect(a).toBe("concurrent-scope");
    expect(b).toBe("concurrent-scope");
    expect(getCryptoProfile()).toBe("tweetnacl");
});
