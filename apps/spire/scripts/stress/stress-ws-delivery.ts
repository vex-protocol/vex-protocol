/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Wait for libvex `Client` "message" events (WebSocket mail path) so integration
 * runs assert realtime delivery, not only HTTP API success.
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

/**
 * Resolves when `predicate` matches the next `message` event, or rejects on timeout.
 */
export function waitForClientMessageWs(
    client: Client,
    predicate: (m: Message) => boolean,
    timeoutMs: number,
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
                    `WebSocket message delivery not observed within ${String(timeoutMs)}ms (${WS_DELIVERY_ENV})`,
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
        await waitForClientMessageWs(client, predicate, wsDeliveryTimeoutMs());
        telemetry?.touchOk(WS_DELIVERY_SURFACE, ctx);
    } catch (err: unknown) {
        recordHttpFailure(stats, err);
        telemetry?.touchFail(WS_DELIVERY_SURFACE, ctx, err);
        throw err;
    }
}

/**
 * After a flood wall, hub posts a unique token on each guild channel; every
 * other client must observe the inbound `message` event (WS path).
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
    const timeoutMs = wsDeliveryTimeoutMs();

    const tokenPrimary = `[spire-ws-ping:${randomUUID()}]`;
    const waitsPrimary = guests.map((guest, idx) =>
        waitForClientMessageWs(
            guest,
            (m) =>
                m.group === world.channelID &&
                m.direction === "incoming" &&
                m.decrypted &&
                m.message.includes(tokenPrimary),
            timeoutMs,
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, idx + 1),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, idx + 1),
                    err,
                );
                throw err;
            },
        ),
    );
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
            },
        },
    );
    await Promise.all(waitsPrimary);

    const tokenLounge = `[spire-ws-ping-lounge:${randomUUID()}]`;
    const waitsLounge = guests.map((guest, idx) =>
        waitForClientMessageWs(
            guest,
            (m) =>
                m.group === world.secondaryChannelID &&
                m.direction === "incoming" &&
                m.decrypted &&
                m.message.includes(tokenLounge),
            timeoutMs,
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, idx + 1),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, idx + 1),
                    err,
                );
                throw err;
            },
        ),
    );
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
    const timeoutMs = wsDeliveryTimeoutMs();
    const token = `[spire-ws-ping-noise:${randomUUID()}]`;
    const waits = guests.map((guest, idx) =>
        waitForClientMessageWs(
            guest,
            (m) =>
                m.group === channelID &&
                m.direction === "incoming" &&
                m.decrypted &&
                m.message.includes(token),
            timeoutMs,
        ).then(
            () => {
                telemetry?.touchOk(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, idx + 1),
                );
            },
            (err: unknown) => {
                recordHttpFailure(stats, err);
                telemetry?.touchFail(
                    WS_DELIVERY_SURFACE,
                    touchCtx(phase, burst, idx + 1),
                    err,
                );
                throw err;
            },
        ),
    );
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
