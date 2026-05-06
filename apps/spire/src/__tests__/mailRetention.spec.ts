/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { describe, expect, it } from "vitest";

import {
    resolveServerMailRetentionMs,
    serverMailRetentionCutoffIso,
} from "../mailRetention.ts";

describe("server mail retention policy", () => {
    it("defaults to 30 days", () => {
        expect(resolveServerMailRetentionMs({})).toBe(30 * 86_400_000);
    });

    it("accepts duration-style TTLs", () => {
        expect(
            resolveServerMailRetentionMs({
                SPIRE_MAIL_RETENTION_TTL: "12h",
            }),
        ).toBe(12 * 60 * 60 * 1000);
    });

    it("accepts day-count compatibility env", () => {
        expect(
            resolveServerMailRetentionMs({
                SPIRE_MAIL_RETENTION_DAYS: "2.5",
            }),
        ).toBe(2.5 * 86_400_000);
    });

    it("rejects unsafe tiny TTLs", () => {
        expect(() =>
            resolveServerMailRetentionMs({
                SPIRE_MAIL_RETENTION_TTL: "1m",
            }),
        ).toThrow(/at least 5 minutes/);
    });

    it("uses the configured duration when computing cutoffs", () => {
        const cutoff = serverMailRetentionCutoffIso(
            Date.parse("2026-05-05T12:00:00.000Z"),
            60 * 60 * 1000,
        );
        expect(cutoff).toBe("2026-05-05T11:00:00.000Z");
    });
});
