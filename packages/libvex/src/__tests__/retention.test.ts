/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 */

import { describe, expect, it } from "vitest";

import {
    clampLocalMessageRetentionDays,
    effectiveMessageRetentionHintDays,
    formatVexRetentionEnvelope,
    MAX_LOCAL_MESSAGE_RETENTION_DAYS,
    stripVexRetentionEnvelope,
} from "../retention.js";

describe("retention", () => {
    it("clamps local retention to 1–30", () => {
        expect(clampLocalMessageRetentionDays(undefined)).toBe(30);
        expect(clampLocalMessageRetentionDays(0)).toBe(1);
        expect(clampLocalMessageRetentionDays(45)).toBe(30);
        expect(clampLocalMessageRetentionDays(7)).toBe(7);
    });

    it("round-trips envelope prefix", () => {
        const wrapped = formatVexRetentionEnvelope("hello", 7);
        expect(wrapped).toBe("vex-retention:7\nhello");
        expect(stripVexRetentionEnvelope(wrapped)).toEqual({
            body: "hello",
            retentionHintDays: 7,
        });
    });

    it("format without hint leaves body unchanged", () => {
        expect(formatVexRetentionEnvelope("plain", undefined)).toBe("plain");
    });

    it("MAX matches server contract constant name in docs", () => {
        expect(MAX_LOCAL_MESSAGE_RETENTION_DAYS).toBe(30);
    });

    it("effectiveMessageRetentionHintDays treats 0 and invalid as 30-day default", () => {
        expect(effectiveMessageRetentionHintDays(undefined)).toBe(30);
        expect(effectiveMessageRetentionHintDays(null)).toBe(30);
        expect(effectiveMessageRetentionHintDays(0)).toBe(30);
        expect(effectiveMessageRetentionHintDays(-3)).toBe(30);
        expect(effectiveMessageRetentionHintDays(Number.NaN)).toBe(30);
        expect(effectiveMessageRetentionHintDays(7)).toBe(7);
        expect(effectiveMessageRetentionHintDays(45)).toBe(30);
    });
});
