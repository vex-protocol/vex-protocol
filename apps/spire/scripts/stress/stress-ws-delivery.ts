/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Wait for libvex `Client` "message" events (WebSocket mail path) so integration
 * runs assert realtime delivery, not only HTTP API success.
 *
 * **Post-burst checks** (`verify*PostBurstWsDelivery`): only the first
 * `SPIRE_STRESS_WS_WITNESS_MAX` guests (default **3**) are sampled for each ping.
 * Witnesses are tracked across the whole run instead of failing a flood wall on
 * one timeout. The final run requires `SPIRE_STRESS_WS_REQUIRED_RATIO` observed
 * deliveries (default **0.9**). Set `SPIRE_STRESS_WS_WITNESS_MAX=all` to sample
 * every guest. Timeout uses `SPIRE_STRESS_WS_DELIVERY_MS` and scales with client
 * count unless the env value is already higher.
 *
 * When `CI=true` or `GITHUB_ACTIONS=true`, budgets are multiplied by
 * **~1.3** unless overridden (`SPIRE_STRESS_WS_CI_FACTOR`, or disabled with
 * `SPIRE_STRESS_WS_CI=0`).
 */
import type { Client, Message } from "@vex-chat/libvex";

import { randomUUID } from "node:crypto";

import {
    type HttpExpectStats,
    recordHttpFailure,
} from "./stress-http-stats.ts";
import { shortId } from "./stress-request-context.ts";
import {
    settleWithTelemetry,
    type StressTelemetry,
    type TelemetryTouchCtx,
} from "./stress-telemetry.ts";

const WS_DELIVERY_ENV = "SPIRE_STRESS_WS_DELIVERY_MS";
const WS_WITNESS_MAX_ENV = "SPIRE_STRESS_WS_WITNESS_MAX";
const WS_REQUIRED_RATIO_ENV = "SPIRE_STRESS_WS_REQUIRED_RATIO";
const WS_FINAL_GRACE_ENV = "SPIRE_STRESS_WS_FINAL_GRACE_MS";
const WS_CI_OFF_ENV = "SPIRE_STRESS_WS_CI";
const WS_CI_FACTOR_ENV = "SPIRE_STRESS_WS_CI_FACTOR";

const DEFAULT_WS_DELIVERY_MS = 25_000;
const DEFAULT_WS_REQUIRED_RATIO = 0.9;
const DEFAULT_WS_FINAL_GRACE_MS = 5_000;

export interface WsDeliveryStats {
    readonly expected: number;
    readonly observed: number;
    readonly pending: number;
    readonly ratio: number;
    readonly requiredRatio: number;
}

interface WsDeliveryTally {
    expected: number;
    observed: number;
    pending: number;
}

const wsDeliveryTally: WsDeliveryTally = {
    expected: 0,
    observed: 0,
    pending: 0,
};

export function formatWsDeliveryStats(stats = getWsDeliveryStats()): string {
    const pct = (stats.ratio * 100).toFixed(1);
    const requiredPct = (stats.requiredRatio * 100).toFixed(1);
    const pending =
        stats.pending > 0 ? `  pending=${String(stats.pending)}` : "";
    return `[stress] websocket delivery observed=${String(stats.observed)}/${String(stats.expected)} (${pct}%) required>=${requiredPct}%${pending}`;
}

export function getWsDeliveryStats(): WsDeliveryStats {
    const expected = wsDeliveryTally.expected;
    const observed = wsDeliveryTally.observed;
    return {
        expected,
        observed,
        pending: wsDeliveryTally.pending,
        ratio: expected > 0 ? observed / expected : 1,
        requiredRatio: wsRequiredRatio(),
    };
}

/**
 * Per-check budget: at least env / default, plus headroom when many clients exist
 * (fan-out decrypt + event loop).
 */
export function postBurstWsTimeoutMs(totalClients: number): number {
    const base = rawWsDeliveryFloorMs();
    const scaled = 28_000 + Math.max(0, Math.min(32, totalClients - 1)) * 4_500;
    return withStressWsCiBudget(Math.max(base, scaled));
}

