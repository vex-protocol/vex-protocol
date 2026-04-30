/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { RatchetHeader, SessionSQL } from "@vex-chat/types";

import {
    xBoxKeyPairAsync,
    xConcat,
    xDHAsync,
    xHMAC,
    xKDF,
    XUtils,
} from "@vex-chat/crypto";

const VERSION = 1;

const encoder = new TextEncoder();

export function decodeRatchetHeader(extra: Uint8Array): RatchetHeader {
    if (extra.length < 11) {
        throw new Error("Malformed ratchet header: too short.");
    }
    const view = new DataView(extra.buffer, extra.byteOffset, extra.byteLength);
    const version = view.getUint8(0);
    if (version !== VERSION) {
        throw new Error("Unsupported ratchet header version.");
    }
    const dhLen = view.getUint16(1, false);
    const expected = 3 + dhLen + 8;
    if (extra.length !== expected) {
        throw new Error("Malformed ratchet header length.");
    }
    const dhPub = extra.slice(3, 3 + dhLen);
    const pn = view.getUint32(3 + dhLen, false);
    const n = view.getUint32(7 + dhLen, false);
    return { dhPub, n, pn, version: 1 };
}

export function deriveInitialRootKey(sk: Uint8Array): Uint8Array {
    return xKDF(xConcat(sk, encoder.encode("dr-root-v1")));
}

export function encodeRatchetHeader(header: RatchetHeader): Uint8Array {
    if (header.dhPub.length > 65535) {
        throw new Error("Ratchet header dhPub too large.");
    }
    const out = new Uint8Array(3 + header.dhPub.length + 8);
    const view = new DataView(out.buffer);
    view.setUint8(0, VERSION);
    view.setUint16(1, header.dhPub.length, false);
    out.set(header.dhPub, 3);
    view.setUint32(3 + header.dhPub.length, header.pn, false);
    view.setUint32(7 + header.dhPub.length, header.n, false);
    return out;
}

export function hasRemoteDhChanged(
    current: null | Uint8Array,
    incoming: Uint8Array,
): boolean {
    if (!current) {
        return true;
    }
    return !XUtils.bytesEqual(current, incoming);
}

export async function initRatchetSession(
    sk: Uint8Array,
    mode: "initiator" | "receiver",
): Promise<{
    CKr: null | string;
    CKs: null | string;
    DHr: null | string;
    DHsPrivate: string;
    DHsPublic: string;
    Nr: number;
    Ns: number;
    PN: number;
    RK: string;
    skippedKeys: string;
}> {
    const RK = deriveInitialRootKey(sk);
    const DHs = await xBoxKeyPairAsync();
    const CKs =
        mode === "initiator"
            ? xHMAC({ label: "init-send-chain", version: VERSION }, RK)
            : null;
    return {
        CKr: null,
        CKs: CKs ? XUtils.encodeHex(CKs) : null,
        DHr: null,
        DHsPrivate: XUtils.encodeHex(DHs.secretKey),
        DHsPublic: XUtils.encodeHex(DHs.publicKey),
        Nr: 0,
        Ns: 0,
        PN: 0,
        RK: XUtils.encodeHex(RK),
        skippedKeys: "{}",
    };
}

export async function ratchetStepReceive(
    state: {
        CKr: null | Uint8Array;
        CKs: null | Uint8Array;
        DHr: null | Uint8Array;
        DHsPrivate: Uint8Array;
        DHsPublic: Uint8Array;
        Nr: number;
        Ns: number;
        PN: number;
        RK: Uint8Array;
        skippedKeys: Record<string, string>;
    },
    remoteDhPub: Uint8Array,
    pn: number,
): Promise<void> {
    if (state.CKr && state.DHr) {
        while (state.Nr < pn) {
            const { chainKey, messageKey } = kdfChain(state.CKr);
            state.CKr = chainKey;
            state.skippedKeys[skippedKeyId(state.DHr, state.Nr)] =
                XUtils.encodeHex(messageKey);
            state.Nr += 1;
        }
    }

    state.PN = state.Ns;
    state.Ns = 0;
    state.Nr = 0;
    state.CKs = null;
    state.DHr = remoteDhPub;

    const dhOut = await xDHAsync(state.DHsPrivate, remoteDhPub);
    const recv = kdfRoot(state.RK, dhOut);
    state.RK = recv.rootKey;
    state.CKr = recv.chainKey;
}

