/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { describe, expect, it } from "vitest";

import {
    DEFAULT_SPIRE_API_PORT,
    resolveSpireListenPort,
} from "../spireListenPort.ts";

describe("resolveSpireListenPort", () => {
    it("uses the default when no explicit port is provided", () => {
        expect(resolveSpireListenPort(undefined)).toBe(DEFAULT_SPIRE_API_PORT);
    });

    it("honors explicit api port", () => {
        expect(resolveSpireListenPort(9000)).toBe(9000);
    });
});