/**
 * Resolves when `predicate` matches the next `message` event, or rejects on timeout.
 */
export function waitForClientMessageWs(
    client: Client,
    predicate: (m: Message) => boolean,
    timeoutMs: number,
    diagnosticLabel = "inbound message",
): Promise<Message> {
    return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
            if (done) {
                return;
            }
            done = true;
            client.off("message", onMessage);
            reject(
                new Error(
                    `${diagnosticLabel}: WebSocket delivery not observed within ${String(timeoutMs)}ms (set ${WS_DELIVERY_ENV}, ${WS_WITNESS_MAX_ENV}, or ${WS_CI_FACTOR_ENV}; see scripts/stress/stress-ws-delivery.ts)`,
                ),
            );
        }, timeoutMs);

        const onMessage = (m: Message): void => {
            if (done) {
                return;
            }
            try {
                if (predicate(m)) {
                    done = true;
                    clearTimeout(timer);
                    client.off("message", onMessage);
                    resolve(m);
                }
            } catch {
                /* predicate must not throw; ignore */
            }
        };

        client.on("message", onMessage);
    });
}

export async function waitForWsDeliveryFinalGrace(): Promise<void> {
    const graceMs = parseNonNegativeMsEnv(
        WS_FINAL_GRACE_ENV,
        DEFAULT_WS_FINAL_GRACE_MS,
    );
    if (graceMs <= 0 || wsDeliveryTally.pending <= 0) {
        return;
    }
    const end = Date.now() + graceMs;
    while (wsDeliveryTally.pending > 0 && Date.now() < end) {
        await new Promise((resolve) => {
            setTimeout(resolve, Math.min(100, Math.max(1, end - Date.now())));
        });
    }
}

export function wsDeliveryGatePassed(stats = getWsDeliveryStats()): boolean {
    return stats.expected === 0 || stats.ratio >= stats.requiredRatio;
}

export function wsDeliveryTimeoutMs(): number {
    return withStressWsCiBudget(rawWsDeliveryFloorMs());
}

