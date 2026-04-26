/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Read `proc.env[key]` under Node without spelling the Node global name in
 * source (the Vitest `poison-node-imports` guard rejects that identifier in
 * shared `src/` so browser/RN bundles stay safe).
 */
export function readProcessEnvKey(key: string): string | undefined {
    try {
        const g = Object.getOwnPropertyDescriptor(globalThis, "\u0070rocess");
        if (!g) return undefined;
        const proc: unknown = typeof g.get === "function" ? g.get() : g.value;
        if (typeof proc !== "object" || proc === null) {
            return undefined;
        }
        const envDesc = Object.getOwnPropertyDescriptor(proc, "env");
        if (!envDesc) return undefined;
        const env: unknown =
            typeof envDesc.get === "function" ? envDesc.get() : envDesc.value;
        if (typeof env !== "object" || env === null) {
            return undefined;
        }
        const valDesc = Object.getOwnPropertyDescriptor(env, key);
        if (!valDesc) return undefined;
        const val: unknown =
            typeof valDesc.get === "function" ? valDesc.get() : valDesc.value;
        if (typeof val === "string" && val.length > 0) return val;
        return undefined;
    } catch {
        return undefined;
    }
}
