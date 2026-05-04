/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/** Minimum time the server keeps undelivered mail rows (hard cap). */
export const SERVER_MAIL_RETENTION_DAYS = 30;

const MS_PER_DAY = 86_400_000;

/**
 * ISO-8601 cutoff: mail with `time` strictly before this must not be retained
 * or returned from the inbox API.
 */
export function serverMailRetentionCutoffIso(
    nowMs: number = Date.now(),
): string {
    return new Date(
        nowMs - SERVER_MAIL_RETENTION_DAYS * MS_PER_DAY,
    ).toISOString();
}