function parseNonNegativeMsEnv(name: string, fallback: number): number {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === "") {
        return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function parsePositiveMsEnv(name: string, fallback: number): number {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === "") {
        return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function rawWsDeliveryFloorMs(): number {
    return parsePositiveMsEnv(WS_DELIVERY_ENV, DEFAULT_WS_DELIVERY_MS);
}

/**
 * GitHub-hosted runners are slower and more jittery than typical laptops; scale
 * WS wait budgets unless the harness opts out.
 */
function stressWsCiMultiplier(): number {
    if (process.env[WS_CI_OFF_ENV]?.trim() === "0") {
        return 1;
    }
    const factorRaw = process.env[WS_CI_FACTOR_ENV]?.trim();
    if (factorRaw !== undefined && factorRaw !== "") {
        const n = Number(factorRaw);
        if (Number.isFinite(n) && n >= 1 && n <= 4) {
            return n;
        }
    }
    const onCi =
        process.env["CI"] === "true" ||
        process.env["GITHUB_ACTIONS"] === "true";
    return onCi ? 1.3 : 1;
}

function touchCtx(
    phase: string,
    burst: number,
    clientIndex: number,
): TelemetryTouchCtx {
    return { burst, clientIndex, phase };
}

function withStressWsCiBudget(ms: number): number {
    return Math.ceil(ms * stressWsCiMultiplier());
}

function wsRequiredRatio(): number {
    const raw = process.env[WS_REQUIRED_RATIO_ENV]?.trim();
    if (raw !== undefined && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0 && n <= 1) {
            return n;
        }
    }
    return DEFAULT_WS_REQUIRED_RATIO;
}

function wsWitnessCap(guestCount: number): number {
    const raw = process.env[WS_WITNESS_MAX_ENV]?.trim().toLowerCase();
    if (raw === "all" || raw === "*") {
        return guestCount;
    }
    if (raw === undefined || raw === "") {
        return Math.min(3, guestCount);
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) {
        return Math.min(3, guestCount);
    }
    return Math.min(guestCount, Math.floor(n));
}

const WS_DELIVERY_SURFACE = "Client.on(message) | ws delivery";

export interface ChatWsPingWorld {
    readonly channelID: string;
    readonly secondaryChannelID: string;
    /** Same order as `clients[]` after bootstrap (hub = index 0). */
    readonly userIDs: readonly string[];
}

export async function awaitWsInboundWithTelemetry(
    client: Client,
    clientIndex: number,
    predicate: (m: Message) => boolean,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
): Promise<void> {
    const ctx = touchCtx(phase, burst, clientIndex);
    try {
        await waitForClientMessageWs(
            client,
            predicate,
            wsDeliveryTimeoutMs(),
            `warmup WS client#${String(clientIndex)}`,
        );
        telemetry?.touchOk(WS_DELIVERY_SURFACE, ctx);
    } catch (err: unknown) {
        recordHttpFailure(stats, err);
        telemetry?.touchFail(WS_DELIVERY_SURFACE, ctx, err);
        throw err;
    }
}

/**
 * After a flood wall, hub posts a unique token on each guild channel; a subset
 * of guests (see `wsWitnessCap`) is tracked for inbound `message` events, then
 * a hub→guest1 DM is tracked on WS.
 */
export async function verifyChatPostBurstWsDelivery(
    clients: readonly Client[],
    world: ChatWsPingWorld,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
): Promise<void> {
    const hub = clients[0];
    if (hub === undefined || clients.length < 2) {
        return;
    }
    const guests = clients.slice(1);
    const cap = wsWitnessCap(guests.length);
    const witnessGuests = guests.slice(0, cap);
    const timeoutMs = postBurstWsTimeoutMs(clients.length);

    const tokenPrimary = `[spire-ws-ping:${randomUUID()}]`;
    for (const [wIdx, guest] of witnessGuests.entries()) {
        const clientIndex = wIdx + 1;
        observeClientMessageWs({
            client: guest,
            predicate: incomingGroupPredicate(world.channelID, tokenPrimary),
            telemetry,
            timeoutMs,
            touchCtx: touchCtx(phase, burst, clientIndex),
        });
    }
    await settleWithTelemetry(
        stats,
        telemetry,
        "Client.messages.group | chat",
        touchCtx(phase, burst, 0),
        hub.messages.group(world.channelID, tokenPrimary),
        {
            inputs: {
                channelID: shortId(world.channelID),
                step: "post_burst_ws_ping_primary",
                witnessCap: cap,
                witnessRequiredRatio: wsRequiredRatio(),
            },
        },
    );

    const tokenLounge = `[spire-ws-ping-lounge:${randomUUID()}]`;
    for (const [wIdx, guest] of witnessGuests.entries()) {
        const clientIndex = wIdx + 1;
        observeClientMessageWs({
            client: guest,
            predicate: incomingGroupPredicate(
                world.secondaryChannelID,
                tokenLounge,
            ),
            telemetry,
            timeoutMs,
            touchCtx: touchCtx(phase, burst, clientIndex),
        });
    }
    await settleWithTelemetry(
        stats,
        telemetry,
        "Client.messages.group | chat",
        touchCtx(phase, burst, 0),
        hub.messages.group(world.secondaryChannelID, tokenLounge),
        {
            inputs: {
                channelID: shortId(world.secondaryChannelID),
                step: "post_burst_ws_ping_lounge",
                witnessCap: cap,
                witnessRequiredRatio: wsRequiredRatio(),
            },
        },
    );

    const hubUser = world.userIDs.at(0);
    const guestUser = world.userIDs.at(1);
    const guestClient = clients.at(1);
    if (
        hubUser !== undefined &&
        guestUser !== undefined &&
        guestClient !== undefined
    ) {
        const dmToken = `[spire-ws-dm-ping:${randomUUID()}]`;
        observeClientMessageWs({
            client: guestClient,
            predicate: (m) =>
                m.group === null &&
                m.direction === "incoming" &&
                m.decrypted &&
                m.authorID === hubUser &&
                m.message.includes(dmToken),
            telemetry,
            timeoutMs,
            touchCtx: touchCtx(phase, burst, 1),
        });
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.messages.send | chat",
            touchCtx(phase, burst, 0),
            hub.messages.send(guestUser, dmToken),
            {
                inputs: {
                    peerUserID: shortId(guestUser),
                    step: "post_burst_ws_ping_dm",
                },
            },
        );
    }
}

