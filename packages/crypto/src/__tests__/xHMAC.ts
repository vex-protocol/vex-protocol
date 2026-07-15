/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { createHmac } from "crypto";

import { Packr } from "msgpackr";

import { xHMAC, xMessageKeySubkeys, XUtils } from "../index.js";

test("xHMAC", () => {
    const message = {
        hello: "world",
    };
    const SK =
        "b45203ef77c0a7fe7f771297f3e5c8248fe5b9f18ecf77faf8a8cef1058e630a";

    // Must match the Packr config in src/index.ts
    const packer = new Packr({ moreTypes: false, useRecords: false });
    const packedMsg = packer.pack(message);
    const hmacGen = createHmac("sha256", Buffer.from(XUtils.decodeHex(SK)));
    hmacGen.update(packedMsg);
    const expectedHMAC = XUtils.encodeHex(Uint8Array.from(hmacGen.digest()));

    // Run the actual function
    const hmac = XUtils.encodeHex(xHMAC(message, XUtils.decodeHex(SK)));

    // Compare
    expect(hmac).toBe(expectedHMAC);
});

test("message encryption and authentication keys are separated", () => {
    const messageKey = new Uint8Array(32).fill(9);
    const first = xMessageKeySubkeys(messageKey);
    const second = xMessageKeySubkeys(messageKey);

    expect(first.encryptionKey).toHaveLength(32);
    expect(first.authenticationKey).toHaveLength(32);
    expect(first.encryptionKey).not.toEqual(first.authenticationKey);
    expect(first).toEqual(second);
});
