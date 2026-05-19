/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { afterEach, describe, expect, it } from "vitest";

import { createFetchHttpClient, isHttpError } from "../http.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("FetchHttpClient", () => {
    it("preserves status metadata for empty JSON error responses", async () => {
        globalThis.fetch = () =>
            Promise.resolve(
                new Response(null, {
                    status: 401,
                    statusText: "Unauthorized",
                }),
            );

        const client = createFetchHttpClient();
        const err = await captureError(() =>
            client.post(
                "https://example.test/device/id/notifications",
                {},
                { responseType: "json" },
            ),
        );

        expect(isHttpError(err)).toBe(true);
        if (!isHttpError(err)) {
            throw err;
        }
        expect(err.response?.status).toBe(401);
        expect(err.response?.statusText).toBe("Unauthorized");
        expect(err.response?.data).toBeNull();
        expect(err.config.method).toBe("POST");
    });

    it("preserves status metadata for non-JSON error responses", async () => {
        globalThis.fetch = () =>
            Promise.resolve(
                new Response("plain failure", {
                    headers: { "Content-Type": "text/plain" },
                    status: 400,
                    statusText: "Bad Request",
                }),
            );

        const client = createFetchHttpClient();
        const err = await captureError(() =>
            client.get("https://example.test/status", {
                responseType: "json",
            }),
        );

        expect(isHttpError(err)).toBe(true);
        if (!isHttpError(err)) {
            throw err;
        }
        expect(err.response?.status).toBe(400);
        expect(err.response?.data).toBe("plain failure");
    });

    it("emits a final upload progress event for FormData payloads", async () => {
        globalThis.fetch = () =>
            Promise.resolve(new Response(new ArrayBuffer(0), { status: 200 }));

        const client = createFetchHttpClient();
        const events: { loaded: number; total?: number }[] = [];
        const payload = new FormData();
        payload.set("file", new Blob([new Uint8Array([1, 2, 3])]));
        payload.set("name", "ok");

        await client.post("https://example.test/file", payload, {
            onUploadProgress: (event) => {
                events.push(event);
            },
        });

        expect(events).toEqual([{ loaded: 5, total: 5 }]);
    });
});

async function captureError(fn: () => Promise<unknown>): Promise<unknown> {
    try {
        await fn();
    } catch (err: unknown) {
        return err;
    }
    throw new Error("Expected function to throw");
}
