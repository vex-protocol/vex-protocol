/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { Database } from "../Database.ts";
import type {
    AuthenticationResponseJSON,
    AuthenticatorTransportFuture,
    RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Passkey } from "@vex-chat/types";

import express from "express";

import { XUtils } from "@vex-chat/crypto";
import {
    PasskeyAuthFinishPayloadSchema,
    PasskeyAuthStartPayloadSchema,
    PasskeyRegistrationFinishPayloadSchema,
    PasskeyRegistrationStartPayloadSchema,
} from "@vex-chat/types";

import {
    generateAuthenticationOptions,
    generateRegistrationOptions,
    verifyAuthenticationResponse,
    verifyRegistrationResponse,
} from "@simplewebauthn/server";
import jwt from "jsonwebtoken";

import { JWT_EXPIRY_PASSKEY } from "../Spire.ts";
import { getJwtSecret } from "../utils/jwtSecret.ts";
import { msgpack } from "../utils/msgpack.ts";

import { AppError } from "./errors.ts";
import { authLimiter } from "./rateLimit.ts";
import { censorUser, getParam, getUser } from "./utils.ts";
import { buildAndroidApkKeyHashOrigins } from "./wellKnown.ts";

import { protect } from "./index.ts";

const REGISTRATION_TTL_MS = 5 * 60 * 1000; // 5 min
const AUTHENTICATION_TTL_MS = 5 * 60 * 1000;
// Cap each user's passkey count so a compromised JWT can't fill the
// table. WebAuthn-style apps typically allow ~20; we go conservative.
const MAX_PASSKEYS_PER_USER = 10;

interface PendingAuthentication {
    challenge: string;
    createdAt: number;
    userID: string;
}

interface PendingRegistration {
    challenge: string;
    createdAt: number;
    name: string;
    userID: string;
}

const pendingRegistrations = new Map<string, PendingRegistration>();
const pendingAuthentications = new Map<string, PendingAuthentication>();

/**
 * Returns the WebAuthn relying-party config from the environment.
 *
 * - `SPIRE_PASSKEY_RP_ID` — RP ID (eTLD+1 of the user-facing host the
 *   client is loaded from, e.g. `vex.wtf` or `localhost`). Required.
 * - `SPIRE_PASSKEY_RP_NAME` — display name for prompts. Defaults to
 *   "Vex".
 * - `SPIRE_PASSKEY_ORIGINS` — comma-separated allowlist of expected
 *   client origins (e.g. `https://app.vex.wtf,tauri://localhost,
 *   http://localhost:5173`). Required: WebAuthn binds an assertion
 *   to its origin and we must check it explicitly.
 *
 * The returned `expectedOrigin` list also includes any
 * `android:apk-key-hash:<base64url>` entries derived from
 * `SPIRE_PASSKEY_ANDROID_FINGERPRINTS` (see
 * `buildAndroidApkKeyHashOrigins`). Native Android Credential
 * Manager sets `clientDataJSON.origin` to that string instead of the
 * RP host, so we accept it implicitly whenever the operator has
 * already advertised the cert via the assetlinks file.
 */
function getRpConfig(): {
    expectedOrigin: string[];
    rpID: string;
    rpName: string;
} {
    const rpID = process.env["SPIRE_PASSKEY_RP_ID"]?.trim();
    const originsRaw = process.env["SPIRE_PASSKEY_ORIGINS"]?.trim();
    if (!rpID) {
        throw new AppError(
            500,
            "Passkeys are not configured on this server (SPIRE_PASSKEY_RP_ID is unset).",
        );
    }
    if (!originsRaw) {
        throw new AppError(
            500,
            "Passkeys are not configured on this server (SPIRE_PASSKEY_ORIGINS is unset).",
        );
    }
    const explicitOrigins = originsRaw
        .split(",")
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
    if (explicitOrigins.length === 0) {
        throw new AppError(500, "SPIRE_PASSKEY_ORIGINS is empty.");
    }
    const expectedOrigin = Array.from(
        new Set([...explicitOrigins, ...buildAndroidApkKeyHashOrigins()]),
    );
    return {
        expectedOrigin,
        rpID,
        rpName: process.env["SPIRE_PASSKEY_RP_NAME"]?.trim() || "Vex",
    };
}

function pruneAuthentications(nowMs = Date.now()): void {
    for (const [id, entry] of pendingAuthentications.entries()) {
        if (nowMs - entry.createdAt > AUTHENTICATION_TTL_MS) {
            pendingAuthentications.delete(id);
        }
    }
}

