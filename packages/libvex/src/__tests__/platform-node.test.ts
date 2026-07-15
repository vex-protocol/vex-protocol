/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientOptions } from "../index.js";

import { createNodeStorage } from "../storage/node.js";
import { resolveAtRestAesKeyFromSignKeyHex } from "../utils/resolveAtRestAesKey.js";

import { platformSuite } from "./harness/shared-suite.js";

platformSuite("node", async (SK: string, _opts: ClientOptions) => {
    const atRest = await resolveAtRestAesKeyFromSignKeyHex(SK);
    return createNodeStorage(":memory:", atRest);
});
