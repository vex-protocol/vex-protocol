/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device } from "@vex-chat/types";
import type { NextFunction, Request, Response } from "express";

import jwt from "jsonwebtoken";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createCheckDevice } from "../server/index.ts";

const JWT_SECRET = "device-token-revocation-test-secret";

const tokenDevice: Device = {
    deleted: false,
    deviceID: "device-1",
    lastLogin: new Date(0).toISOString(),
    name: "device",
    owner: "user-1",
    signKey: "sign-key-1",
};

function makeReq(token: string): Request {
    return {
        headers: {
            "x-device-token": token,
        },
    } as unknown as Request;
}

describe("device-token revocation middleware", () => {
    afterEach(() => {
        delete process.env["JWT_SECRET"];
    });

    it("hydrates the device from the current database row", async () => {
        process.env["JWT_SECRET"] = JWT_SECRET;
        const currentDevice = {
            ...tokenDevice,
            lastLogin: new Date().toISOString(),
        };
        const db = {
            retrieveDevice: vi.fn(() => Promise.resolve(currentDevice)),
        };
        const token = jwt.sign({ device: tokenDevice }, JWT_SECRET);
        const req = makeReq(token);
        const next = vi.fn();

        await createCheckDevice(db as never)(
            req,
            {} as Response,
            next as NextFunction,
        );

        expect(db.retrieveDevice).toHaveBeenCalledWith(tokenDevice.deviceID);
        expect(req.device).toEqual(currentDevice);
        expect(next).toHaveBeenCalledOnce();
    });

    it("does not authenticate a token for a deleted device", async () => {
        process.env["JWT_SECRET"] = JWT_SECRET;
        const db = {
            retrieveDevice: vi.fn(() => Promise.resolve(null)),
        };
        const token = jwt.sign({ device: tokenDevice }, JWT_SECRET);
        const req = makeReq(token);
        const next = vi.fn();

        await createCheckDevice(db as never)(
            req,
            {} as Response,
            next as NextFunction,
        );

        expect(req.device).toBeUndefined();
        expect(next).toHaveBeenCalledOnce();
    });

    it("does not authenticate stale tokens after identity changes", async () => {
        process.env["JWT_SECRET"] = JWT_SECRET;
        const db = {
            retrieveDevice: vi.fn(() =>
                Promise.resolve({
                    ...tokenDevice,
                    signKey: "rotated-sign-key",
                }),
            ),
        };
        const token = jwt.sign({ device: tokenDevice }, JWT_SECRET);
        const req = makeReq(token);
        const next = vi.fn();

        await createCheckDevice(db as never)(
            req,
            {} as Response,
            next as NextFunction,
        );

        expect(req.device).toBeUndefined();
        expect(next).toHaveBeenCalledOnce();
    });
});
