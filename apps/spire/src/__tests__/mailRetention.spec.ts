/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { afterEach, describe, expect, it } from "vitest";

import {
    DEFAULT_SERVER_MAIL_RETENTION_DAYS,
    serverMailRetentionCutoffIso,
    serverMailRetentionMs,
} from "../mailRetention.ts";

const MS_PER_DAY = 86_400_000;
const MS_PER_HOUR = 3_600_000;

describe("server mail retention config", () => {
    afterEach(() => {
        delete process.env["SPIRE_MAIL_RETENTION_DAYS"];
        delete process.env["SPIRE_MAIL_RETENTION_TTL"];
    });

    it("defaults to thirty days", () => {
        expect(serverMailRetentionMs()).toBe(
            DEFAULT_SERVER_MAIL_RETENTION_DAYS * MS_PER_DAY,
        );
    });

    it("accepts duration strings from SPIRE_MAIL_RETENTION_TTL", () => {
        process.env["SPIRE_MAIL_RETENTION_TTL"] = "6h";

        expect(serverMailRetentionMs()).toBe(6 * MS_PER_HOUR);
    });

    it("accepts day-count compatibility config", () => {
        process.env["SPIRE_MAIL_RETENTION_DAYS"] = "7";

        expect(serverMailRetentionMs()).toBe(7 * MS_PER_DAY);
    });

    it("prefers TTL config over day-count compatibility config", () => {
        process.env["SPIRE_MAIL_RETENTION_DAYS"] = "7";
        process.env["SPIRE_MAIL_RETENTION_TTL"] = "24h";

        expect(serverMailRetentionMs()).toBe(MS_PER_DAY);
    });

    it("clamps invalid and unsafe values to safe bounds", () => {
        process.env["SPIRE_MAIL_RETENTION_TTL"] = "not-a-duration";
        expect(serverMailRetentionMs()).toBe(
            DEFAULT_SERVER_MAIL_RETENTION_DAYS * MS_PER_DAY,
        );

        process.env["SPIRE_MAIL_RETENTION_TTL"] = "1m";
        expect(serverMailRetentionMs()).toBe(MS_PER_HOUR);

        process.env["SPIRE_MAIL_RETENTION_TTL"] = "999d";
        expect(serverMailRetentionMs()).toBe(365 * MS_PER_DAY);
    });

    it("uses the configured retention when building the cutoff", () => {
        process.env["SPIRE_MAIL_RETENTION_TTL"] = "24h";
        const now = Date.parse("2026-05-07T12:00:00.000Z");

        expect(serverMailRetentionCutoffIso(now)).toBe(
            "2026-05-06T12:00:00.000Z",
        );
    });
});
