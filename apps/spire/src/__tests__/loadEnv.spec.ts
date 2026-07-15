/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { describe, expect, it } from "vitest";

import {
    normalizeEnvValue,
    validateSpireRuntimeEnv,
} from "../utils/loadEnv.ts";

const TWEETNACL_SPK = "ab".repeat(64);
const JWT_SECRET = "ef".repeat(32);

describe("normalizeEnvValue", () => {
    it("strips matching quotes from compose/dotenv values", () => {
        expect(normalizeEnvValue(`"${TWEETNACL_SPK}"`)).toBe(TWEETNACL_SPK);
        expect(normalizeEnvValue(`'${JWT_SECRET}'`)).toBe(JWT_SECRET);
    });

    it("trims whitespace without stripping unmatched quotes", () => {
        expect(normalizeEnvValue(`  ${TWEETNACL_SPK}  `)).toBe(TWEETNACL_SPK);
        expect(normalizeEnvValue(`"${TWEETNACL_SPK}`)).toBe(
            `"${TWEETNACL_SPK}`,
        );
    });
});

describe("validateSpireRuntimeEnv", () => {
    it("accepts quoted compose-safe tweetnacl keys", () => {
        expect(() => {
            validateSpireRuntimeEnv({
                JWT_SECRET: `"${JWT_SECRET}"`,
                SPK: `"${TWEETNACL_SPK}"`,
            });
        }).not.toThrow();
    });

    it("rejects non-hex SPK values before crypto init", () => {
        expect(() => {
            validateSpireRuntimeEnv({
                JWT_SECRET,
                SPK: `"${TWEETNACL_SPK}`,
            });
        }).toThrow(/SPK must be an even-length hex string/);
    });

    it("rejects an SPK with the wrong length", () => {
        expect(() => {
            validateSpireRuntimeEnv({
                JWT_SECRET,
                SPK: "cd".repeat(90),
            });
        }).toThrow(/SPK must be 128 hex characters/);
    });

    it("rejects reusing SPK as JWT_SECRET", () => {
        expect(() => {
            validateSpireRuntimeEnv({
                JWT_SECRET: TWEETNACL_SPK,
                SPK: TWEETNACL_SPK,
            });
        }).toThrow(/JWT_SECRET must be separate from SPK/);
    });
});
