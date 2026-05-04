/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { afterEach, describe, expect, it } from "vitest";

import {
    buildAppleAppSiteAssociation,
    buildAssetLinks,
    normalizeFingerprint,
} from "../server/wellKnown.ts";

const PASSKEY_ENV_VARS = [
    "SPIRE_PASSKEY_IOS_APP_IDS",
    "SPIRE_PASSKEY_ANDROID_PACKAGE",
    "SPIRE_PASSKEY_ANDROID_FINGERPRINTS",
] as const;

afterEach(() => {
    for (const v of PASSKEY_ENV_VARS) {
        process.env[v] = "";
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete process.env[v];
    }
});

describe("normalizeFingerprint", () => {
    it("normalizes lower-case hex without colons", () => {
        const out = normalizeFingerprint(
            "7d94dbdfc92da8bba1a79b64e117ad700a69daa5a0eb00a912a44efc5f6b7c42",
        );
        expect(out).toBe(
            "7D:94:DB:DF:C9:2D:A8:BB:A1:A7:9B:64:E1:17:AD:70:0A:69:DA:A5:A0:EB:00:A9:12:A4:4E:FC:5F:6B:7C:42",
        );
    });

    it("preserves a correctly-formatted colon-separated value", () => {
        const input =
            "7D:94:DB:DF:C9:2D:A8:BB:A1:A7:9B:64:E1:17:AD:70:0A:69:DA:A5:A0:EB:00:A9:12:A4:4E:FC:5F:6B:7C:42";
        expect(normalizeFingerprint(input)).toBe(input);
    });

    it("rejects values that are too short", () => {
        expect(normalizeFingerprint("AB:CD:EF")).toBeNull();
    });

    it("rejects non-hex characters", () => {
        expect(
            normalizeFingerprint(
                "ZZ:94:DB:DF:C9:2D:A8:BB:A1:A7:9B:64:E1:17:AD:70:0A:69:DA:A5:A0:EB:00:A9:12:A4:4E:FC:5F:6B:7C:42",
            ),
        ).toBeNull();
    });
});

describe("buildAppleAppSiteAssociation", () => {
    it("returns null when SPIRE_PASSKEY_IOS_APP_IDS is unset", () => {
        expect(buildAppleAppSiteAssociation()).toBeNull();
    });

    it("returns the AASA body with parsed app IDs", () => {
        process.env["SPIRE_PASSKEY_IOS_APP_IDS"] =
            "ABCDE12345.chat.vex.mobile, ABCDE12345.chat.vex.mobile.dev";
        expect(buildAppleAppSiteAssociation()).toEqual({
            webcredentials: {
                apps: [
                    "ABCDE12345.chat.vex.mobile",
                    "ABCDE12345.chat.vex.mobile.dev",
                ],
            },
        });
    });
});

describe("buildAssetLinks", () => {
    it("returns null when package or fingerprints are unset", () => {
        expect(buildAssetLinks()).toBeNull();

        process.env["SPIRE_PASSKEY_ANDROID_PACKAGE"] = "chat.vex.mobile";
        expect(buildAssetLinks()).toBeNull();
    });

    it("returns the asset-links body with normalized fingerprints", () => {
        process.env["SPIRE_PASSKEY_ANDROID_PACKAGE"] = "chat.vex.mobile";
        process.env["SPIRE_PASSKEY_ANDROID_FINGERPRINTS"] =
            "7d94dbdfc92da8bba1a79b64e117ad700a69daa5a0eb00a912a44efc5f6b7c42, 5C:13:F0:E4:EE:11:67:A4:9C:04:EB:C8:03:3E:05:8F:44:50:BD:AE:36:AA:15:B6:4F:83:7C:AC:24:0F:D2:82";
        const body = buildAssetLinks();
        expect(body).toEqual([
            {
                relation: [
                    "delegate_permission/common.get_login_creds",
                    "delegate_permission/common.handle_all_urls",
                ],
                target: {
                    namespace: "android_app",
                    package_name: "chat.vex.mobile",
                    sha256_cert_fingerprints: [
                        "7D:94:DB:DF:C9:2D:A8:BB:A1:A7:9B:64:E1:17:AD:70:0A:69:DA:A5:A0:EB:00:A9:12:A4:4E:FC:5F:6B:7C:42",
                        "5C:13:F0:E4:EE:11:67:A4:9C:04:EB:C8:03:3E:05:8F:44:50:BD:AE:36:AA:15:B6:4F:83:7C:AC:24:0F:D2:82",
                    ],
                },
            },
        ]);
    });

    it("drops malformed fingerprints and returns null when none survive", () => {
        process.env["SPIRE_PASSKEY_ANDROID_PACKAGE"] = "chat.vex.mobile";
        process.env["SPIRE_PASSKEY_ANDROID_FINGERPRINTS"] = "not-a-hash, ZZ:CD";
        expect(buildAssetLinks()).toBeNull();
    });
});
