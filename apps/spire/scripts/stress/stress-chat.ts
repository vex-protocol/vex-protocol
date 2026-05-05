/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

/**
 * Chat-shaped load: WebSocket + one shared guild where the hub invites every
 * guest, then a hub-created side channel models two group rooms. A one-shot
 * warmup exercises “everyone reads both channels, posts in both, ring DMs,
 * then reads the neighbor who messaged you.” Ongoing bursts mix the same
 * surfaces with deterministic DM peer rotation across rounds.
 */
import type { Client } from "@vex-chat/libvex";

import { randomInt, randomUUID } from "node:crypto";

import { allTracked, type HttpExpectStats } from "./stress-http-stats.ts";
import { shortId } from "./stress-request-context.ts";
import {
    settleWithTelemetry,
    type StressTelemetry,
    type TelemetryTouchCtx,
} from "./stress-telemetry.ts";

export interface ChatWorld {
    /** Default guild channel (#general or first). */
    readonly channelID: string;
    /** Hub-created text channel (everyone is a member). */
    readonly secondaryChannelID: string;
    readonly serverID: string;
    readonly userIDs: readonly string[];
}

const DURATIONS = ["1h", "24h", "48h", "7d"] as const;

const CHAT_LOAD_CYCLE = 12;

/**
 * Hub creates one server, invites every other client (same pattern as noise),
 * adds a second text channel, so all stress clients share #general + lounge.
 */
export async function bootstrapChatWorld(
    clients: Client[],
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
): Promise<ChatWorld> {
    if (clients.length === 0) {
        throw new Error("chat: need at least one client.");
    }
    const hub = clients[0];
    if (hub === undefined) {
        throw new Error("chat: hub client missing.");
    }
    const base = touchCtx(phase, burst, 0);
    const serverName = `stress-chat-${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const server = await settleWithTelemetry(
        stats,
        telemetry,
        "Client.servers.create; Client.channels.retrieve; Client.invites.create; Client.invites.redeem; Client.whoami",
        base,
        hub.servers.create(serverName),
        { inputs: { serverName } },
    );
    const channelList = await settleWithTelemetry(
        stats,
        telemetry,
        "Client.servers.create; Client.channels.retrieve; Client.invites.create; Client.invites.redeem; Client.whoami",
        base,
        hub.channels.retrieve(server.serverID),
        { inputs: { serverID: shortId(server.serverID) } },
    );
    const primary =
        channelList.find((c) => c.name === "general") ?? channelList[0];
    if (primary === undefined) {
        throw new Error("chat: server has no channels.");
    }

    for (let i = 1; i < clients.length; i++) {
        const guest = clients[i];
        if (guest === undefined) {
            throw new Error("chat: guest client missing.");
        }
        const inviteDuration = pickDuration();
        const inv = await settleWithTelemetry(
            stats,
            telemetry,
            "Client.servers.create; Client.channels.retrieve; Client.invites.create; Client.invites.redeem; Client.whoami",
            { ...base, clientIndex: i },
            hub.invites.create(server.serverID, inviteDuration),
            {
                inputs: {
                    clientIndex: i,
                    duration: inviteDuration,
                    serverID: shortId(server.serverID),
                },
            },
        );
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.servers.create; Client.channels.retrieve; Client.invites.create; Client.invites.redeem; Client.whoami",
            { ...base, clientIndex: i },
            guest.invites.redeem(inv.inviteID),
            {
                inputs: {
                    clientIndex: i,
                    inviteID: shortId(inv.inviteID),
                    serverID: shortId(server.serverID),
                },
            },
        );
    }

    const loungeName = `stress-lounge-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
    const lounge = await settleWithTelemetry(
        stats,
        telemetry,
        "Client.channels.create",
        base,
        hub.channels.create(loungeName, server.serverID),
        {
            inputs: {
                channelName: loungeName,
                serverID: shortId(server.serverID),
            },
        },
    );

    const meta = await Promise.all(
        clients.map((c, i) =>
            settleWithTelemetry(
                stats,
                telemetry,
                "Client.servers.create; Client.channels.retrieve; Client.invites.create; Client.invites.redeem; Client.whoami",
                { ...base, clientIndex: i },
                c.whoami(),
                { inputs: { clientIndex: i, step: "whoami_world_bootstrap" } },
            ),
        ),
    );
    const userIDs = meta.map((m) => m.user.userID);

    return {
        channelID: primary.channelID,
        secondaryChannelID: lounge.channelID,
        serverID: server.serverID,
        userIDs,
    };
}