function pruneRegistrations(nowMs = Date.now()): void {
    for (const [id, entry] of pendingRegistrations.entries()) {
        if (nowMs - entry.createdAt > REGISTRATION_TTL_MS) {
            pendingRegistrations.delete(id);
        }
    }
}

const KNOWN_TRANSPORTS = [
    "ble",
    "cable",
    "hybrid",
    "internal",
    "nfc",
    "smart-card",
    "usb",
] as const satisfies readonly AuthenticatorTransportFuture[];

function isKnownTransport(s: string): s is AuthenticatorTransportFuture {
    return (KNOWN_TRANSPORTS as readonly string[]).includes(s);
}

function sanitizeTransports(input: string[]): AuthenticatorTransportFuture[] {
    return input.filter(isKnownTransport);
}

/**
 * Issues a passkey-scoped JWT.
 *
 * Carries `scope: "passkey"` and the owning userID; deliberately
 * shorter-lived than a device JWT (5 min vs 7 days) because a
 * passkey JWT grants destructive admin powers (delete a device,
 * approve an enrollment) without further user verification. Callers
 * re-do the WebAuthn ceremony when this expires.
 */
function signPasskeyToken(args: {
    passkeyID: string;
    user: ReturnType<typeof censorUser>;
}): string {
    return jwt.sign(
        {
            passkey: { passkeyID: args.passkeyID },
            scope: "passkey" as const,
            user: args.user,
        },
        getJwtSecret(),
        { expiresIn: JWT_EXPIRY_PASSKEY },
    );
}

