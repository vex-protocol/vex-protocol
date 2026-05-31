/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { AddressInfo } from "node:net";

import express from "express";

import { afterEach, describe, expect, it } from "vitest";

import { getCliPasskeyPageRouter } from "../server/cliPasskeyPage.ts";

const servers: Array<{ close: () => void }> = [];

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.close();
    }
});

describe("CLI passkey page", () => {
    it("serves the browser WebAuthn bridge at /cli/passkey", async () => {
        const app = express();
        app.use(getCliPasskeyPageRouter());
        const server = app.listen(0);
        servers.push(server);
        const { port } = server.address() as AddressInfo;

        const res = await fetch(
            "http://127.0.0.1:" + String(port) + "/cli/passkey",
        );
        const html = await res.text();

        expect(res.status).toBe(200);
        expect(res.headers.get("cache-control")).toBe("no-store");
        expect(res.headers.get("content-security-policy")).toContain(
            "default-src 'none'",
        );
        expect(res.headers.get("content-security-policy")).not.toContain(
            "connect-src 'self' https:",
        );
        expect(res.headers.get("permissions-policy")).toContain(
            "publickey-credentials-create=(self)",
        );
        expect(html).toContain("Continue with your passkey.");
        expect(html).toContain("resolveTrustedApiBase");
        expect(html).toContain("Passkey link API origin is not trusted.");
        expect(html).toContain("navigator.credentials.create");
        expect(html).toContain("navigator.credentials.get");
    });
});
