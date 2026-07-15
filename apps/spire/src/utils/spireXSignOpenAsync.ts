/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { xSignOpen } from "@vex-chat/crypto";

/** Ed25519 detached-verify open. */
export function spireXSignOpenAsync(
    signedMessage: Uint8Array,
    publicKey: Uint8Array,
): Promise<null | Uint8Array> {
    return Promise.resolve(xSignOpen(signedMessage, publicKey));
}
