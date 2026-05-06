/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { config } from "dotenv";

import { resolveServerMailRetentionMs } from "../mailRetention.ts";

/* Populate process.env with vars from .env and verify required vars are present. */
export function loadEnv(): void {
    config();
    const requiredEnvVars: string[] = ["DB_TYPE", "JWT_SECRET", "SPK"];
    for (const required of requiredEnvVars) {
        if (process.env[required] === undefined) {
            process.stderr.write(
                `Required environment variable '${required}' is not set. Please consult the README.\n`,
            );
            process.exit(1);
        }
    }

    try {
        resolveServerMailRetentionMs();
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Invalid mail retention configuration: ${msg}\n`);
        process.exit(1);
    }

    if (process.env["NODE_ENV"] === "production") {
        const bypasses = ["DEV_API_KEY", "SPIRE_DISABLE_RATE_LIMITS"].filter(
            (key) => (process.env[key]?.trim() ?? "").length > 0,
        );
        if (bypasses.length > 0) {
            process.stderr.write(
                `Refusing production startup with dev-only bypass variable(s): ${bypasses.join(", ")}.\n`,
            );
            process.exit(1);
        }
    }
}
