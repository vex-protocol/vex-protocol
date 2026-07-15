/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { XKeyConvert, xSignKeyPairFromSecret, XUtils } from "@vex-chat/crypto";

/**
 * Produces the 32-byte at-rest key used by {@link Storage} (sqlite, memory) from
 * a hex signing secret, matching the derivation used by {@link Client.create}.
 */
export function resolveAtRestAesKeyFromSignKeyHex(
    privateKeyHex: string,
): Promise<Uint8Array> {
    const dec = XUtils.decodeHex(privateKeyHex);
    const sign = xSignKeyPairFromSecret(dec);
    const id = XKeyConvert.convertKeyPair(sign);
    if (!id) {
        throw new Error("Could not convert signing key to X25519 identity.");
    }
    return Promise.resolve(XUtils.deriveLocalAtRestAesKey(id.secretKey));
}
