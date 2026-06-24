/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import {
    type AccountEntitlements,
    type AccountTier,
    type BaseMsg,
    type Device,
    MailType,
    SocketAuthErrors,
    type SuccessMsg,
    TokenScopes,
    type User,
} from "./index.js";

// ── Const values have correct literal types ─────────────────────────────────

const _register: 0 = TokenScopes.Register;
const _file: 1 = TokenScopes.File;
const _connect: 6 = TokenScopes.Connect;

const _initial: 0 = MailType.initial;
const _subsequent: 1 = MailType.subsequent;

const _tier: AccountTier = "plus";

const _badSig: 0 = SocketAuthErrors.BadSignature;
const _invalidToken: 1 = SocketAuthErrors.InvalidToken;

// ── Types accept well-formed values ─────────────────────────────────────────

const _user: User = {
    lastSeen: new Date().toISOString(),
    userID: "a",
    username: "b",
};

const _device: Device = {
    deleted: false,
    deviceID: "a",
    lastLogin: "e",
    name: "d",
    owner: "b",
    signKey: "c",
};

const _baseMsg: BaseMsg = { transmissionID: "x", type: "y" };

const _successMsg: SuccessMsg = {
    data: null,
    transmissionID: "x",
    type: "success",
};

const _entitlements: AccountEntitlements = {
    capabilities: {
        "attachments.encrypted_uploads": true,
        "calls.relay_priority": false,
        "devices.additional_slots": true,
        "identity.profile_customization": true,
        "servers.custom_invites": true,
        "servers.custom_profile": true,
        "servers.extended_assets": false,
    },
    expiresAt: null,
    limits: {
        "attachments.max_encrypted_bytes": 104857600,
        "devices.max_trusted_devices": 5,
        "identity.max_profile_assets": 4,
        "servers.max_custom_invites": 25,
        "servers.max_emoji_slots": 50,
        "servers.max_sticker_slots": 50,
    },
    refreshedAt: new Date().toISOString(),
    source: "dev_override",
    tier: _tier,
    userID: "a",
};

// Tuple export sidesteps `noUnusedLocals` — these bindings exist purely
// for compile-time assertions.
export type _Assertions = [
    typeof _register,
    typeof _file,
    typeof _connect,
    typeof _initial,
    typeof _subsequent,
    typeof _badSig,
    typeof _invalidToken,
    typeof _tier,
    typeof _user,
    typeof _device,
    typeof _baseMsg,
    typeof _successMsg,
    typeof _entitlements,
];
