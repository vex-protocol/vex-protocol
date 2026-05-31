/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type express from "express";

import { unpack } from "msgpackr";
import { describe, expect, it, vi } from "vitest";

import { sendWireResponse } from "../server/wireResponse.ts";

describe("sendWireResponse", () => {
    it("keeps msgpack as the default response format", () => {
        const req = { query: {} } as express.Request;
        const json = vi.fn();
        const send = vi.fn();
        const res = {
            json,
            send,
        } as unknown as express.Response;

        sendWireResponse(req, res, { ok: true });

        expect(json).not.toHaveBeenCalled();
        expect(send).toHaveBeenCalledTimes(1);
        const [encoded] = send.mock.calls[0] ?? [];
        expect(unpack(encoded as Buffer)).toEqual({ ok: true });
    });

    it("returns JSON only when explicitly requested", () => {
        const req = { query: { format: "json" } } as unknown as express.Request;
        const json = vi.fn();
        const send = vi.fn();
        const res = {
            json,
            send,
        } as unknown as express.Response;

        sendWireResponse(req, res, { ok: true });

        expect(json).toHaveBeenCalledWith({ ok: true });
        expect(send).not.toHaveBeenCalled();
    });
});
