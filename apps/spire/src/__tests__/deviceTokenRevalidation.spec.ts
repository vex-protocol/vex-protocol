/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type { Device, User } from "@vex-chat/types";
import type express from "express";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCheckDevice, createCheckPasskey } from "../server/index.ts";
import { signAuthJwt } from "../utils/authJwt.ts";

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

const passkeyID = "passkey-a";

function makeReq(token: string, reqUser: undefined | User = user) {
    return {
        headers: { "x-device-token": token },
        user: reqUser,
    } as unknown as express.Request;
}

function makeToken(tokenDevice: Device = device): string {
    return signAuthJwt({ device: tokenDevice, scope: "device" }, "5m");
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

describe("createCheckPasskey", () => {
    function makePasskeyReq(reqUser: User = user) {
        return {
            bearerToken: "passkey-token",
            headers: {},
            passkey: { passkeyID },
            user: reqUser,
        } as unknown as express.Request;
    }

    function makePasskeyDb(row: null | { userID: string }) {
        return {
            retrievePasskeyInternal: vi.fn(() => Promise.resolve(row)),
        } as unknown as Pick<Database, "retrievePasskeyInternal">;
    }

    it("keeps a passkey session while its credential remains bound", async () => {
        const db = makePasskeyDb({ userID: user.userID });
        const req = makePasskeyReq();
        const next = vi.fn();

        await createCheckPasskey(db)(req, {} as express.Response, next);

        expect(req.passkey).toEqual({ passkeyID });
        expect(req.user).toEqual(user);
        expect(db.retrievePasskeyInternal).toHaveBeenCalledWith(passkeyID);
        expect(next).toHaveBeenCalledOnce();
    });

    it("revokes a passkey session as soon as its credential is removed", async () => {
        const db = makePasskeyDb(null);
        const req = makePasskeyReq();

        await createCheckPasskey(db)(req, {} as express.Response, vi.fn());

        expect(req.bearerToken).toBeUndefined();
        expect(req.passkey).toBeUndefined();
        expect(req.user).toBeUndefined();
    });

    it("rejects a passkey credential bound to a different account", async () => {
        const db = makePasskeyDb({ userID: "user-b" });
        const req = makePasskeyReq();

        await createCheckPasskey(db)(req, {} as express.Response, vi.fn());

        expect(req.passkey).toBeUndefined();
        expect(req.user).toBeUndefined();
    });
});
