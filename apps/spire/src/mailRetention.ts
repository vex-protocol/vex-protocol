/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import parseDuration from "parse-duration";

/** Default time the server keeps undelivered mail rows. */
export const DEFAULT_SERVER_MAIL_RETENTION_TTL = "30d";

export const SERVER_MAIL_RETENTION_ENV = "SPIRE_MAIL_RETENTION_TTL";
export const SERVER_MAIL_RETENTION_DAYS_ENV = "SPIRE_MAIL_RETENTION_DAYS";

const DEFAULT_SERVER_MAIL_RETENTION_MS = 30 * 86_400_000;
const MIN_SERVER_MAIL_RETENTION_MS = 5 * 60 * 1000;
const MAX_SERVER_MAIL_RETENTION_MS = 365 * 86_400_000;

type RetentionEnv = Partial<
    Record<"SPIRE_MAIL_RETENTION_DAYS" | "SPIRE_MAIL_RETENTION_TTL", string>
>;

export function resolveServerMailRetentionMs(
    env: RetentionEnv = process.env,
): number {
    const ttl = env[SERVER_MAIL_RETENTION_ENV]?.trim();
    if (ttl) {
        const parsed = parseDuration(ttl, "ms");
        return assertRetentionBounds(
            parsed ?? Number.NaN,
            SERVER_MAIL_RETENTION_ENV,
        );
    }

    const days = env[SERVER_MAIL_RETENTION_DAYS_ENV]?.trim();
    if (days) {
        return assertRetentionBounds(
            parseRetentionDays(days),
            SERVER_MAIL_RETENTION_DAYS_ENV,
        );
    }

    return DEFAULT_SERVER_MAIL_RETENTION_MS;
}

/**
 * ISO-8601 cutoff: mail with `time` strictly before this must not be retained
 * or returned from the inbox API.
 */
export function serverMailRetentionCutoffIso(
    nowMs: number = Date.now(),
    retentionMs: number = resolveServerMailRetentionMs(),
): string {
    return new Date(nowMs - retentionMs).toISOString();
}

function assertRetentionBounds(ms: number, source: string): number {
    if (!Number.isFinite(ms) || ms <= 0) {
        throw new Error(`${source} must resolve to a positive duration.`);
    }
    if (ms < MIN_SERVER_MAIL_RETENTION_MS) {
        throw new Error(
            `${source} must be at least 5 minutes for safe clock skew handling.`,
        );
    }
    if (ms > MAX_SERVER_MAIL_RETENTION_MS) {
        throw new Error(`${source} must be no more than 365 days.`);
    }
    return ms;
}

function parseRetentionDays(days: string): number {
    if (!/^\d+(\.\d+)?$/.test(days)) {
        throw new Error(
            `${SERVER_MAIL_RETENTION_DAYS_ENV} must be a positive number of days.`,
        );
    }
    return Number(days) * 86_400_000;
}
