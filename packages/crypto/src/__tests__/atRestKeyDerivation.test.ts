/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { describe, expect, test } from "vitest";

import { XUtils } from "../index.ts";

describe("XUtils.deriveLocalAtRestAesKey", () => {
    test("does not alias raw TweetNaCl identity secret bytes", () => {
        const identitySk = Uint8Array.from({ length: 64 }, (_v, i) => i + 1);

        const derived = XUtils.deriveLocalAtRestAesKey(identitySk, "tweetnacl");
        const legacy = XUtils.deriveLegacyLocalAtRestAesKey(
            identitySk,
            "tweetnacl",
        );

        expect(derived).toHaveLength(32);
        expect(legacy).not.toBeNull();
        expect(XUtils.bytesEqual(derived, identitySk.slice(0, 32))).toBe(false);
        expect(legacy && XUtils.bytesEqual(derived, legacy)).toBe(false);
    });

    test("keeps the FIPS derivation stable", () => {
        const identitySk = Uint8Array.from({ length: 96 }, (_v, i) => i + 3);

        expect(XUtils.deriveLocalAtRestAesKey(identitySk, "fips")).toEqual(
            XUtils.deriveLocalAtRestAesKey(identitySk, "fips"),
        );
        expect(
            XUtils.deriveLegacyLocalAtRestAesKey(identitySk, "fips"),
        ).toBeNull();
    });
});

describe("XUtils.wipe", () => {
    test("best-effort clears caller-visible bytes", () => {
        const secret = new Uint8Array([1, 2, 3]);

        XUtils.wipe(secret);

        expect([...secret]).toEqual([0, 0, 0]);
    });
});
