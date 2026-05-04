/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import express from "express";

const HEX_FINGERPRINT = /^[0-9a-fA-F]{2}(?::?[0-9a-fA-F]{2}){31}$/;

/**
 * Build the Apple App Site Association body, or `null` when the
 * server isn't configured to advertise any iOS apps.
 */
export function buildAppleAppSiteAssociation(): null | {
    webcredentials: { apps: string[] };
} {
    const apps = parseList(process.env["SPIRE_PASSKEY_IOS_APP_IDS"]);
    if (apps.length === 0) {
        return null;
    }
    return { webcredentials: { apps } };
}

/**
 * Build the Android Digital Asset Links body, or `null` when the
 * server isn't configured to advertise an Android app.
 */
export function buildAssetLinks():
    | null
    | {
          relation: string[];
          target: {
              namespace: "android_app";
              package_name: string;
              sha256_cert_fingerprints: string[];
          };
      }[] {
    const packageName = process.env["SPIRE_PASSKEY_ANDROID_PACKAGE"]?.trim();
    const fingerprintsRaw = parseList(
        process.env["SPIRE_PASSKEY_ANDROID_FINGERPRINTS"],
    );
    if (!packageName || fingerprintsRaw.length === 0) {
        return null;
    }
    const fingerprints: string[] = [];
    for (const raw of fingerprintsRaw) {
        const norm = normalizeFingerprint(raw);
        if (norm != null) {
            fingerprints.push(norm);
        }
    }
    if (fingerprints.length === 0) {
        return null;
    }
    return [
        {
            relation: [
                "delegate_permission/common.get_login_creds",
                "delegate_permission/common.handle_all_urls",
            ],
            target: {
                namespace: "android_app",
                package_name: packageName,
                sha256_cert_fingerprints: fingerprints,
            },
        },
    ];
}

/**
 * Normalize a SHA-256 fingerprint to upper-case `AA:BB:...` form.
 *
 * Accepts hex with or without colon separators. Returns `null` for
 * anything that isn't a valid 32-byte SHA-256 hex value.
 */
export function normalizeFingerprint(raw: string): null | string {
    if (!HEX_FINGERPRINT.test(raw)) {
        return null;
    }
    const hex = raw.replace(/:/g, "").toUpperCase();
    const pairs = hex.match(/.{2}/g);
    return pairs ? pairs.join(":") : null;
}

function parseList(envValue: string | undefined): string[] {
    if (envValue == null) {
        return [];
    }
    return envValue
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/**
 * Serves the WebAuthn well-known association files Apple and Google
 * fetch to verify the app ↔ domain link before letting their
 * Credential Manager run a passkey ceremony.
 *
 * Both files are served at their canonical paths and 404 when the
 * corresponding env vars are not set, so a non-passkey deployment is
 * indistinguishable from one that simply hasn't published an app yet.
 *
 * Env:
 * - `SPIRE_PASSKEY_IOS_APP_IDS` — comma-separated `TEAMID.bundle.id`
 *   for the AASA `webcredentials.apps` array (e.g.
 *   `ABCDE12345.chat.vex.mobile`). Required for iOS.
 * - `SPIRE_PASSKEY_ANDROID_PACKAGE` — Android package name. Required
 *   for Android together with `SPIRE_PASSKEY_ANDROID_FINGERPRINTS`.
 * - `SPIRE_PASSKEY_ANDROID_FINGERPRINTS` — comma-separated SHA-256
 *   fingerprints (with or without colons) of the certs that sign the
 *   Android app.
 *
 * Mount this router BEFORE the global rate limiter so periodic
 * platform fetches are never 429'd.
 */
export const getWellKnownRouter = (): express.Router => {
    const router = express.Router();

    router.get("/.well-known/apple-app-site-association", (_req, res) => {
        const body = buildAppleAppSiteAssociation();
        if (!body) {
            res.sendStatus(404);
            return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).end(JSON.stringify(body));
    });

    router.get("/.well-known/assetlinks.json", (_req, res) => {
        const body = buildAssetLinks();
        if (!body) {
            res.sendStatus(404);
            return;
        }
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "public, max-age=300");
        res.status(200).end(JSON.stringify(body));
    });

    return router;
};