export const getPasskeyRouter = (db: Database) => {
    const router = express.Router();

    // ── Authenticated registration (an existing device adds a passkey) ──

    router.post(
        "/user/:id/passkeys/register/begin",
        protect,
        async (req, res) => {
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            // Passwords/passkey JWTs both come through `protect`; only
            // a real device session may add a passkey to keep the
            // recovery story symmetric with device delete (a passkey
            // can't bootstrap another passkey).
            if (!req.device) {
                res.status(401).send({
                    error: "Adding a passkey requires an authenticated device.",
                });
                return;
            }

            const parsed = PasskeyRegistrationStartPayloadSchema.safeParse(
                req.body,
            );
            if (!parsed.success) {
                res.status(400).json({
                    error: "Invalid registration payload",
                    issues: parsed.error.issues,
                });
                return;
            }

            const existing = await db.retrievePasskeysByUser(userID);
            if (existing.length >= MAX_PASSKEYS_PER_USER) {
                res.status(409).send({
                    error: `Each account is limited to ${MAX_PASSKEYS_PER_USER} passkeys.`,
                });
                return;
            }

            const { rpID, rpName } = getRpConfig();
            // The userID we hand to the authenticator is the account
            // userID encoded as bytes; this scopes the credential to
            // the account so re-registering on the same authenticator
            // updates the existing credential instead of stacking.
            const userIDBytes = new TextEncoder().encode(userID);

            const options = await generateRegistrationOptions({
                attestationType: "none",
                authenticatorSelection: {
                    requireResidentKey: false,
                    residentKey: "preferred",
                    userVerification: "preferred",
                },
                excludeCredentials: [],
                rpID,
                rpName,
                userDisplayName: userDetails.username,
                userID: userIDBytes,
                userName: userDetails.username,
            });

            pruneRegistrations();
            const requestID = crypto.randomUUID();
            pendingRegistrations.set(requestID, {
                challenge: options.challenge,
                createdAt: Date.now(),
                name: parsed.data.name,
                userID,
            });

            // PasskeyRegistrationOptions in @vex-chat/types uses a
            // looser interface than @simplewebauthn/server (so this
            // shared types package doesn't take a runtime dep on
            // SimpleWebAuthn). The wire shape is identical — both
            // sides hand the JSON straight to navigator.credentials.
            res.send(
                msgpack.encode({
                    options,
                    requestID,
                }),
            );
        },
    );

    router.post(
        "/user/:id/passkeys/register/finish",
        protect,
        async (req, res) => {
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            if (!req.device) {
                res.status(401).send({
                    error: "Adding a passkey requires an authenticated device.",
                });
                return;
            }

            const parsed = PasskeyRegistrationFinishPayloadSchema.safeParse(
                req.body,
            );
            if (!parsed.success) {
                res.status(400).json({
                    error: "Invalid finish payload",
                    issues: parsed.error.issues,
                });
                return;
            }

            pruneRegistrations();
            const pending = pendingRegistrations.get(parsed.data.requestID);
            if (!pending || pending.userID !== userID) {
                res.status(404).send({
                    error: "Registration request not found or expired.",
                });
                return;
            }
            // Single-use challenge: clear immediately so a replay can't
            // re-bind the credential to a second name.
            pendingRegistrations.delete(parsed.data.requestID);

            const { expectedOrigin, rpID } = getRpConfig();

            let verification;
            try {
                // The browser's RegistrationResponseJSON is opaque to
                // spire — simplewebauthn does the full structural
                // decode + signature verification on this argument,
                // so the cast from a generic `Record<string, unknown>`
                // to the branded type is the trust boundary.
                const rawResponse = parsed.data.response as unknown;
                verification = await verifyRegistrationResponse({
                    expectedChallenge: pending.challenge,
                    expectedOrigin,
                    expectedRPID: rpID,
                    requireUserVerification: false,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- structurally validated by simplewebauthn below
                    response: rawResponse as RegistrationResponseJSON,
                });
            } catch (err: unknown) {
                const message =
                    err instanceof Error ? err.message : String(err);
                res.status(400).send({
                    error: "Passkey attestation invalid: " + message,
                });
                return;
            }

            if (!verification.verified) {
                res.status(400).send({ error: "Passkey attestation failed." });
                return;
            }

            const credential = verification.registrationInfo.credential;

            const dupe = await db.retrievePasskeyByCredentialID(credential.id);
            if (dupe) {
                res.status(409).send({
                    error: "This authenticator is already registered.",
                });
                return;
            }

            const transports = sanitizeTransports(credential.transports ?? []);

            // Re-check the per-user cap inside the finish step in case
            // a concurrent request just consumed the last available
            // slot. `MAX_PASSKEYS_PER_USER` is the source of truth.
            const after = await db.retrievePasskeysByUser(userID);
            if (after.length >= MAX_PASSKEYS_PER_USER) {
                res.status(409).send({
                    error: `Each account is limited to ${MAX_PASSKEYS_PER_USER} passkeys.`,
                });
                return;
            }

            const created = await db.createPasskey(
                userID,
                pending.name,
                credential.id,
                XUtils.encodeHex(credential.publicKey),
                // The COSE alg is reported back in `info.fmt`-adjacent
                // helpers, but `WebAuthnCredential` only carries the
                // public key; verifyAuthenticationResponse re-derives
                // the alg from the COSE_Key bytes. We persist a
                // best-effort algorithm hint as 0 when unavailable and
                // refuse no algorithms here — verification time is
                // where the real check happens.
                0,
                transports,
            );

            res.send(msgpack.encode(created));
        },
    );

    router.get("/user/:id/passkeys", protect, async (req, res) => {
        const userDetails = getUser(req);
        const userID = getParam(req, "id");
        if (userDetails.userID !== userID) {
            res.sendStatus(401);
            return;
        }
        const list: Passkey[] = await db.retrievePasskeysByUser(userID);
        res.send(msgpack.encode(list));
    });

    router.delete(
        "/user/:id/passkeys/:passkeyID",
        protect,
        async (req, res) => {
            const userDetails = getUser(req);
            const userID = getParam(req, "id");
            const passkeyID = getParam(req, "passkeyID");
            if (userDetails.userID !== userID) {
                res.sendStatus(401);
                return;
            }
            const row = await db.retrievePasskeyInternal(passkeyID);
            if (!row || row.userID !== userID) {
                res.sendStatus(404);
                return;
            }
            await db.deletePasskey(passkeyID);
            res.sendStatus(200);
        },
    );

    // ── Public passkey login ───────────────────────────────────────────

    router.post("/auth/passkey/begin", authLimiter, async (req, res) => {
        const parsed = PasskeyAuthStartPayloadSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid begin payload",
                issues: parsed.error.issues,
            });
            return;
        }

        const user = await db.retrieveUser(parsed.data.username);
        if (!user) {
            // Don't reveal whether the username exists — return a
            // generic 401 here. (Some flows return a generated stub
            // challenge for username-less / discoverable creds; not
            // implemented yet.)
            res.sendStatus(401);
            return;
        }

        const passkeys = await db.retrievePasskeysByUser(user.userID);
        if (passkeys.length === 0) {
            res.sendStatus(401);
            return;
        }

        const allowCredentials = await Promise.all(
            passkeys.map(async (pk) => {
                const internal = await db.retrievePasskeyInternal(pk.passkeyID);
                return {
                    id: internal?.credentialID ?? "",
                    transports: pk.transports.filter(isKnownTransport),
                    type: "public-key" as const,
                };
            }),
        );

        const { rpID } = getRpConfig();

        const options = await generateAuthenticationOptions({
            allowCredentials: allowCredentials.filter((c) => c.id.length > 0),
            rpID,
            userVerification: "preferred",
        });

        pruneAuthentications();
        const requestID = crypto.randomUUID();
        pendingAuthentications.set(requestID, {
            challenge: options.challenge,
            createdAt: Date.now(),
            userID: user.userID,
        });

        res.send(
            msgpack.encode({
                options,
                requestID,
            }),
        );
    });

    router.post("/auth/passkey/finish", authLimiter, async (req, res) => {
        const parsed = PasskeyAuthFinishPayloadSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: "Invalid finish payload",
                issues: parsed.error.issues,
            });
            return;
        }

        pruneAuthentications();
        const pending = pendingAuthentications.get(parsed.data.requestID);
        if (!pending) {
            res.status(401).send({
                error: "Authentication challenge not found or expired.",
            });
            return;
        }
        // Single-use.
        pendingAuthentications.delete(parsed.data.requestID);

        // The browser's AuthenticationResponseJSON is opaque to spire
        // — simplewebauthn does the structural decode + signature
        // verification. The cast from `Record<string, unknown>` to
        // the branded type is the trust boundary.
        const rawAssertion = parsed.data.response as unknown;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- structurally validated by simplewebauthn below
        const assertion = rawAssertion as AuthenticationResponseJSON;
        const credentialID =
            typeof assertion.id === "string" ? assertion.id : "";
        if (!credentialID) {
            res.status(400).send({
                error: "Assertion is missing a credential id.",
            });
            return;
        }

        const passkeyRow = await db.retrievePasskeyByCredentialID(credentialID);
        if (!passkeyRow || passkeyRow.userID !== pending.userID) {
            res.status(401).send({
                error: "No matching passkey for this account.",
            });
            return;
        }

        const { expectedOrigin, rpID } = getRpConfig();

        // Force `Uint8Array<ArrayBuffer>` (not `ArrayBufferLike`) so
        // simplewebauthn's strict generic accepts the buffer; the
        // raw decoded bytes are identical.
        const credentialPublicKey = new Uint8Array(
            XUtils.decodeHex(passkeyRow.publicKey),
        );

        let verification;
        try {
            verification = await verifyAuthenticationResponse({
                credential: {
                    counter: passkeyRow.signCount,
                    id: passkeyRow.credentialID,
                    publicKey: credentialPublicKey,
                    transports: passkeyRow.transports
                        .split(",")
                        .filter(isKnownTransport),
                },
                expectedChallenge: pending.challenge,
                expectedOrigin,
                expectedRPID: rpID,
                requireUserVerification: false,
                response: assertion,
            });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            res.status(401).send({
                error: "Passkey assertion invalid: " + message,
            });
            return;
        }

        if (!verification.verified) {
            res.status(401).send({ error: "Passkey assertion failed." });
            return;
        }

        // Counter should be strictly increasing per the WebAuthn spec.
        // FIDO authenticators that report 0 are excused (the spec says
        // 0→0 is legitimate when the authenticator has no counter).
        const newCounter = verification.authenticationInfo.newCounter;
        if (
            newCounter !== 0 &&
            passkeyRow.signCount !== 0 &&
            newCounter <= passkeyRow.signCount
        ) {
            res.status(401).send({
                error: "Authenticator counter regressed (possible cloned credential).",
            });
            return;
        }

        await db.markPasskeyUsed(passkeyRow.passkeyID, newCounter);

        const user = await db.retrieveUser(pending.userID);
        if (!user) {
            res.status(404).send({ error: "Account not found." });
            return;
        }
        const censored = censorUser(user);
        const token = signPasskeyToken({
            passkeyID: passkeyRow.passkeyID,
            user: censored,
        });
        res.send(
            msgpack.encode({
                passkeyID: passkeyRow.passkeyID,
                token,
                user: censored,
            }),
        );
    });

    return router;
};