export async function oneChatBurst(
    client: Client,
    clientIndex: number,
    world: ChatWorld,
    n: number,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
): Promise<void> {
    await allTracked(
        stats,
        Array.from({ length: n }, (_, i) =>
            oneChatOp(
                client,
                world,
                clientIndex,
                i,
                stats,
                telemetry,
                phase,
                burst,
            ),
        ),
    );
}

export async function oneChatOp(
    client: Client,
    world: ChatWorld,
    clientIndex: number,
    slot: number,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
): Promise<void> {
    const ctx = touchCtx(phase, burst, clientIndex);
    const m = slot % CHAT_LOAD_CYCLE;
    const dmRound = Math.floor(slot / CHAT_LOAD_CYCLE);

    if (m === 0) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.messages.group | chat",
            ctx,
            client.messages.group(
                world.channelID,
                `[stress] c${String(clientIndex)} s${String(slot)}-${Date.now().toString(36)}`,
            ),
            {
                inputs: {
                    channelID: shortId(world.channelID),
                    room: "primary",
                    serverID: shortId(world.serverID),
                    slot,
                },
            },
        );
        return;
    }
    if (m === 1) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.messages.group | chat",
            ctx,
            client.messages.group(
                world.secondaryChannelID,
                `[stress-lounge] c${String(clientIndex)} s${String(slot)}-${Date.now().toString(36)}`,
            ),
            {
                inputs: {
                    channelID: shortId(world.secondaryChannelID),
                    room: "secondary",
                    serverID: shortId(world.serverID),
                    slot,
                },
            },
        );
        return;
    }
    if (m === 2) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.messages.retrieveGroup | chat",
            ctx,
            client.messages.retrieveGroup(world.channelID),
            {
                inputs: {
                    channelID: shortId(world.channelID),
                    room: "primary",
                    slot,
                },
            },
        );
        return;
    }
    if (m === 3) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.messages.retrieveGroup | chat",
            ctx,
            client.messages.retrieveGroup(world.secondaryChannelID),
            {
                inputs: {
                    channelID: shortId(world.secondaryChannelID),
                    room: "secondary",
                    slot,
                },
            },
        );
        return;
    }
    if (m === 4) {
        const peer = pickPeerUserIDDeterministic(world, clientIndex, dmRound);
        if (peer === null) {
            await settleWithTelemetry(
                stats,
                telemetry,
                "Client.whoami | chat",
                ctx,
                client.whoami(),
                { inputs: { reason: "no_peer_for_dm", slot } },
            );
            return;
        }
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.messages.send | chat",
            ctx,
            client.messages.send(
                peer,
                `[stress-dm] c${String(clientIndex)}-${Date.now().toString(36)}`,
            ),
            {
                inputs: {
                    dmRound,
                    peerUserID: shortId(peer),
                    slot,
                },
            },
        );
        return;
    }
    if (m === 5) {
        const peer = pickPeerUserIDDeterministic(world, clientIndex, dmRound);
        if (peer === null) {
            await settleWithTelemetry(
                stats,
                telemetry,
                "Client.whoami | chat",
                ctx,
                client.whoami(),
                { inputs: { reason: "no_peer_for_dm_hist", slot } },
            );
            return;
        }
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.messages.retrieve | chat",
            ctx,
            client.messages.retrieve(peer),
            { inputs: { dmRound, peerUserID: shortId(peer), slot } },
        );
        return;
    }
    if (m === 6) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.servers.retrieve | chat",
            ctx,
            client.servers.retrieve(),
            { inputs: { slot } },
        );
        return;
    }
    if (m === 7) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.permissions.retrieve | chat",
            ctx,
            client.permissions.retrieve(),
            { inputs: { slot } },
        );
        return;
    }
    if (m === 8) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.channels.retrieve | chat",
            ctx,
            client.channels.retrieve(world.serverID),
            { inputs: { serverID: shortId(world.serverID), slot } },
        );
        return;
    }
    if (m === 9) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.channels.userList | chat",
            ctx,
            client.channels.userList(world.channelID),
            {
                inputs: {
                    channelID: shortId(world.channelID),
                    room: "primary",
                    slot,
                },
            },
        );
        return;
    }
    if (m === 10) {
        await settleWithTelemetry(
            stats,
            telemetry,
            "Client.channels.userList | chat",
            ctx,
            client.channels.userList(world.secondaryChannelID),
            {
                inputs: {
                    channelID: shortId(world.secondaryChannelID),
                    room: "secondary",
                    slot,
                },
            },
        );
        return;
    }
    await settleWithTelemetry(
        stats,
        telemetry,
        "Client.servers.retrieveByID | chat",
        ctx,
        client.servers.retrieveByID(world.serverID),
        { inputs: { serverID: shortId(world.serverID), slot } },
    );
}

