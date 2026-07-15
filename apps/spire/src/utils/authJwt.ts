/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { JwtPayload, SignOptions } from "jsonwebtoken";

import jwt from "jsonwebtoken";

import { getJwtSecret } from "./jwtSecret.ts";

const JWT_AUDIENCE = "vex-client";
const JWT_ISSUER = "vex-spire";

export function signAuthJwt(
    payload: Record<string, unknown>,
    expiresIn: NonNullable<SignOptions["expiresIn"]>,
): string {
    return jwt.sign(payload, getJwtSecret(), {
        algorithm: "HS256",
        audience: JWT_AUDIENCE,
        expiresIn,
        issuer: JWT_ISSUER,
    });
}

export function verifyAuthJwt(token: string): JwtPayload | string {
    return jwt.verify(token, getJwtSecret(), {
        algorithms: ["HS256"],
        audience: JWT_AUDIENCE,
        issuer: JWT_ISSUER,
    });
}
