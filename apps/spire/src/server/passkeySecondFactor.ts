/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";

export async function passkeySecondFactorError(
    db: Database,
    userID: string,
    passkeyID: string | undefined,
    mismatchError: string,
    options?: { trustedDeviceID?: string },
): Promise<null | string> {
    if (
        options?.trustedDeviceID &&
        (await db.isDevicePasskeyApproved(userID, options.trustedDeviceID))
    ) {
        return null;
    }

    const passkeys = await db.retrievePasskeysByUser(userID);
    if (passkeys.length === 0) {
        return null;
    }
    if (!passkeyID) {
        return "Passkey verification required.";
    }
    const passkey = await db.retrievePasskeyInternal(passkeyID);
    if (!passkey || passkey.userID !== userID) {
        return mismatchError;
    }
    return null;
}
