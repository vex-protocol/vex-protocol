/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Wait for libvex `Client` "message" events (WebSocket mail path) so integration
 * runs assert realtime delivery, not only HTTP API success.
 *
 * **Post-burst checks** (`verify*PostBurstWsDelivery`): every connected client
 * sends a unique WS ping and every other client witnesses it. By default, local
 * runs require all witnesses; CI allows a small miss
 * budget (default required ratio ~0.67). Override with
 * `SPIRE_STRESS_WS_REQUIRED_RATIO` (`0 < ratio <= 1`). Timeout uses
 * `SPIRE_STRESS_WS_DELIVERY_MS` and scales with client count unless the env value
 * is already higher.
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
const WS_REQUIRED_RATIO_ENV = "SPIRE_STRESS_WS_REQUIRED_RATIO";
const WS_CI_OFF_ENV = "SPIRE_STRESS_WS_CI";
const WS_CI_FACTOR_ENV = "SPIRE_STRESS_WS_CI_FACTOR";
const WS_SCALE_ENV = "SPIRE_STRESS_WS_SCALE";
const WS_SAMPLES_ENV = "SPIRE_STRESS_WS_SAMPLES";

const DEFAULT_WS_DELIVERY_MS = 25_000;

/**
 * Per-check budget: at least env / default, plus headroom when many clients exist
 * (fan-out decrypt + event loop).
 */
export function postBurstWsTimeoutMs(totalClients: number): number {
    const base = rawWsDeliveryFloorMs();
    if (process.env[WS_SCALE_ENV]?.trim() === "0") {
        return withStressWsCiBudget(base);
    }
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
                    `${diagnosticLabel}: WebSocket delivery not observed within ${String(timeoutMs)}ms (set ${WS_DELIVERY_ENV} or ${WS_CI_FACTOR_ENV}; see scripts/stress/stress-ws-delivery.ts)`,
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

export function wsDeliveryTimeoutMs(): number {
    return withStressWsCiBudget(rawWsDeliveryFloorMs());
}

async function awaitWsWitnessSet(args: {
    label: string;
    minSuccesses: number;
    waits: Promise<void>[];
}): Promise<void> {
    const settled = await Promise.allSettled(args.waits);
    let successCount = 0;
    let firstFailureReason: null | string = null;
    for (const one of settled) {
        if (one.status === "fulfilled") {
            successCount += 1;
            continue;
        }
        if (firstFailureReason === null) {
            firstFailureReason = formatUnknownFailureReason(one.reason);
        }
    }
    if (successCount >= args.minSuccesses) {
        return;
    }
    const reason = firstFailureReason ?? "unknown";
    throw new Error(
        `${args.label}: observed ${String(successCount)}/${String(args.waits.length)} WS witnesses; require >=${String(args.minSuccesses)} (set ${WS_REQUIRED_RATIO_ENV}) — first failure: ${reason}`,
    );
}

function formatUnknownFailureReason(value: unknown): string {
    if (value instanceof Error) {
        return value.message;
    }
    if (typeof value === "string") {
        return value;
    }
    if (
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "bigint"
    ) {
        return String(value);
    }
    if (value === null || value === undefined) {
        return "unknown";
    }
    try {
        const json = JSON.stringify(value);
        if (typeof json === "string" && json.length > 0) {
            return json;
        }
    } catch {
        /* ignore JSON serialization errors */
    }
    return Object.prototype.toString.call(value);
}

function minWitnessSuccesses(totalWitnesses: number): number {
    if (totalWitnesses <= 0) {
        return 0;
    }
    const ratio = wsRequiredRatio();
    if (ratio >= 1) {
        return totalWitnesses;
    }
    return Math.max(1, Math.floor(totalWitnesses * ratio));
}

function parsePositiveIntEnv(name: string, fallback: number): number {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === "") {
        return fallback;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
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

function wsPostBurstSamples(): number {
    const onCi =
        process.env["CI"] === "true" ||
        process.env["GITHUB_ACTIONS"] === "true";
    return parsePositiveIntEnv(WS_SAMPLES_ENV, onCi ? 3 : 1);
}

function wsRequiredRatio(): number {
    const raw = process.env[WS_REQUIRED_RATIO_ENV]?.trim();
    if (raw !== undefined && raw !== "") {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0 && n <= 1) {
            return n;
        }
    }
    const onCi =
        process.env["CI"] === "true" ||
        process.env["GITHUB_ACTIONS"] === "true";
    // CI runners are shared/noisy; permit occasional dropped WS observations.
    return onCi ? 0.67 : 1;
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
 * After a flood wall, each client posts a unique token on each guild channel;
 * every other client must observe the inbound `message` event within the
 * configured witness ratio. DMs are checked as a ring so every client sends and
 * every client witnesses one inbound DM.
 */
export async function verifyChatPostBurstWsDelivery(
    clients: readonly Client[],
    world: ChatWsPingWorld,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
): Promise<void> {
    if (clients.length < 2) {
        return;
    }
    const timeoutMs = postBurstWsTimeoutMs(clients.length);

    await verifyGroupAllClientsWsDelivery(
        clients,
        world.channelID,
        "chat post-wall primary",
        "post_burst_ws_ping_primary",
        stats,
        telemetry,
        phase,
        burst,
        timeoutMs,
        "Client.messages.group | chat",
    );
    await verifyGroupAllClientsWsDelivery(
        clients,
        world.secondaryChannelID,
        "chat post-wall lounge",
        "post_burst_ws_ping_lounge",
        stats,
        telemetry,
        phase,
        burst,
        timeoutMs,
        "Client.messages.group | chat",
    );
    await verifyDmRingWsDelivery(
        clients,
        world.userIDs,
        "chat post-wall DM ring",
        "post_burst_ws_ping_dm",
        stats,
        telemetry,
        phase,
        burst,
        timeoutMs,
        "Client.messages.send | chat",
    );
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
    userIDs: readonly string[],
): Promise<void> {
    if (clients.length < 2) {
        return;
    }
    const timeoutMs = postBurstWsTimeoutMs(clients.length);
    await verifyGroupAllClientsWsDelivery(
        clients,
        channelID,
        "noise post-wall group",
        "post_burst_ws_ping_noise",
        stats,
        telemetry,
        phase,
        burst,
        timeoutMs,
        "Client.messages.group",
    );
    await verifyDmRingWsDelivery(
        clients,
        userIDs,
        "noise post-wall DM ring",
        "post_burst_ws_ping_dm_noise",
        stats,
        telemetry,
        phase,
        burst,
        timeoutMs,
        "Client.messages.send",
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

async function verifyDmRingWsDelivery(
    clients: readonly Client[],
    userIDs: readonly string[],
    label: string,
    step: string,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
    timeoutMs: number,
    surface: string,
): Promise<void> {
    const n = Math.min(clients.length, userIDs.length);
    if (n < 2) {
        return;
    }

    for (let senderIndex = 0; senderIndex < n; senderIndex++) {
        const recipientIndex = (senderIndex + 1) % n;
        const sender = clients[senderIndex];
        const recipient = clients[recipientIndex];
        const senderUserID = userIDs[senderIndex];
        const recipientUserID = userIDs[recipientIndex];
        if (
            sender === undefined ||
            recipient === undefined ||
            senderUserID === undefined ||
            recipientUserID === undefined
        ) {
            continue;
        }

        const token = `[spire-ws-dm-ping:${step}:${String(senderIndex)}:${randomUUID()}]`;
        const waitDm = waitForClientMessageWs(
            recipient,
            (m) =>
                m.group === null &&
                m.direction === "incoming" &&
                m.decrypted &&
                m.authorID === senderUserID &&
                m.message.includes(token),
            timeoutMs,
            `${label} sender#${String(senderIndex)} recipient#${String(recipientIndex)}`,
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, recipientIndex),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, recipientIndex),
                    err,
                );
                throw err;
            },
        );

        await settleWithTelemetry(
            stats,
            telemetry,
            surface,
            touchCtx(phase, burst, senderIndex),
            sender.messages.send(recipientUserID, token),
            {
                inputs: {
                    peerUserID: shortId(recipientUserID),
                    recipientIndex,
                    senderIndex,
                    step,
                },
            },
        );
        try {
            await waitDm;
        } catch {
            // Recorded above as a WS delivery facet miss. Keep the stress run
            // moving so later walls/scenarios show whether this is isolated or
            // sustained degradation.
        }
    }
}

