/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { XUtils } from "@vex-chat/crypto";

import { describe, expect, it } from "vitest";

import {
    decodeRatchetHeader,
    encodeRatchetHeader,
    hasRemoteDhChanged,
    initRatchetSession,
    ratchetStepReceive,
    ratchetStepSend,
    takeReceiveMessageKey,
    takeSendMessageKey,
} from "../utils/ratchet.js";

describe("double ratchet helpers", () => {
    it("derives matching message keys for first exchange and reply", async () => {
        const sk = XUtils.decodeHex(
            "1111111111111111111111111111111111111111111111111111111111111111",
        );
        const alice = await initRatchetSession(sk, "initiator");
        const bob = await initRatchetSession(sk, "receiver");

        const aliceState = {
            CKr: alice.CKr ? XUtils.decodeHex(alice.CKr) : null,
            CKs: alice.CKs ? XUtils.decodeHex(alice.CKs) : null,
            DHr: alice.DHr ? XUtils.decodeHex(alice.DHr) : null,
            DHsPrivate: XUtils.decodeHex(alice.DHsPrivate),
            DHsPublic: XUtils.decodeHex(alice.DHsPublic),
            Nr: alice.Nr,
            Ns: alice.Ns,
            PN: alice.PN,
            RK: XUtils.decodeHex(alice.RK),
            skippedKeys: {} as Record<string, string>,
        };
        const bobState = {
            CKr: bob.CKr ? XUtils.decodeHex(bob.CKr) : null,
            CKs: bob.CKs ? XUtils.decodeHex(bob.CKs) : null,
            DHr: bob.DHr ? XUtils.decodeHex(bob.DHr) : null,
            DHsPrivate: XUtils.decodeHex(bob.DHsPrivate),
            DHsPublic: XUtils.decodeHex(bob.DHsPublic),
            Nr: bob.Nr,
            Ns: bob.Ns,
            PN: bob.PN,
            RK: XUtils.decodeHex(bob.RK),
            skippedKeys: {} as Record<string, string>,
        };

        await ratchetStepSend(aliceState);
        const a1 = takeSendMessageKey(aliceState);
        const h1 = decodeRatchetHeader(
            encodeRatchetHeader({
                dhPub: aliceState.DHsPublic,
                n: a1.n,
                pn: aliceState.PN,
                version: 1,
            }),
        );

        expect(hasRemoteDhChanged(bobState.DHr, h1.dhPub)).toBe(true);
        await ratchetStepReceive(bobState, h1.dhPub, h1.pn);
        const b1 = takeReceiveMessageKey(bobState, h1.dhPub, h1.n);
        expect(XUtils.bytesEqual(a1.messageKey, b1)).toBe(true);

        await ratchetStepSend(bobState);
        const bReply = takeSendMessageKey(bobState);
        const h2 = decodeRatchetHeader(
            encodeRatchetHeader({
                dhPub: bobState.DHsPublic,
                n: bReply.n,
                pn: bobState.PN,
                version: 1,
            }),
        );
        await ratchetStepReceive(aliceState, h2.dhPub, h2.pn);
        const aReply = takeReceiveMessageKey(aliceState, h2.dhPub, h2.n);
        expect(XUtils.bytesEqual(aReply, bReply.messageKey)).toBe(true);
    });

    it("supports skipped keys for out-of-order messages", async () => {
        const sk = XUtils.decodeHex(
            "2222222222222222222222222222222222222222222222222222222222222222",
        );
        const initiator = await initRatchetSession(sk, "initiator");
        const receiver = await initRatchetSession(sk, "receiver");

        const s = {
            CKr: initiator.CKr ? XUtils.decodeHex(initiator.CKr) : null,
            CKs: initiator.CKs ? XUtils.decodeHex(initiator.CKs) : null,
            DHr: initiator.DHr ? XUtils.decodeHex(initiator.DHr) : null,
            DHsPrivate: XUtils.decodeHex(initiator.DHsPrivate),
            DHsPublic: XUtils.decodeHex(initiator.DHsPublic),
            Nr: initiator.Nr,
            Ns: initiator.Ns,
            PN: initiator.PN,
            RK: XUtils.decodeHex(initiator.RK),
            skippedKeys: {} as Record<string, string>,
        };
        const r = {
            CKr: receiver.CKr ? XUtils.decodeHex(receiver.CKr) : null,
            CKs: receiver.CKs ? XUtils.decodeHex(receiver.CKs) : null,
            DHr: receiver.DHr ? XUtils.decodeHex(receiver.DHr) : null,
            DHsPrivate: XUtils.decodeHex(receiver.DHsPrivate),
            DHsPublic: XUtils.decodeHex(receiver.DHsPublic),
            Nr: receiver.Nr,
            Ns: receiver.Ns,
            PN: receiver.PN,
            RK: XUtils.decodeHex(receiver.RK),
            skippedKeys: {} as Record<string, string>,
        };

        await ratchetStepSend(s);
        const m0 = takeSendMessageKey(s);
        const m1 = takeSendMessageKey(s);
        const h0 = {
            dhPub: s.DHsPublic,
            n: m0.n,
            pn: s.PN,
            version: 1 as const,
        };
        const h1 = {
            dhPub: s.DHsPublic,
            n: m1.n,
            pn: s.PN,
            version: 1 as const,
        };

        await ratchetStepReceive(r, h1.dhPub, h1.pn);
        const r1 = takeReceiveMessageKey(r, h1.dhPub, h1.n);
        expect(XUtils.bytesEqual(r1, m1.messageKey)).toBe(true);

        const r0 = takeReceiveMessageKey(r, h0.dhPub, h0.n);
        expect(XUtils.bytesEqual(r0, m0.messageKey)).toBe(true);
    });
});
