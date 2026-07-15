/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { StoredCredentials } from "../types/index.js";

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeKeyStore } from "../keystore/node.js";

const dirs: string[] = [];

afterEach(() => {
    for (const dir of dirs.splice(0)) {
        fs.rmSync(dir, { force: true, recursive: true });
    }
});

describe("NodeKeyStore", () => {
    it("round-trips credentials through the encrypted file", async () => {
        const dir = makeTempDir();
        const store = new NodeKeyStore("correct horse battery staple", dir);
        const credentials: StoredCredentials = {
            deviceID: "device-id",
            deviceKey: "ab".repeat(64),
            preKey: "cd".repeat(32),
            token: "saved-token",
            username: "alice",
        };

        await store.save(credentials);

        await expect(store.load("alice")).resolves.toEqual(credentials);
        await expect(store.load()).resolves.toEqual(credentials);
        const raw = fs.readFileSync(path.join(dir, "alice.vex"));
        expect(raw.toString("utf8")).not.toContain("saved-token");
        expect(fs.statSync(path.join(dir, "alice.vex")).mode & 0o777).toBe(
            0o600,
        );
    });

    it("keeps usernames inside the configured directory", async () => {
        const dir = makeTempDir();
        const store = new NodeKeyStore("password", dir);

        await store.save({
            deviceID: "device-id",
            deviceKey: "ab".repeat(64),
            username: "../outside",
        });

        expect(fs.readdirSync(dir)).toEqual(["..%2Foutside.vex"]);
        await expect(store.load("../outside")).resolves.toMatchObject({
            username: "../outside",
        });
    });
});

function makeTempDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vex-keystore-"));
    dirs.push(dir);
    return dir;
}
