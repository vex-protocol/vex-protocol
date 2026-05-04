/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/** Matches the server-side minimum; clients cannot retain longer locally. */
export const MAX_LOCAL_MESSAGE_RETENTION_DAYS = 30;

/**
 * Clamps a user preference to 1…{@link MAX_LOCAL_MESSAGE_RETENTION_DAYS}.
 * Non-finite or missing values default to the maximum (keep up to the server cap).
 */
export function clampLocalMessageRetentionDays(
    days: null | number | undefined,
): number {
    if (days === null || days === undefined) {
        return MAX_LOCAL_MESSAGE_RETENTION_DAYS;
    }
    const n = Math.round(days);
    if (!Number.isFinite(n)) {
        return MAX_LOCAL_MESSAGE_RETENTION_DAYS;
    }
    return Math.min(MAX_LOCAL_MESSAGE_RETENTION_DAYS, Math.max(1, n));
}

const RETENTION_PREFIX = /^vex-retention:([1-9]|[12]\d|30)\n/;

/**
 * Prefixes plaintext with a machine-readable retention hint for other clients.
 * When `retentionHintDays` is omitted, returns `body` unchanged.
 */
export function formatVexRetentionEnvelope(
    body: string,
    retentionHintDays?: null | number,
): string {
    if (
        retentionHintDays === null ||
        retentionHintDays === undefined ||
        !Number.isFinite(retentionHintDays)
    ) {
        return body;
    }
    const d = clampLocalMessageRetentionDays(retentionHintDays);
    return `vex-retention:${String(d)}\n${body}`;
}

/**
 * Strips an optional first-line retention hint placed by cooperative clients.
 * Malicious peers can omit or forge this; local expiry still cannot exceed 30 days.
 */
export function stripVexRetentionEnvelope(plaintext: string): {
    body: string;
    retentionHintDays?: number;
} {
    const m = RETENTION_PREFIX.exec(plaintext);
    if (!m) {
        return { body: plaintext };
    }
    const hint = Math.min(
        MAX_LOCAL_MESSAGE_RETENTION_DAYS,
        Math.max(1, Number(m[1])),
    );
    return {
        body: plaintext.slice(m[0].length),
        retentionHintDays: hint,
    };
}
