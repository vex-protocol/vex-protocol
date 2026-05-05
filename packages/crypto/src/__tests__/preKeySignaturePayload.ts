/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { describe, expect, test } from "vitest";

import { xPreKeySignaturePayloadV2, XUtils } from "../index.ts";

describe("xPreKeySignaturePayloadV2", () => {
    test("is deterministic for the same prekey metadata", () => {
        const input = {
            cryptoProfile: "tweetnacl" as const,
            deviceID: "device-a",
            keyIndex: 7,
            keyType: "one_time_prekey" as const,
            publicKey: XUtils.decodeHex("010203"),
        };

        expect(xPreKeySignaturePayloadV2(input)).toEqual(
            xPreKeySignaturePayloadV2(input),
        );
    });

    test("domain-separates key type, profile, device, and index", () => {
        const base = {
            cryptoProfile: "tweetnacl" as const,
            deviceID: "device-a",
            keyIndex: 7,
            keyType: "one_time_prekey" as const,
            publicKey: XUtils.decodeHex("010203"),
        };
        const encoded = new Set(
            [
                base,
                { ...base, cryptoProfile: "fips" as const },
                { ...base, deviceID: "device-b" },
                { ...base, keyIndex: 8 },
                { ...base, keyType: "signed_prekey" as const },
            ].map((input) =>
                XUtils.encodeHex(xPreKeySignaturePayloadV2(input)),
            ),
        );

        expect(encoded.size).toBe(5);
    });
});