/**
 * One scripted pass after bootstrap: every member reads both channel histories,
 * posts once in each, sends a DM to the next person in the ring, then pulls
 * DM history with the previous neighbor (who DM’d them).
 */
export async function runChatSocialWarmup(
    clients: readonly Client[],
    world: ChatWorld,
    stats: HttpExpectStats,
    telemetry: null | StressTelemetry,
    phase: string,
    burst: number,
): Promise<void> {
    const n = clients.length;
    if (n === 0) {
        return;
    }
    const readBoth = clients.map((c, i) => {
        const ctx = touchCtx(phase, burst, i);
        return Promise.all([
            settleWithTelemetry(
                stats,
                telemetry,
                "Client.messages.retrieveGroup | chat",
                ctx,
                c.messages.retrieveGroup(world.channelID),
                {
                    inputs: {
                        channelID: shortId(world.channelID),
                        step: "warmup_read",
                        which: "primary",
                    },
                },
            ),
            settleWithTelemetry(
                stats,
                telemetry,
                "Client.messages.retrieveGroup | chat",
                ctx,
                c.messages.retrieveGroup(world.secondaryChannelID),
                {
                    inputs: {
                        channelID: shortId(world.secondaryChannelID),
                        step: "warmup_read",
                        which: "secondary",
                    },
                },
            ),
        ]);
    });
    await Promise.all(readBoth);

    await Promise.all(
        clients.map((c, i) =>
            settleWithTelemetry(
                stats,
                telemetry,
                "Client.messages.group | chat",
                touchCtx(phase, burst, i),
                c.messages.group(
                    world.channelID,
                    `[warmup-general] #${String(i)} ${Date.now().toString(36)}`,
                ),
                {
                    inputs: {
                        channelID: shortId(world.channelID),
                        step: "warmup_post_general",
                    },
                },
            ),
        ),
    );

    await Promise.all(
        clients.map((c, i) =>
            settleWithTelemetry(
                stats,
                telemetry,
                "Client.messages.group | chat",
                touchCtx(phase, burst, i),
                c.messages.group(
                    world.secondaryChannelID,
                    `[warmup-lounge] #${String(i)} ${Date.now().toString(36)}`,
                ),
                {
                    inputs: {
                        channelID: shortId(world.secondaryChannelID),
                        step: "warmup_post_lounge",
                    },
                },
            ),
        ),
    );

    if (n < 2) {
        return;
    }

    await Promise.all(
        clients.map((c, i) => {
            const peer = world.userIDs[(i + 1) % n];
            if (peer === undefined) {
                return Promise.resolve();
            }
            return settleWithTelemetry(
                stats,
                telemetry,
                "Client.messages.send | chat",
                touchCtx(phase, burst, i),
                c.messages.send(
                    peer,
                    `[warmup-dm-ring] from-${String(i)}-${Date.now().toString(36)}`,
                ),
                {
                    inputs: {
                        peerUserID: shortId(peer),
                        step: "warmup_dm_send_ring",
                    },
                },
            );
        }),
    );

    await Promise.all(
        clients.map((c, i) => {
            const from = world.userIDs[(i + n - 1) % n];
            if (from === undefined) {
                return Promise.resolve();
            }
            return settleWithTelemetry(
                stats,
                telemetry,
                "Client.messages.retrieve | chat",
                touchCtx(phase, burst, i),
                c.messages.retrieve(from),
                {
                    inputs: {
                        peerUserID: shortId(from),
                        step: "warmup_dm_read_ring",
                    },
                },
            );
        }),
    );
}

function pickDuration(): string {
    return DURATIONS[randomInt(0, DURATIONS.length)] ?? "24h";
}

/**
 * Deterministic peer for DM send/history: as `round` increments, cycles
 * through every other member so long runs cover all ordered pairs.
 */
function pickPeerUserIDDeterministic(
    world: ChatWorld,
    clientIndex: number,
    round: number,
): null | string {
    const ids = world.userIDs;
    if (ids.length < 2) {
        return null;
    }
    const n = ids.length;
    const span = n - 1;
    const step = 1 + (round % span);
    let peerIndex = (clientIndex + step) % n;
    if (peerIndex === clientIndex) {
        peerIndex = (peerIndex + 1) % n;
    }
    return ids[peerIndex] ?? null;
}

function touchCtx(
    phase: string,
    burst: number,
    clientIndex: number,
): TelemetryTouchCtx {
    return { burst, clientIndex, phase };
}