export async function ratchetStepSend(state: {
    CKr: null | Uint8Array;
    CKs: null | Uint8Array;
    DHr: null | Uint8Array;
    DHsPrivate: Uint8Array;
    DHsPublic: Uint8Array;
    Nr: number;
    Ns: number;
    PN: number;
    RK: Uint8Array;
    skippedKeys: Record<string, string>;
}): Promise<void> {
    if (!state.DHr) {
        if (!state.CKs) {
            state.CKs = xHMAC(
                { label: "bootstrap-send-chain", version: VERSION },
                state.RK,
            );
        }
        return;
    }
    const nextDh = await xBoxKeyPairAsync();
    state.PN = state.Ns;
    state.Ns = 0;
    state.DHsPrivate = nextDh.secretKey;
    state.DHsPublic = nextDh.publicKey;
    const dhOut = await xDHAsync(state.DHsPrivate, state.DHr);
    const send = kdfRoot(state.RK, dhOut);
    state.RK = send.rootKey;
    state.CKs = send.chainKey;
}

export function sessionToSqlPatch(session: {
    CKr: null | Uint8Array;
    CKs: null | Uint8Array;
    DHr: null | Uint8Array;
    DHsPrivate: Uint8Array;
    DHsPublic: Uint8Array;
    Nr: number;
    Ns: number;
    PN: number;
    RK: Uint8Array;
    skippedKeys: Record<string, string>;
}): Pick<
    SessionSQL,
    | "CKr"
    | "CKs"
    | "DHr"
    | "DHsPrivate"
    | "DHsPublic"
    | "Nr"
    | "Ns"
    | "PN"
    | "RK"
    | "skippedKeys"
> {
    return {
        CKr: session.CKr ? XUtils.encodeHex(session.CKr) : null,
        CKs: session.CKs ? XUtils.encodeHex(session.CKs) : null,
        DHr: session.DHr ? XUtils.encodeHex(session.DHr) : null,
        DHsPrivate: XUtils.encodeHex(session.DHsPrivate),
        DHsPublic: XUtils.encodeHex(session.DHsPublic),
        Nr: session.Nr,
        Ns: session.Ns,
        PN: session.PN,
        RK: XUtils.encodeHex(session.RK),
        skippedKeys: JSON.stringify(session.skippedKeys),
    };
}

export function takeReceiveMessageKey(
    state: {
        CKr: null | Uint8Array;
        DHr: null | Uint8Array;
        Nr: number;
        skippedKeys: Record<string, string>;
    },
    remoteDhPub: Uint8Array,
    n: number,
): Uint8Array {
    const skippedId = skippedKeyId(remoteDhPub, n);
    const skipped = state.skippedKeys[skippedId];
    if (skipped) {
        const { [skippedId]: _discarded, ...rest } = state.skippedKeys;
        state.skippedKeys = rest;
        return XUtils.decodeHex(skipped);
    }

    if (!state.CKr) {
        throw new Error("Missing receiving chain key.");
    }

    while (state.Nr < n) {
        const { chainKey, messageKey } = kdfChain(state.CKr);
        state.CKr = chainKey;
        if (!state.DHr) {
            throw new Error("Missing DHr when storing skipped key.");
        }
        state.skippedKeys[skippedKeyId(state.DHr, state.Nr)] =
            XUtils.encodeHex(messageKey);
        state.Nr += 1;
    }

    const { chainKey, messageKey } = kdfChain(state.CKr);
    state.CKr = chainKey;
    state.Nr += 1;
    return messageKey;
}

export function takeSendMessageKey(state: {
    CKs: null | Uint8Array;
    Ns: number;
}): { messageKey: Uint8Array; n: number } {
    if (!state.CKs) {
        throw new Error("Missing sending chain key.");
    }
    const n = state.Ns;
    const { chainKey, messageKey } = kdfChain(state.CKs);
    state.CKs = chainKey;
    state.Ns += 1;
    return { messageKey, n };
}

function kdfChain(ck: Uint8Array): {
    chainKey: Uint8Array;
    messageKey: Uint8Array;
} {
    return {
        chainKey: xHMAC({ label: "ck-next", version: VERSION }, ck),
        messageKey: xHMAC({ label: "msg-key", version: VERSION }, ck),
    };
}

function kdfRoot(
    rootKey: Uint8Array,
    dhOut: Uint8Array,
): { chainKey: Uint8Array; rootKey: Uint8Array } {
    const material = xKDF(xConcat(rootKey, dhOut, encoder.encode("dr-v1")));
    return {
        chainKey: xHMAC({ label: "chain", version: VERSION }, material),
        rootKey: xHMAC({ label: "root", version: VERSION }, material),
    };
}

function skippedKeyId(dhPub: Uint8Array, n: number): string {
    return `${XUtils.encodeHex(dhPub)}:${String(n)}`;
}
