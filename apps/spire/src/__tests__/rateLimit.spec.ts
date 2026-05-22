/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { afterEach, describe, expect, it } from "vitest";

import {
    DEV_API_KEY_HEADER,
    devApiKeyMatches,
    devApiKeySkipsRateLimits,
} from "../server/rateLimit.ts";

const ORIGINAL_DEV_API_KEY = process.env["DEV_API_KEY"];
const ORIGINAL_DISABLE_RATE_LIMITS = process.env["SPIRE_DISABLE_RATE_LIMITS"];

function requestWithDevKey(value: string | undefined) {
    return {
        get(name: string): string | undefined {
            return name.toLowerCase() === DEV_API_KEY_HEADER
                ? value
                : undefined;
        },
    };
}

describe("dev API key matching", () => {
    afterEach(() => {
        if (ORIGINAL_DEV_API_KEY === undefined) {
            delete process.env["DEV_API_KEY"];
        } else {
            process.env["DEV_API_KEY"] = ORIGINAL_DEV_API_KEY;
        }

        if (ORIGINAL_DISABLE_RATE_LIMITS === undefined) {
            delete process.env["SPIRE_DISABLE_RATE_LIMITS"];
        } else {
            process.env["SPIRE_DISABLE_RATE_LIMITS"] =
                ORIGINAL_DISABLE_RATE_LIMITS;
        }
    });

    it("matches the configured dev API key exactly", () => {
        process.env["DEV_API_KEY"] = "test-secret";

        expect(devApiKeyMatches(requestWithDevKey("test-secret"))).toBe(true);
        expect(devApiKeyMatches(requestWithDevKey("wrong-secret"))).toBe(false);
        expect(devApiKeyMatches(requestWithDevKey(undefined))).toBe(false);
    });

    it("does not treat disabled rate limits as a dev API key match", () => {
        delete process.env["DEV_API_KEY"];
        process.env["SPIRE_DISABLE_RATE_LIMITS"] = "1";

        const req = requestWithDevKey(undefined);
        expect(devApiKeyMatches(req)).toBe(false);
        expect(devApiKeySkipsRateLimits(req)).toBe(true);
    });
});
