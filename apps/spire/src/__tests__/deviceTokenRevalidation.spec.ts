/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device, User } from "@vex-chat/types";
import type express from "express";

import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCheckDevice } from "../server/index.ts";

const jwtSecret = "test-jwt-secret";

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
    signKey: "sign-key-a",
};

function makeReq(token: string, reqUser: undefined | User = user) {
    return {
        headers: { "x-device-token": token },
        user: reqUser,
    } as unknown as express.Request;
}

function makeToken(tokenDevice: Device = device): string {
    return jwt.sign({ device: tokenDevice }, jwtSecret);
}

describe("createCheckDevice", () => {
    afterEach(() => {
        delete process.env["JWT_SECRET"];
    });

    it("sets req.device from the current non-deleted database row", async () => {
        process.env["JWT_SECRET"] = jwtSecret;
        const db = {
            retrieveDevice: vi.fn(() => Promise.resolve(device)),
        };
        const req = makeReq(makeToken());
        const next = vi.fn();

        await createCheckDevice(db)(req, {} as express.Response, next);

        expect(req.device).toEqual(device);
        expect(db.retrieveDevice).toHaveBeenCalledWith(device.deviceID);
        expect(next).toHaveBeenCalledOnce();
    });

    it("does not trust a token for a deleted or missing device", async () => {
        process.env["JWT_SECRET"] = jwtSecret;
        const db = {
            retrieveDevice: vi.fn(() => Promise.resolve(null)),
        };
        const req = makeReq(makeToken());

        await createCheckDevice(db)(req, {} as express.Response, vi.fn());

        expect(req.device).toBeUndefined();
    });

    it("does not trust a token whose signing key no longer matches", async () => {
        process.env["JWT_SECRET"] = jwtSecret;
        const db = {
            retrieveDevice: vi.fn(() =>
                Promise.resolve({ ...device, signKey: "rotated-sign-key" }),
            ),
        };
        const req = makeReq(makeToken());

        await createCheckDevice(db)(req, {} as express.Response, vi.fn());

        expect(req.device).toBeUndefined();
    });

    it("does not bind a device token to a different bearer user", async () => {
        process.env["JWT_SECRET"] = jwtSecret;
        const db = {
            retrieveDevice: vi.fn(() => Promise.resolve(device)),
        };
        const req = makeReq(makeToken(), {
            lastSeen: new Date(0).toISOString(),
            userID: "user-b",
            username: "bob",
        });

        await createCheckDevice(db)(req, {} as express.Response, vi.fn());

        expect(req.device).toBeUndefined();
    });
});
