/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { config } from "dotenv";

const REQUIRED_ENV_VARS = ["DB_TYPE", "JWT_SECRET", "SPK"] as const;
const NORMALIZED_ENV_VARS = [
    ...REQUIRED_ENV_VARS,
    "API_PORT",
    "SPIRE_FIPS",
    "SPIRE_PASSKEY_RP_ID",
    "SPIRE_PASSKEY_RP_NAME",
    "SPIRE_PASSKEY_ORIGINS",
    "SPIRE_PASSKEY_IOS_APP_IDS",
    "SPIRE_PASSKEY_ANDROID_PACKAGE",
    "SPIRE_PASSKEY_ANDROID_FINGERPRINTS",
] as const;
const HEX_BYTES_RE = /^(?:[0-9a-fA-F]{2})+$/;
const TWEETNACL_SPK_HEX_LENGTH = 128;

export function isSpireFipsEnabled(value: string | undefined): boolean {
    const normalized = value == null ? "" : normalizeEnvValue(value);
    return normalized === "1" || normalized === "true";
}

/* Populate process.env with vars from .env and verify required vars are present. */
export function loadEnv(): void {
    config();
    normalizeConfiguredEnv();
    for (const required of REQUIRED_ENV_VARS) {
        if (!process.env[required]) {
            process.stderr.write(
                `Required environment variable '${required}' is not set. Please consult the README.\n`,
            );
            process.exit(1);
        }
    }
    validateSpireRuntimeEnv(process.env);
}

export function normalizeEnvValue(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
        return trimmed;
    }
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === `"` && last === `"`) || (first === `'` && last === `'`)) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

export function validateSpireRuntimeEnv(
    env: Record<string, string | undefined>,
): void {
    const spk = normalizeEnvValue(env["SPK"] ?? "");
    const jwtSecret = normalizeEnvValue(env["JWT_SECRET"] ?? "");
    if (!HEX_BYTES_RE.test(spk)) {
        throw new Error(
            "SPK must be an even-length hex string. Generate one with `pnpm --filter @vex-chat/spire gen-spk` or `gen-spk-fips`.",
        );
    }

    if (isSpireFipsEnabled(env["SPIRE_FIPS"])) {
        if (spk.length === TWEETNACL_SPK_HEX_LENGTH) {
            throw new Error(
                "SPIRE_FIPS=true requires an SPK from `pnpm --filter @vex-chat/spire gen-spk-fips`; the configured SPK looks like a tweetnacl key.",
            );
        }
    } else if (spk.length !== TWEETNACL_SPK_HEX_LENGTH) {
        throw new Error(
            "SPIRE_FIPS is not enabled, so SPK must be 128 hex characters from `pnpm --filter @vex-chat/spire gen-spk`.",
        );
    }

    if (jwtSecret.length === 0) {
        throw new Error(
            "JWT_SECRET must be set. Generate one with `pnpm --filter @vex-chat/spire gen-spk` or `gen-spk-fips`.",
        );
    }
    if (jwtSecret === spk) {
        throw new Error("JWT_SECRET must be separate from SPK.");
    }
}

function normalizeConfiguredEnv(): void {
    for (const name of NORMALIZED_ENV_VARS) {
        const value = process.env[name];
        if (value != null) {
            process.env[name] = normalizeEnvValue(value);
        }
    }
}
