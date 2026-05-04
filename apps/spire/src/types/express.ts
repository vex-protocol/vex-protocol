/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Device, User } from "@vex-chat/types";

/**
 * Augment Express's global Request interface with the properties
 * set by checkAuth and checkDevice middleware.
 *
 * The global Express.Request is merged into express-serve-static-core's
 * Request via `extends Express.Request`, so properties added here are
 * available on `req` in all route handlers.
 */
declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace -- required for Express declaration merging
    namespace Express {
        interface Request {
            bearerToken?: string;
            device?: Device;
            exp?: number;
            /**
             * Set by `checkPasskey` middleware when the bearer token is
             * a passkey-scoped JWT. The presence of `req.passkey`
             * (without `req.device`) marks an admin-only request that
             * may list/delete devices and approve enrollments, but
             * cannot send mail or do anything device-specific.
             */
            passkey?: { passkeyID: string };
            user?: User;
        }
    }
}

export {};
