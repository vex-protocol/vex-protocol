/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Permission } from "@vex-chat/types";

import { describe, expect, it } from "vitest";

import {
    canDeletePermission,
    hasPermission,
    userHasPermission,
} from "../server/permissions.ts";

function permission(
    userID: string,
    powerLevel: number,
    permissionID = `${userID}-${String(powerLevel)}`,
): Permission {
    return {
        permissionID,
        powerLevel,
        resourceID: "server-a",
        resourceType: "server",
        userID,
    };
}

describe("server permissions", () => {
    it("treats a minimum power level as inclusive", () => {
        const permissions = [permission("alice", 50)];
        expect(hasPermission(permissions, "server-a", 50)).toBe(true);
        expect(userHasPermission(permissions, "alice", 50)).toBe(true);
    });

    it("does not let an ordinary member remove another user's permission", () => {
        const actor = permission("alice", 0);
        const target = permission("bob", 0);
        expect(canDeletePermission([actor], "alice", target, 50)).toBe(false);
    });

    it("allows self-removal and higher-power moderation", () => {
        const own = permission("alice", 0);
        const admin = permission("admin", 100);
        expect(canDeletePermission([own], "alice", own, 50)).toBe(true);
        expect(canDeletePermission([admin], "admin", own, 50)).toBe(true);
    });
});
