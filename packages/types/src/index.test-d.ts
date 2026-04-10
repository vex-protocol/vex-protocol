/**
 * Type-level tests for @vex-chat/types public API.
 *
 * No test runner — `tsc` catches violations at build time via
 * `tsconfig.test-types.json`. This file is excluded from the main
 * `tsconfig.json` so it never ships in `dist/`.
 */
import {
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
    typeof _user,
    typeof _device,
    typeof _baseMsg,
    typeof _successMsg,
];
