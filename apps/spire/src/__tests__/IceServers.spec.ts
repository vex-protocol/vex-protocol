/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveIceServersFromEnv } from "../IceServers.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
    delete process.env["CLOUDFLARE_TURN_API_TOKEN"];
    delete process.env["CLOUDFLARE_TURN_KEY_ID"];
    delete process.env["SPIRE_CLOUDFLARE_TURN_API_TOKEN"];
    delete process.env["SPIRE_CLOUDFLARE_TURN_ENDPOINT"];
    delete process.env["SPIRE_CLOUDFLARE_TURN_KEY_ID"];
    delete process.env["SPIRE_CLOUDFLARE_TURN_TIMEOUT_MS"];
    delete process.env["SPIRE_CLOUDFLARE_TURN_TTL_SECONDS"];
    delete process.env["SPIRE_ICE_SERVERS"];
    delete process.env["SPIRE_STUN_URLS"];
    delete process.env["SPIRE_TURN_CREDENTIAL"];
    delete process.env["SPIRE_TURN_URLS"];
    delete process.env["SPIRE_TURN_USERNAME"];
    delete process.env["TURN_KEY_API_TOKEN"];
    delete process.env["TURN_KEY_ID"];
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe("resolveIceServersFromEnv", () => {
    it("uses SPIRE_ICE_SERVERS as a full override", async () => {
        process.env["SPIRE_ICE_SERVERS"] = JSON.stringify([
            {
                urls: ["stun:override.example:3478"],
            },
        ]);
        process.env["SPIRE_STUN_URLS"] = "stun:ignored.example:3478";
        process.env["SPIRE_CLOUDFLARE_TURN_KEY_ID"] = "turn-key";
        process.env["SPIRE_CLOUDFLARE_TURN_API_TOKEN"] = "secret";
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;

        await expect(resolveIceServersFromEnv()).resolves.toEqual([
            {
                urls: ["stun:override.example:3478"],
            },
        ]);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("combines static STUN and TURN env vars", async () => {
        process.env["SPIRE_STUN_URLS"] =
            "stun:one.example:3478, stun:two.example:3478";
        process.env["SPIRE_TURN_URLS"] =
            "turn:turn.example:3478?transport=udp, turns:turn.example:443?transport=tcp";
        process.env["SPIRE_TURN_USERNAME"] = "static-user";
        process.env["SPIRE_TURN_CREDENTIAL"] = "static-secret";

        await expect(resolveIceServersFromEnv()).resolves.toEqual([
            { urls: "stun:one.example:3478" },
            { urls: "stun:two.example:3478" },
            {
                credential: "static-secret",
                urls: [
                    "turn:turn.example:3478?transport=udp",
                    "turns:turn.example:443?transport=tcp",
                ],
                username: "static-user",
            },
        ]);
    });

    it("fetches Cloudflare TURN credentials with a TTL", async () => {
        process.env["SPIRE_CLOUDFLARE_TURN_KEY_ID"] = "turn-key";
        process.env["SPIRE_CLOUDFLARE_TURN_API_TOKEN"] = "secret";
        process.env["SPIRE_CLOUDFLARE_TURN_TTL_SECONDS"] = "3600";

        const fetchMock = vi.fn().mockResolvedValue({
            json: () =>
                Promise.resolve({
                    iceServers: [
                        {
                            urls: ["stun:stun.cloudflare.com:3478"],
                        },
                        {
                            credential: "generated-secret",
                            urls: [
                                "turn:turn.cloudflare.com:3478?transport=udp",
                            ],
                            username: "generated-user",
                        },
                    ],
                }),
            ok: true,
            status: 201,
        });
        globalThis.fetch = fetchMock;

        await expect(resolveIceServersFromEnv()).resolves.toEqual([
            { urls: ["stun:stun.cloudflare.com:3478"] },
            {
                credential: "generated-secret",
                urls: ["turn:turn.cloudflare.com:3478?transport=udp"],
                username: "generated-user",
            },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://rtc.live.cloudflare.com/v1/turn/keys/turn-key/credentials/generate-ice-servers",
            expect.objectContaining({
                body: JSON.stringify({ ttl: 3600 }),
                headers: {
                    Authorization: "Bearer secret",
                    "Content-Type": "application/json",
                },
                method: "POST",
            }),
        );
    });

    it("falls back to static ICE servers when Cloudflare fails", async () => {
        process.env["SPIRE_STUN_URLS"] = "stun:local.example:3478";
        process.env["SPIRE_CLOUDFLARE_TURN_KEY_ID"] = "turn-key";
        process.env["SPIRE_CLOUDFLARE_TURN_API_TOKEN"] = "secret";

        vi.spyOn(console, "warn").mockImplementation(() => {});
        globalThis.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({}),
            ok: false,
            status: 403,
        });

        await expect(resolveIceServersFromEnv()).resolves.toEqual([
            { urls: "stun:local.example:3478" },
        ]);
    });

    it("ignores partial Cloudflare config", async () => {
        process.env["SPIRE_STUN_URLS"] = "stun:local.example:3478";
        process.env["SPIRE_CLOUDFLARE_TURN_KEY_ID"] = "turn-key";
        const fetchMock = vi.fn();
        globalThis.fetch = fetchMock;
        vi.spyOn(console, "warn").mockImplementation(() => {});

        await expect(resolveIceServersFromEnv()).resolves.toEqual([
            { urls: "stun:local.example:3478" },
        ]);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
