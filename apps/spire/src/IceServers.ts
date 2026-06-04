/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { IceServerConfig } from "@vex-chat/types";

import { IceServerConfigSchema } from "@vex-chat/types";

import { z } from "zod/v4";

const CLOUDFLARE_TURN_ENDPOINT = "https://rtc.live.cloudflare.com/v1/turn/keys";
const DEFAULT_CLOUDFLARE_TURN_TIMEOUT_MS = 5_000;
const DEFAULT_CLOUDFLARE_TURN_TTL_SECONDS = 86_400;

const cloudflareIceServersResponseSchema = z.object({
    iceServers: z.array(IceServerConfigSchema),
});

export async function resolveIceServersFromEnv(): Promise<IceServerConfig[]> {
    const jsonOverride = readJsonIceServersFromEnv();
    if (jsonOverride) {
        return jsonOverride;
    }

    const staticServers = readStaticIceServersFromEnv();
    const cloudflareServers = await readCloudflareIceServersFromEnv();
    return [...staticServers, ...cloudflareServers];
}

async function readCloudflareIceServersFromEnv(): Promise<IceServerConfig[]> {
    const keyID = readEnv([
        "SPIRE_CLOUDFLARE_TURN_KEY_ID",
        "CLOUDFLARE_TURN_KEY_ID",
        "TURN_KEY_ID",
    ]);
    const apiToken = readEnv([
        "SPIRE_CLOUDFLARE_TURN_API_TOKEN",
        "CLOUDFLARE_TURN_API_TOKEN",
        "TURN_KEY_API_TOKEN",
    ]);
    const endpointOverride = readEnv(["SPIRE_CLOUDFLARE_TURN_ENDPOINT"]);
    if (!keyID && !apiToken && !endpointOverride) {
        return [];
    }

    if (!apiToken || (!keyID && !endpointOverride)) {
        console.warn(
            "[spire-calls] Cloudflare TURN is partially configured; set SPIRE_CLOUDFLARE_TURN_KEY_ID and SPIRE_CLOUDFLARE_TURN_API_TOKEN",
        );
        return [];
    }

    let endpoint = endpointOverride;
    if (!endpoint) {
        if (!keyID) {
            console.warn(
                "[spire-calls] Cloudflare TURN is partially configured; set SPIRE_CLOUDFLARE_TURN_KEY_ID and SPIRE_CLOUDFLARE_TURN_API_TOKEN",
            );
            return [];
        }
        endpoint = `${CLOUDFLARE_TURN_ENDPOINT}/${encodeURIComponent(keyID)}/credentials/generate-ice-servers`;
    }
    const ttl = readPositiveIntegerEnv(
        "SPIRE_CLOUDFLARE_TURN_TTL_SECONDS",
        DEFAULT_CLOUDFLARE_TURN_TTL_SECONDS,
    );
    const timeoutMs = readPositiveIntegerEnv(
        "SPIRE_CLOUDFLARE_TURN_TIMEOUT_MS",
        DEFAULT_CLOUDFLARE_TURN_TIMEOUT_MS,
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const response = await fetch(endpoint, {
            body: JSON.stringify({ ttl }),
            headers: {
                Authorization: `Bearer ${apiToken}`,
                "Content-Type": "application/json",
            },
            method: "POST",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(
                `Cloudflare TURN credential request failed with ${response.status}`,
            );
        }

        const payload = await response.json();
        return cloudflareIceServersResponseSchema.parse(payload).iceServers;
    } catch (err: unknown) {
        console.warn(
            "[spire-calls] failed to fetch Cloudflare TURN credentials",
            err instanceof Error ? err.message : String(err),
        );
        return [];
    } finally {
        clearTimeout(timeout);
    }
}

function readEnv(names: string[]): string | undefined {
    for (const name of names) {
        const value = process.env[name]?.trim();
        if (value) {
            return value;
        }
    }
    return undefined;
}

function readJsonIceServersFromEnv(): IceServerConfig[] | null {
    const json = process.env["SPIRE_ICE_SERVERS"]?.trim();
    if (!json) {
        return null;
    }

    try {
        const parsed = JSON.parse(json) as unknown;
        return z.array(IceServerConfigSchema).parse(parsed);
    } catch (err: unknown) {
        console.warn(
            "[spire-calls] ignoring invalid SPIRE_ICE_SERVERS",
            err instanceof Error ? err.message : String(err),
        );
        return null;
    }
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
    const raw = process.env[name]?.trim();
    if (!raw) {
        return fallback;
    }

    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
    }

    console.warn(
        `[spire-calls] ignoring invalid ${name}; expected a positive integer`,
    );
    return fallback;
}

function readStaticIceServersFromEnv(): IceServerConfig[] {
    const servers: IceServerConfig[] = [];
    for (const url of splitCsvEnv("SPIRE_STUN_URLS")) {
        servers.push({ urls: url });
    }

    const turnUrls = splitCsvEnv("SPIRE_TURN_URLS");
    if (turnUrls.length > 0) {
        const username = process.env["SPIRE_TURN_USERNAME"]?.trim();
        const credential = process.env["SPIRE_TURN_CREDENTIAL"]?.trim();
        const [firstTurnUrl] = turnUrls;
        if (!firstTurnUrl) {
            return servers;
        }
        const urls: string | string[] =
            turnUrls.length === 1 ? firstTurnUrl : turnUrls;
        servers.push({
            ...(credential ? { credential } : {}),
            urls,
            ...(username ? { username } : {}),
        });
    }

    return servers;
}

function splitCsvEnv(name: string): string[] {
    return (process.env[name] ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
}