/**
 * Same as {@link verifyChatPostBurstWsDelivery} for the single shared noise channel.
 */
export async function verifyNoisePostBurstWsDelivery(
    clients: readonly Client[],
    channelID: string,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
    hubUserID: string,
    guestUserID: string,
): Promise<void> {
    const hub = clients[0];
    if (hub === undefined || clients.length < 2) {
        return;
    }
    const guests = clients.slice(1);
    const cap = wsWitnessCap(guests.length);
    const witnessGuests = guests.slice(0, cap);
    const timeoutMs = postBurstWsTimeoutMs(clients.length);
    const token = `[spire-ws-ping-noise:${randomUUID()}]`;
    for (const [wIdx, guest] of witnessGuests.entries()) {
        const clientIndex = wIdx + 1;
        observeClientMessageWs({
            client: guest,
            predicate: incomingGroupPredicate(channelID, token),
            telemetry,
            timeoutMs,
            touchCtx: touchCtx(phase, burst, clientIndex),
        });
    }
    await settleWithTelemetry(
        stats,
        telemetry,
        "Client.messages.group",
        touchCtx(phase, burst, 0),
        hub.messages.group(channelID, token),
        {
            inputs: {
                channelID: shortId(channelID),
                step: "post_burst_ws_ping_noise",
                witnessCap: cap,
                witnessRequiredRatio: wsRequiredRatio(),
            },
        },
    );

    if (hubUserID === "" || guestUserID === "") {
        return;
    }
    const guestClient = clients.at(1);
    if (guestClient === undefined) {
        return;
    }
    const dmToken = `[spire-ws-dm-ping-noise:${randomUUID()}]`;
    observeClientMessageWs({
        client: guestClient,
        predicate: (m) =>
            m.group === null &&
            m.direction === "incoming" &&
            m.decrypted &&
            m.authorID === hubUserID &&
            m.message.includes(dmToken),
        telemetry,
        timeoutMs,
        touchCtx: touchCtx(phase, burst, 1),
    });
    await settleWithTelemetry(
        stats,
        telemetry,
        "Client.messages.send",
        touchCtx(phase, burst, 0),
        hub.messages.send(guestUserID, dmToken),
        {
            inputs: {
                peerUserID: shortId(guestUserID),
                step: "post_burst_ws_ping_dm_noise",
            },
        },
    );
}

function incomingGroupPredicate(
    channelID: string,
    token: string,
): (m: Message) => boolean {
    return (m: Message): boolean =>
        m.group === channelID &&
        m.direction === "incoming" &&
        m.decrypted &&
        m.message.includes(token);
}

function observeClientMessageWs(args: {
    readonly client: Client;
    readonly predicate: (m: Message) => boolean;
    readonly telemetry: null | StressTelemetry;
    readonly timeoutMs: number;
    readonly touchCtx: TelemetryTouchCtx;
}): void {
    wsDeliveryTally.expected += 1;
    wsDeliveryTally.pending += 1;
    let done = false;
    const finish = (observed: boolean): void => {
        if (done) {
            return;
        }
        done = true;
        args.client.off("message", onMessage);
        clearTimeout(timer);
        wsDeliveryTally.pending = Math.max(0, wsDeliveryTally.pending - 1);
        if (observed) {
            wsDeliveryTally.observed += 1;
            args.telemetry?.touchOk(WS_DELIVERY_SURFACE, args.touchCtx);
        }
    };
    const timer = setTimeout(() => {
        finish(false);
    }, args.timeoutMs);
    timer.unref();
    const onMessage = (m: Message): void => {
        try {
            if (args.predicate(m)) {
                finish(true);
            }
        } catch {
            /* predicate must not throw; ignore */
        }
    };
    args.client.on("message", onMessage);
}
