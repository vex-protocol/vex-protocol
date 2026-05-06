/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Request } from "express";

import { afterEach, describe, expect, it } from "vitest";

import {
    DEV_API_KEY_HEADER,
    devApiKeySkipsRateLimits,
} from "../server/rateLimit.ts";

function reqWithDevKey(value: string): Request {
    return {
        get: (name: string) =>
            name === DEV_API_KEY_HEADER ? value : undefined,
    } as Request;
}

describe("production safety defaults", () => {
    afterEach(() => {
        delete process.env["DEV_API_KEY"];
        delete process.env["NODE_ENV"];
        delete process.env["SPIRE_DISABLE_RATE_LIMITS"];
    });

    it("allows dev API key rate-limit bypass outside production", () => {
        process.env["DEV_API_KEY"] = "secret";
        expect(devApiKeySkipsRateLimits(reqWithDevKey("secret"))).toBe(true);
    });

    it("disables dev API key rate-limit bypass in production", () => {
        process.env["DEV_API_KEY"] = "secret";
        process.env["NODE_ENV"] = "production";
        expect(devApiKeySkipsRateLimits(reqWithDevKey("secret"))).toBe(false);
    });

    it("disables SPIRE_DISABLE_RATE_LIMITS in production", () => {
        process.env["NODE_ENV"] = "production";
        process.env["SPIRE_DISABLE_RATE_LIMITS"] = "true";
        expect(devApiKeySkipsRateLimits(reqWithDevKey(""))).toBe(false);
    });
});
