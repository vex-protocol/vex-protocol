#!/usr/bin/env node
/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { randomBytes } from "node:crypto";

import nacl from "tweetnacl";

const here = dirname(fileURLToPath(import.meta.url));
const spireRoot = join(here, "..");
const envPath = join(spireRoot, ".env");
const envExamplePath = join(spireRoot, ".env.example");

const args = new Set(process.argv.slice(2));
const force = args.has("--force") || args.has("-f");
const fips = args.has("--fips");
const dev = args.has("--dev");

if (existsSync(envPath) && !force) {
    console.error(
        "apps/spire/.env already exists. Refusing to overwrite; pass --force to rotate keys.",
    );
    process.exit(1);
}

const { jwtSecret, spk } = fips ? await generateFipsKeys() : generateNaclKeys();
const template = readFileSync(envExamplePath, "utf8");

const env = template
    .replace(/^SPK=.*$/m, `SPK="${spk}"`)
    .replace(/^JWT_SECRET=.*$/m, `JWT_SECRET="${jwtSecret}"`)
    .replace(/^SPIRE_FIPS=.*$/m, `SPIRE_FIPS=${fips ? "true" : "false"}`)
    .replace(/^DB_TYPE=.*$/m, "DB_TYPE=sqlite3");

const extra = dev
    ? `\n# Dev/load-testing only. Do not set in production.\nDEV_API_KEY="${randomBytes(24).toString("hex")}"\n`
    : "";

writeFileSync(envPath, `${env.trimEnd()}\n${extra}`, { mode: 0o600 });

console.log(`Created ${envPath}`);
console.log(`Crypto profile: ${fips ? "fips" : "tweetnacl"}`);
if (dev) {
    console.log("Included DEV_API_KEY for local/staging load testing.");
}

function generateNaclKeys() {
    const pair = nacl.sign.keyPair();
    return {
        jwtSecret: randomBytes(32).toString("hex"),
        spk: Buffer.from(pair.secretKey).toString("hex"),
    };
}

async function generateFipsKeys() {
    const keyPair = await crypto.subtle.generateKey(
        {
            namedCurve: "P-256",
            name: "ECDSA",
        },
        true,
        ["sign", "verify"],
    );
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    return {
        jwtSecret: randomBytes(32).toString("hex"),
        spk: Buffer.from(pkcs8).toString("hex"),
    };
}