async function verifyGroupAllClientsWsDelivery(
    clients: readonly Client[],
    channelID: string,
    label: string,
    step: string,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
    timeoutMs: number,
    surface: string,
): Promise<void> {
    const samples = wsPostBurstSamples();
    for (const [senderIndex, sender] of clients.entries()) {
        const waits: Promise<void>[] = [];
        const witnesses = clients
            .map((client, clientIndex) => ({ client, clientIndex }))
            .filter(({ clientIndex }) => clientIndex !== senderIndex);

        for (let sample = 0; sample < samples; sample += 1) {
            const token = `[spire-ws-ping:${step}:${String(senderIndex)}:${String(sample)}:${randomUUID()}]`;
            waits.push(
                ...witnesses.map(({ client, clientIndex }) =>
                    waitForClientMessageWs(
                        client,
                        incomingGroupPredicate(channelID, token),
                        timeoutMs,
                        `${label} sender#${String(senderIndex)} sample#${String(sample)} witness#${String(clientIndex)}`,
                    ).then(
                        () => {
                            telemetry?.touchOk(
                                WS_DELIVERY_SURFACE,
                                touchCtx(phase, burst, clientIndex),
                            );
                        },
                        (err: unknown) => {
                            throw err;
                        },
                    ),
                ),
            );

            await settleWithTelemetry(
                stats,
                telemetry,
                surface,
                touchCtx(phase, burst, senderIndex),
                sender.messages.group(channelID, token),
                {
                    inputs: {
                        channelID: shortId(channelID),
                        sample,
                        samples,
                        senderIndex,
                        step,
                        witnessMinSuccess: minWitnessSuccesses(waits.length),
                        witnessTotal: waits.length,
                    },
                },
            );
        }
        const minSuccesses = minWitnessSuccesses(waits.length);
        try {
            await awaitWsWitnessSet({
                label: `${label} sender#${String(senderIndex)} samples=${String(samples)}`,
                minSuccesses,
                waits,
            });
        } catch (err: unknown) {
            recordHttpFailure(stats, err);
            telemetry?.touchFail(
                WS_DELIVERY_SURFACE,
                touchCtx(phase, burst, senderIndex),
                err,
            );
        }
    }
}
