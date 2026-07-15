/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type {
    Channel,
    Permission,
    User,
    Server as VexServer,
} from "@vex-chat/types";
import type { Server } from "node:http";

import express from "express";

import { xSignKeyPair, XUtils } from "@vex-chat/crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { Database } from "../Database.ts";
import { initApp } from "../server/index.ts";
import { signAuthJwt } from "../utils/authJwt.ts";
import { msgpack } from "../utils/msgpack.ts";

const testImage = XUtils.decodeBase64(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAABJRU5ErkJggg==",
);

const originalJwtSecret = process.env["JWT_SECRET"];
const user: User = {
    lastSeen: new Date(0).toISOString(),
    userID: "8d768e5c-55ec-4fe4-bcb2-26bdde8076d9",
    username: "server-admin",
};
const member: User = {
    lastSeen: new Date(0).toISOString(),
    userID: "3e1225e2-88bb-469f-bef3-28531da7f97a",
    username: "group-member",
};

describe("server management routes", () => {
    afterEach(() => {
        if (originalJwtSecret === undefined) {
            delete process.env["JWT_SECRET"];
        } else {
            process.env["JWT_SECRET"] = originalJwtSecret;
        }
    });

    it("renames servers and channels, manages icons, and preserves one channel", async () => {
        process.env["JWT_SECRET"] = "server-management-test-secret";
        const db = new Database({ dbType: "sqlite3mem" });
        await ready(db);
        await db["db"]
            .insertInto("users")
            .values(
                [user, member].map((entry) => ({
                    ...entry,
                    passwordHash: "not-used-by-this-test",
                })),
            )
            .execute();
        const created = await db.createServer("Before", user.userID);
        const memberPermission = await db.createPermission(
            member.userID,
            "server",
            created.serverID,
            0,
        );
        const ownerPermission = (
            await db.retrievePermissionsByResourceID(created.serverID)
        ).find((permission) => permission.userID === user.userID);
        expect(ownerPermission).toBeDefined();
        const notify = vi.fn();
        const app = express();
        initApp(app, db, () => false, xSignKeyPair(), notify);
        const listener = await listen(app);

        try {
            const origin = serverOrigin(listener);
            const headers = {
                Authorization: `Bearer ${signAuthJwt({ scope: "user", user }, "5m")}`,
                "Content-Type": "application/msgpack",
            };

            const createServer = await fetch(`${origin}/servers`, {
                body: msgpack.encode({ name: "Café 作戦" }),
                headers,
                method: "POST",
            });
            expect(createServer.status).toBe(200);
            expect(await decode<VexServer>(createServer)).toMatchObject({
                name: "Café 作戦",
            });

            const renameServer = await fetch(
                `${origin}/server/${created.serverID}`,
                {
                    body: msgpack.encode({ name: "After" }),
                    headers,
                    method: "PATCH",
                },
            );
            expect(renameServer.status).toBe(200);
            expect(await decode<VexServer>(renameServer)).toMatchObject({
                name: "After",
                serverID: created.serverID,
            });

            const promoteMember = await fetch(
                `${origin}/permission/${memberPermission.permissionID}`,
                {
                    body: msgpack.encode({ powerLevel: 50 }),
                    headers,
                    method: "PATCH",
                },
            );
            expect(promoteMember.status).toBe(200);
            expect(await decode<Permission>(promoteMember)).toMatchObject({
                permissionID: memberPermission.permissionID,
                powerLevel: 50,
            });

            const memberHeaders = {
                Authorization: `Bearer ${signAuthJwt({ scope: "user", user: member }, "5m")}`,
                "Content-Type": "application/msgpack",
            };
            const moderatorCannotChangeRoles = await fetch(
                `${origin}/permission/${ownerPermission!.permissionID}`,
                {
                    body: msgpack.encode({ powerLevel: 100 }),
                    headers: memberHeaders,
                    method: "PATCH",
                },
            );
            expect(moderatorCannotChangeRoles.status).toBe(403);

            const ownerCannotChangeOwnRole = await fetch(
                `${origin}/permission/${ownerPermission!.permissionID}`,
                {
                    body: msgpack.encode({ powerLevel: 50 }),
                    headers,
                    method: "PATCH",
                },
            );
            expect(ownerCannotChangeOwnRole.status).toBe(400);

            const unsupportedRole = await fetch(
                `${origin}/permission/${memberPermission.permissionID}`,
                {
                    body: msgpack.encode({ powerLevel: 25 }),
                    headers,
                    method: "PATCH",
                },
            );
            expect(unsupportedRole.status).toBe(400);

            const [general] = await db.retrieveChannels(created.serverID);
            expect(general).toBeDefined();
            const renameChannel = await fetch(
                `${origin}/channel/${general!.channelID}`,
                {
                    body: msgpack.encode({ name: "announcements" }),
                    headers,
                    method: "PATCH",
                },
            );
            expect(renameChannel.status).toBe(200);
            expect(await decode<Channel>(renameChannel)).toMatchObject({
                name: "announcements",
            });

            const lastChannel = await fetch(
                `${origin}/channel/${general!.channelID}`,
                { headers, method: "DELETE" },
            );
            expect(lastChannel.status).toBe(409);

            const extra = await db.createChannel("extra", created.serverID);
            const deleteExtra = await fetch(
                `${origin}/channel/${extra.channelID}`,
                { headers, method: "DELETE" },
            );
            expect(deleteExtra.status).toBe(200);

            const setIcon = await fetch(
                `${origin}/server-icon/${created.serverID}/json`,
                {
                    body: msgpack.encode({
                        file: XUtils.encodeBase64(testImage),
                    }),
                    headers,
                    method: "POST",
                },
            );
            expect(setIcon.status).toBe(200);
            const withIcon = await decode<VexServer>(setIcon);
            expect(withIcon.icon).toEqual(expect.any(String));

            const iconResponse = await fetch(
                `${origin}/server-icon/${withIcon.icon!}`,
            );
            expect(iconResponse.status).toBe(200);
            expect(iconResponse.headers.get("cache-control")).toContain(
                "immutable",
            );

            const removeIcon = await fetch(
                `${origin}/server-icon/${created.serverID}`,
                { headers, method: "DELETE" },
            );
            expect(removeIcon.status).toBe(200);
            expect((await decode<VexServer>(removeIcon)).icon).toBeUndefined();
            expect(notify).toHaveBeenCalledWith(
                user.userID,
                "serverChange",
                expect.any(String),
                created.serverID,
            );
        } finally {
            await close(listener);
            await db.close();
        }
    });
});

async function close(server: Server): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) reject(error);
            else resolve();
        });
    });
}

async function decode<T>(response: Response): Promise<T> {
    return msgpack.decode(new Uint8Array(await response.arrayBuffer())) as T;
}

async function listen(app: express.Application): Promise<Server> {
    return new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            resolve(server);
        });
    });
}

async function ready(db: Database): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        db.once("ready", resolve);
        db.once("error", reject);
    });
}

function serverOrigin(server: Server): string {
    const address = server.address();
    if (!address || typeof address === "string") {
        throw new Error("Expected TCP listener.");
    }
    return `http://127.0.0.1:${String(address.port)}`;
}
