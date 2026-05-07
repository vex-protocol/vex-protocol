/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import parseDuration from "parse-duration";

export const DEFAULT_SERVER_MAIL_RETENTION_DAYS = 30;

const MS_PER_DAY = 86_400_000;
const DEFAULT_SERVER_MAIL_RETENTION_MS =
    DEFAULT_SERVER_MAIL_RETENTION_DAYS * MS_PER_DAY;
const MIN_SERVER_MAIL_RETENTION_MS = 60 * 60 * 1000;
const MAX_SERVER_MAIL_RETENTION_MS = 365 * MS_PER_DAY;

/**
 * ISO-8601 cutoff: mail with `time` strictly before this must not be retained
 * or returned from the inbox API.
 */
export function serverMailRetentionCutoffIso(
    nowMs: number = Date.now(),
): string {
    return new Date(nowMs - serverMailRetentionMs()).toISOString();
}

export function serverMailRetentionMs(): number {
    const ttl = process.env["SPIRE_MAIL_RETENTION_TTL"]?.trim();
    if (ttl) {
        const parsed = parseDuration(ttl, "ms");
        return clampRetentionMs(parsed);
    }

    const days = process.env["SPIRE_MAIL_RETENTION_DAYS"]?.trim();
    if (days) {
        const parsed = Number(days);
        return clampRetentionMs(
            Number.isFinite(parsed) ? parsed * MS_PER_DAY : undefined,
        );
    }

    return DEFAULT_SERVER_MAIL_RETENTION_MS;
}

function clampRetentionMs(value: null | number | undefined): number {
    if (!Number.isFinite(value) || value === undefined || value === null) {
        return DEFAULT_SERVER_MAIL_RETENTION_MS;
    }
    return Math.min(
        MAX_SERVER_MAIL_RETENTION_MS,
        Math.max(MIN_SERVER_MAIL_RETENTION_MS, Math.floor(value)),
    );
}
