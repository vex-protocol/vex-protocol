/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Device, User } from "@vex-chat/types";
import type { Server } from "node:http";

import express from "express";

import { describe, expect, it, vi } from "vitest";

import { getPasskeyDeviceRouter } from "../server/passkeyDevices.ts";

const user: User = {
    lastSeen: new Date(0).toISOString(),
    userID: "user-a",
    username: "alice",
};

const device: Device = {
    deleted: false,
    deviceID: "device-a",
    lastLogin: new Date(0).toISOString(),
    name: "desktop",
    owner: user.userID,
    signKey: "a".repeat(64),
};

describe("passkey device administration", () => {
    it("disconnects a device immediately after deleting it", async () => {
        const deleteDevice = vi.fn(() => Promise.resolve());
        const db = {
            deleteDevice,
            retrieveDevice: vi.fn((deviceID: string) =>
                Promise.resolve(deviceID === device.deviceID ? device : null),
            ),
        } as unknown as Database;
        const disconnectDevices = vi.fn();
        const notify = vi.fn();
        const app = express();
        app.use((req, _res, next) => {
            req.passkey = { passkeyID: "passkey-a" };
            req.user = user;
            next();
        });
        app.use(getPasskeyDeviceRouter(db, notify, disconnectDevices));
        const server = await listen(app);

        try {
            const address = server.address();
            if (!address || typeof address === "string") {
                throw new Error("Expected TCP listener.");
            }
            const response = await fetch(
                `http://127.0.0.1:${String(address.port)}/user/${user.userID}/passkey/devices/${device.deviceID}`,
                { method: "DELETE" },
            );

            expect(response.status).toBe(200);
            expect(deleteDevice).toHaveBeenCalledWith(device.deviceID);
            expect(disconnectDevices).toHaveBeenCalledWith([device.deviceID]);
            expect(notify).toHaveBeenCalledWith(
                user.userID,
                "deviceListChanged",
                expect.any(String),
            );
        } finally {
            await close(server);
        }
    });
});

function close(server: Server): Promise<void> {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });
}

function listen(app: express.Application): Promise<Server> {
    return new Promise((resolve) => {
        const server = app.listen(0, "127.0.0.1", () => {
            resolve(server);
        });
    });
}
