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
 * `SPIRE_STRESS_WS_WITNESS_MAX` guests (default **3**) must observe each ping so
 * CI stays reliable with many clients; set `SPIRE_STRESS_WS_WITNESS_MAX=all` to
 * require every guest. Timeout uses `SPIRE_STRESS_WS_DELIVERY_MS` and scales with
 * client count unless the env value is already higher.
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

/**
 * Per-check budget: at least env / default, plus headroom when many clients exist
 * (fan-out decrypt + event loop).
 */
export function postBurstWsTimeoutMs(totalClients: number): number {
    const base = wsDeliveryTimeoutMs();
    const scaled = 28_000 + Math.max(0, Math.min(32, totalClients - 1)) * 4_500;
    return Math.max(base, scaled);
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
                    `${diagnosticLabel}: WebSocket delivery not observed within ${String(timeoutMs)}ms (set ${WS_DELIVERY_ENV} or ${WS_WITNESS_MAX_ENV}; see scripts/stress/stress-ws-delivery.ts)`,
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
    const raw = process.env[WS_DELIVERY_ENV]?.trim();
    if (raw === undefined || raw === "") {
        return 25_000;
    }
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 25_000;
}

function touchCtx(
    phase: string,
    burst: number,
    clientIndex: number,
): TelemetryTouchCtx {
    return { burst, clientIndex, phase };
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
 * of guests (see `wsWitnessCap`) must observe inbound `message` events, then a
 * hub→guest1 DM is checked on WS.
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
    const waitsPrimary = witnessGuests.map((guest, wIdx) => {
        const clientIndex = wIdx + 1;
        return waitForClientMessageWs(
            guest,
            incomingGroupPredicate(world.channelID, tokenPrimary),
            timeoutMs,
            `chat post-wall primary #${String(clientIndex)}`,
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, clientIndex),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, clientIndex),
                    err,
                );
                throw err;
            },
        );
    });
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
            },
        },
    );
    await Promise.all(waitsPrimary);

    const tokenLounge = `[spire-ws-ping-lounge:${randomUUID()}]`;
    const waitsLounge = witnessGuests.map((guest, wIdx) => {
        const clientIndex = wIdx + 1;
        return waitForClientMessageWs(
            guest,
            incomingGroupPredicate(world.secondaryChannelID, tokenLounge),
            timeoutMs,
            `chat post-wall lounge #${String(clientIndex)}`,
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, clientIndex),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, clientIndex),
                    err,
                );
                throw err;
            },
        );
    });
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
            },
        },
    );
    await Promise.all(waitsLounge);

    const hubUser = world.userIDs.at(0);
    const guestUser = world.userIDs.at(1);
    const guestClient = clients.at(1);
    if (
        hubUser !== undefined &&
        guestUser !== undefined &&
        guestClient !== undefined
    ) {
        const dmToken = `[spire-ws-dm-ping:${randomUUID()}]`;
        const waitDm = waitForClientMessageWs(
            guestClient,
            (m) =>
                m.group === null &&
                m.direction === "incoming" &&
                m.decrypted &&
                m.authorID === hubUser &&
                m.message.includes(dmToken),
            timeoutMs,
            "chat post-wall hub→guest1 DM",
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, 1),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, 1),
                    err,
                );
                throw err;
            },
        );
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
        await waitDm;
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
    const waits = witnessGuests.map((guest, wIdx) => {
        const clientIndex = wIdx + 1;
        return waitForClientMessageWs(
            guest,
            incomingGroupPredicate(channelID, token),
            timeoutMs,
            `noise post-wall group #${String(clientIndex)}`,
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, clientIndex),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, clientIndex),
                    err,
                );
                throw err;
            },
        );
    });
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
            },
        },
    );
    await Promise.all(waits);

    if (hubUserID === "" || guestUserID === "") {
        return;
    }
    const guestClient = clients.at(1);
    if (guestClient === undefined) {
        return;
    }
    const dmToken = `[spire-ws-dm-ping-noise:${randomUUID()}]`;
    const waitDm = waitForClientMessageWs(
        guestClient,
        (m) =>
            m.group === null &&
            m.direction === "incoming" &&
            m.decrypted &&
            m.authorID === hubUserID &&
            m.message.includes(dmToken),
        timeoutMs,
        "noise post-wall hub→guest1 DM",
    ).then(
        () => {
            telemetry?.touchOk(WS_DELIVERY_SURFACE, touchCtx(phase, burst, 1));
        },
        (err: unknown) => {
            recordHttpFailure(stats, err);
            telemetry?.touchFail(
                WS_DELIVERY_SURFACE,
                touchCtx(phase, burst, 1),
                err,
            );
            throw err;
        },
    );
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
    await waitDm;
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
