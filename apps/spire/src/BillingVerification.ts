/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type {
    AppleTransactionVerificationRequest,
    BillingEnvironment,
    BillingPlatform,
    BillingProduct,
    BillingSubscriptionStatus,
    GooglePurchaseVerificationRequest,
} from "@vex-chat/types";

import { createSign } from "node:crypto";

import {
    BillingEnvironmentSchema,
    BillingProductSchema,
} from "@vex-chat/types";

export interface AppleServerNotificationPayload {
    data?: {
        signedTransactionInfo?: string;
    };
    notificationType?: string;
}

export interface GooglePlayPubSubNotificationPayload {
    packageName?: string;
    subscriptionNotification?: {
        purchaseToken: string;
        subscriptionId?: string;
    };
}

export interface VerifiedStorePurchase {
    environment: BillingEnvironment;
    expiresAt: null | string;
    externalOriginalID: null | string;
    externalTransactionID: null | string;
    platform: BillingPlatform;
    purchaseToken?: string | undefined;
    rawPayload: unknown;
    status: BillingSubscriptionStatus;
    storeProductID: string;
}

interface AppleTransactionPayload {
    environment?: string;
    expiresDate?: number | string;
    originalTransactionId?: string;
    productId?: string;
    revocationDate?: number | string;
    transactionId?: string;
}

interface GoogleServiceAccount {
    client_email: string;
    private_key: string;
}

interface GoogleSubscriptionV2Response {
    acknowledgementState?: string;
    latestOrderId?: string;
    lineItems?: Array<{
        expiryTime?: string;
        productId?: string;
    }>;
    subscriptionState?: string;
    testPurchase?: Record<string, never>;
}

export class BillingVerificationError extends Error {
    public readonly status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = "BillingVerificationError";
        this.status = status;
    }
}

export function decodeAppleServerNotificationPayload(
    signedPayload: string,
): AppleServerNotificationPayload {
    return appleServerNotificationPayloadFromUnknown(
        decodePossiblySignedPayload(signedPayload),
    );
}

export function decodeGooglePlayPubSubNotificationPayload(
    body: unknown,
): GooglePlayPubSubNotificationPayload {
    const direct = googleNotificationPayloadFromUnknown(body);
    if (direct) {
        return direct;
    }
    const messageData = stringField(recordField(body, "message"), "data");
    if (!messageData) {
        throw new BillingVerificationError(
            "Google Play notification is missing message.data.",
        );
    }
    const decoded: unknown = JSON.parse(
        Buffer.from(base64UrlToBase64(messageData), "base64").toString("utf8"),
    );
    const notification = googleNotificationPayloadFromUnknown(decoded);
    if (!notification) {
        throw new BillingVerificationError(
            "Google Play notification is missing subscription purchase token.",
        );
    }
    return notification;
}

export function getBillingProductCatalog(
    env: NodeJS.ProcessEnv = process.env,
): BillingProduct[] {
    const rawCatalog = env["VEX_BILLING_PRODUCTS_JSON"]?.trim();
    if (rawCatalog) {
        const parsed: unknown = JSON.parse(rawCatalog);
        const products = BillingProductSchema.array().parse(parsed);
        return products;
    }

    const environment = defaultBillingEnvironment(env);
    const products: BillingProduct[] = [];
    const applePlus = env["VEX_APPLE_PLUS_PRODUCT_ID"]?.trim();
    const applePro = env["VEX_APPLE_PRO_PRODUCT_ID"]?.trim();
    const googlePlus = env["VEX_GOOGLE_PLUS_PRODUCT_ID"]?.trim();
    const googlePro = env["VEX_GOOGLE_PRO_PRODUCT_ID"]?.trim();

    if (applePlus) {
        products.push({
            environment,
            platform: "apple_app_store",
            productID: "apple_plus_monthly",
            storeProductID: applePlus,
            tier: "plus",
        });
    }
    if (applePro) {
        products.push({
            environment,
            platform: "apple_app_store",
            productID: "apple_pro_monthly",
            storeProductID: applePro,
            tier: "pro",
        });
    }
    if (googlePlus) {
        products.push({
            environment,
            platform: "google_play",
            productID: "google_plus_monthly",
            storeProductID: googlePlus,
            tier: "plus",
        });
    }
    if (googlePro) {
        products.push({
            environment,
            platform: "google_play",
            productID: "google_pro_monthly",
            storeProductID: googlePro,
            tier: "pro",
        });
    }

    return products;
}

export function resolveBillingProduct(
    purchase: Pick<
        VerifiedStorePurchase,
        "environment" | "platform" | "storeProductID"
    >,
    products = getBillingProductCatalog(),
): BillingProduct {
    const product = products.find(
        (entry) =>
            entry.platform === purchase.platform &&
            entry.environment === purchase.environment &&
            entry.storeProductID === purchase.storeProductID,
    );
    if (!product) {
        throw new BillingVerificationError(
            `No billing product configured for ${purchase.platform}/${purchase.environment}/${purchase.storeProductID}.`,
            422,
        );
    }
    return product;
}

export async function verifyAppleTransaction(
    request: AppleTransactionVerificationRequest,
    env: NodeJS.ProcessEnv = process.env,
): Promise<VerifiedStorePurchase> {
    const requestedEnvironment =
        request.environment ?? defaultBillingEnvironment(env);
    let signedTransactionInfo = request.signedTransactionInfo;
    const transactionID =
        request.transactionID ??
        (signedTransactionInfo
            ? decodeAppleTransactionPayload(signedTransactionInfo).transactionId
            : undefined);

    if (appleCredentialsConfigured(env) && transactionID) {
        signedTransactionInfo = await fetchAppleSignedTransactionInfo(
            transactionID,
            requestedEnvironment,
            env,
        );
    } else if (!allowLocalStorePayloads(env)) {
        throw new BillingVerificationError(
            "Apple transaction verification is not configured.",
            503,
        );
    }

    if (!signedTransactionInfo) {
        throw new BillingVerificationError(
            "Apple transaction verification did not return transaction info.",
        );
    }

    const payload = decodeAppleTransactionPayload(signedTransactionInfo);
    const environment = normalizeAppleEnvironment(
        payload.environment,
        requestedEnvironment,
    );
    const storeProductID = payload.productId;
    if (!storeProductID) {
        throw new BillingVerificationError(
            "Apple transaction payload is missing productId.",
        );
    }
    const expiresAt = normalizeExpiry(payload.expiresDate);
    const status = subscriptionStatusFromExpiry({
        expiresAt,
        revoked: payload.revocationDate !== undefined,
    });

    return {
        environment,
        expiresAt,
        externalOriginalID: payload.originalTransactionId ?? null,
        externalTransactionID: payload.transactionId ?? transactionID ?? null,
        platform: "apple_app_store",
        rawPayload: payload,
        status,
        storeProductID,
    };
}

export async function verifyGooglePurchase(
    request: GooglePurchaseVerificationRequest,
    env: NodeJS.ProcessEnv = process.env,
): Promise<VerifiedStorePurchase> {
    let response: GoogleSubscriptionV2Response;
    if (googleCredentialsConfigured(env)) {
        response = await fetchGoogleSubscriptionV2(request, env);
    } else if (allowLocalStorePayloads(env)) {
        response = decodeLocalGooglePurchaseToken(request.purchaseToken);
    } else {
        throw new BillingVerificationError(
            "Google Play purchase verification is not configured.",
            503,
        );
    }

    const lineItem = response.lineItems?.[0];
    const storeProductID = lineItem?.productId ?? request.productID;
    if (!storeProductID) {
        throw new BillingVerificationError(
            "Google Play subscription response is missing productId.",
        );
    }
    const expiresAt = normalizeExpiry(lineItem?.expiryTime ?? null);
    const environment =
        request.environment ??
        (response.testPurchase ? "sandbox" : defaultBillingEnvironment(env));

    return {
        environment,
        expiresAt,
        externalOriginalID: response.latestOrderId ?? null,
        externalTransactionID: response.latestOrderId ?? null,
        platform: "google_play",
        purchaseToken: request.purchaseToken,
        rawPayload: response,
        status: mapGoogleSubscriptionState(
            response.subscriptionState,
            expiresAt,
        ),
        storeProductID,
    };
}

function allowLocalStorePayloads(env: NodeJS.ProcessEnv): boolean {
    return (
        env["NODE_ENV"] !== "production" &&
        env["VEX_BILLING_ALLOW_LOCAL_STORE_PAYLOADS"] === "1"
    );
}

function appleCredentialsConfigured(env: NodeJS.ProcessEnv): boolean {
    return Boolean(
        env["APPLE_APP_STORE_ISSUER_ID"]?.trim() &&
        env["APPLE_APP_STORE_KEY_ID"]?.trim() &&
        env["APPLE_APP_STORE_PRIVATE_KEY"]?.trim() &&
        env["APPLE_APP_BUNDLE_ID"]?.trim(),
    );
}

function appleServerNotificationPayloadFromUnknown(
    value: unknown,
): AppleServerNotificationPayload {
    const data = recordField(value, "data");
    const signedTransactionInfo = stringField(data, "signedTransactionInfo");
    return {
        ...(signedTransactionInfo ? { data: { signedTransactionInfo } } : {}),
        ...stringObjectField(value, "notificationType"),
    };
}

function appleTransactionPayloadFromUnknown(
    value: unknown,
): AppleTransactionPayload {
    return {
        ...stringObjectField(value, "environment"),
        ...numberOrStringObjectField(value, "expiresDate"),
        ...stringObjectField(value, "originalTransactionId"),
        ...stringObjectField(value, "productId"),
        ...numberOrStringObjectField(value, "revocationDate"),
        ...stringObjectField(value, "transactionId"),
    };
}

function base64Url(input: Buffer | string): string {
    return Buffer.from(input)
        .toString("base64")
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
}

function base64UrlToBase64(input: string): string {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padding = normalized.length % 4;
    return padding === 0 ? normalized : normalized + "=".repeat(4 - padding);
}

function createAppleServerApiJwt(env: NodeJS.ProcessEnv): string {
    const issuerID = requiredEnv(env, "APPLE_APP_STORE_ISSUER_ID");
    const keyID = requiredEnv(env, "APPLE_APP_STORE_KEY_ID");
    const bundleID = requiredEnv(env, "APPLE_APP_BUNDLE_ID");
    const privateKey = normalizePrivateKey(
        requiredEnv(env, "APPLE_APP_STORE_PRIVATE_KEY"),
    );
    const iat = Math.floor(Date.now() / 1000);
    const header = {
        alg: "ES256",
        kid: keyID,
        typ: "JWT",
    };
    const payload = {
        aud: "appstoreconnect-v1",
        bid: bundleID,
        exp: iat + 900,
        iat,
        iss: issuerID,
    };
    const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
        JSON.stringify(payload),
    )}`;
    const signature = createSign("SHA256")
        .update(signingInput)
        .end()
        .sign(privateKey);
    return `${signingInput}.${base64Url(derEcdsaToJose(signature, 32))}`;
}

function decodeAppleTransactionPayload(
    signedTransactionInfo: string,
): AppleTransactionPayload {
    return appleTransactionPayloadFromUnknown(
        decodePossiblySignedPayload(signedTransactionInfo),
    );
}

function decodeLocalGooglePurchaseToken(
    purchaseToken: string,
): GoogleSubscriptionV2Response {
    return googleSubscriptionV2ResponseFromUnknown(
        decodePossiblySignedPayload(purchaseToken),
    );
}

function decodePossiblySignedPayload(value: string): unknown {
    const payload = value.includes(".") ? value.split(".")[1] : value;
    if (!payload) {
        throw new BillingVerificationError("Invalid encoded billing payload.");
    }
    try {
        return JSON.parse(
            Buffer.from(base64UrlToBase64(payload), "base64").toString("utf8"),
        );
    } catch {
        try {
            return JSON.parse(value);
        } catch {
            throw new BillingVerificationError(
                "Billing payload could not be decoded.",
            );
        }
    }
}

function defaultBillingEnvironment(env: NodeJS.ProcessEnv): BillingEnvironment {
    const parsed = BillingEnvironmentSchema.safeParse(
        env["VEX_BILLING_ENVIRONMENT"],
    );
    return parsed.success ? parsed.data : "production";
}

function derEcdsaToJose(signature: Buffer, partLength: number): Buffer {
    let offset = 0;
    if (signature[offset++] !== 0x30) {
        throw new BillingVerificationError("Invalid ECDSA DER signature.", 500);
    }
    const sequenceLength = readDerLength(signature, offset);
    offset = sequenceLength.offset;
    if (signature[offset++] !== 0x02) {
        throw new BillingVerificationError("Invalid ECDSA DER signature.", 500);
    }
    const rLength = readDerLength(signature, offset);
    offset = rLength.offset;
    const r = signature.subarray(offset, offset + rLength.length);
    offset += rLength.length;
    if (signature[offset++] !== 0x02) {
        throw new BillingVerificationError("Invalid ECDSA DER signature.", 500);
    }
    const sLength = readDerLength(signature, offset);
    offset = sLength.offset;
    const s = signature.subarray(offset, offset + sLength.length);
    return Buffer.concat([
        leftPadUnsignedInteger(r, partLength),
        leftPadUnsignedInteger(s, partLength),
    ]);
}

async function fetchAppleSignedTransactionInfo(
    transactionID: string,
    environment: BillingEnvironment,
    env: NodeJS.ProcessEnv,
): Promise<string> {
    const token = createAppleServerApiJwt(env);
    const host =
        environment === "sandbox"
            ? "https://api.storekit-sandbox.itunes.apple.com"
            : "https://api.storekit.itunes.apple.com";
    const res = await fetch(
        `${host}/inApps/v1/transactions/${encodeURIComponent(transactionID)}`,
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        },
    );
    if (!res.ok) {
        throw new BillingVerificationError(
            `Apple transaction verification failed with HTTP ${String(res.status)}.`,
            502,
        );
    }
    const body: unknown = await res.json();
    const signedTransactionInfo = stringField(body, "signedTransactionInfo");
    if (!signedTransactionInfo) {
        throw new BillingVerificationError(
            "Apple transaction response is missing signedTransactionInfo.",
            502,
        );
    }
    return signedTransactionInfo;
}

function fetchFormBody(params: Record<string, string>): string {
    return new URLSearchParams(params).toString();
}

async function fetchGoogleAccessToken(
    account: GoogleServiceAccount,
): Promise<string> {
    const iat = Math.floor(Date.now() / 1000);
    const signingInput = `${base64Url(
        JSON.stringify({ alg: "RS256", typ: "JWT" }),
    )}.${base64Url(
        JSON.stringify({
            aud: "https://oauth2.googleapis.com/token",
            exp: iat + 3600,
            iat,
            iss: account.client_email,
            scope: "https://www.googleapis.com/auth/androidpublisher",
        }),
    )}`;
    const signature = createSign("RSA-SHA256")
        .update(signingInput)
        .end()
        .sign(normalizePrivateKey(account.private_key));
    const assertion = `${signingInput}.${base64Url(signature)}`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
        body: fetchFormBody({
            assertion,
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        }),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
    });
    if (!res.ok) {
        throw new BillingVerificationError(
            `Google OAuth failed with HTTP ${String(res.status)}.`,
            502,
        );
    }
    const body: unknown = await res.json();
    const accessToken = stringField(body, "access_token");
    if (!accessToken) {
        throw new BillingVerificationError(
            "Google OAuth response is missing access_token.",
            502,
        );
    }
    return accessToken;
}

async function fetchGoogleSubscriptionV2(
    request: GooglePurchaseVerificationRequest,
    env: NodeJS.ProcessEnv,
): Promise<GoogleSubscriptionV2Response> {
    const packageName =
        request.packageName ?? requiredEnv(env, "GOOGLE_PLAY_PACKAGE_NAME");
    const account = googleServiceAccount(env);
    const accessToken = await fetchGoogleAccessToken(account);
    const url =
        "https://androidpublisher.googleapis.com/androidpublisher/v3/applications/" +
        encodeURIComponent(packageName) +
        "/purchases/subscriptionsv2/tokens/" +
        encodeURIComponent(request.purchaseToken);
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });
    if (!res.ok) {
        throw new BillingVerificationError(
            `Google Play verification failed with HTTP ${String(res.status)}.`,
            502,
        );
    }
    return googleSubscriptionV2ResponseFromUnknown(await res.json());
}

function googleCredentialsConfigured(env: NodeJS.ProcessEnv): boolean {
    if (env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]?.trim()) {
        return Boolean(env["GOOGLE_PLAY_PACKAGE_NAME"]?.trim());
    }
    return Boolean(
        env["GOOGLE_PLAY_CLIENT_EMAIL"]?.trim() &&
        env["GOOGLE_PLAY_PRIVATE_KEY"]?.trim() &&
        env["GOOGLE_PLAY_PACKAGE_NAME"]?.trim(),
    );
}

function googleNotificationPayloadFromUnknown(
    value: unknown,
): GooglePlayPubSubNotificationPayload | null {
    const subscriptionNotification = recordField(
        value,
        "subscriptionNotification",
    );
    const purchaseToken = stringField(
        subscriptionNotification,
        "purchaseToken",
    );
    if (!purchaseToken) {
        return null;
    }
    return {
        ...stringObjectField(value, "packageName"),
        subscriptionNotification: {
            purchaseToken,
            ...stringObjectField(subscriptionNotification, "subscriptionId"),
        },
    };
}

function googleServiceAccount(env: NodeJS.ProcessEnv): GoogleServiceAccount {
    const raw = env["GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"]?.trim();
    if (raw) {
        const parsed: unknown = JSON.parse(raw);
        const clientEmail = stringField(parsed, "client_email");
        const privateKey = stringField(parsed, "private_key");
        if (clientEmail && privateKey) {
            return {
                client_email: clientEmail,
                private_key: privateKey,
            };
        }
    }
    return {
        client_email: requiredEnv(env, "GOOGLE_PLAY_CLIENT_EMAIL"),
        private_key: requiredEnv(env, "GOOGLE_PLAY_PRIVATE_KEY"),
    };
}

function googleSubscriptionV2ResponseFromUnknown(
    value: unknown,
): GoogleSubscriptionV2Response {
    const lineItemsValue = isRecord(value) ? value["lineItems"] : undefined;
    const lineItems = Array.isArray(lineItemsValue)
        ? lineItemsValue.flatMap((item) => {
              if (!isRecord(item)) {
                  return [];
              }
              return [
                  {
                      ...stringObjectField(item, "expiryTime"),
                      ...stringObjectField(item, "productId"),
                  },
              ];
          })
        : undefined;
    return {
        ...stringObjectField(value, "acknowledgementState"),
        ...stringObjectField(value, "latestOrderId"),
        ...(lineItems && lineItems.length > 0 ? { lineItems } : {}),
        ...stringObjectField(value, "subscriptionState"),
        ...(recordField(value, "testPurchase") ? { testPurchase: {} } : {}),
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function leftPadUnsignedInteger(value: Buffer, length: number): Buffer {
    const trimmed = value[0] === 0 ? value.subarray(1) : value;
    if (trimmed.length > length) {
        return trimmed.subarray(trimmed.length - length);
    }
    if (trimmed.length === length) {
        return trimmed;
    }
    return Buffer.concat([Buffer.alloc(length - trimmed.length), trimmed]);
}

function mapGoogleSubscriptionState(
    state: string | undefined,
    expiresAt: null | string,
): BillingSubscriptionStatus {
    switch (state) {
        case "SUBSCRIPTION_STATE_ACTIVE":
            return "active";
        case "SUBSCRIPTION_STATE_CANCELED":
            return subscriptionStatusFromExpiry({ expiresAt, revoked: false });
        case "SUBSCRIPTION_STATE_EXPIRED":
            return "expired";
        case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
            return "grace_period";
        case "SUBSCRIPTION_STATE_ON_HOLD":
            return "billing_retry";
        case "SUBSCRIPTION_STATE_PAUSED":
        case "SUBSCRIPTION_STATE_PENDING":
        case "SUBSCRIPTION_STATE_UNSPECIFIED":
        default:
            return "pending";
    }
}

function normalizeAppleEnvironment(
    value: string | undefined,
    fallback: BillingEnvironment,
): BillingEnvironment {
    if (value === "Sandbox") {
        return "sandbox";
    }
    if (value === "Production") {
        return "production";
    }
    const parsed = BillingEnvironmentSchema.safeParse(value);
    return parsed.success ? parsed.data : fallback;
}

function normalizeExpiry(
    value: null | number | string | undefined,
): null | string {
    if (value === null || value === undefined || value === "") {
        return null;
    }
    if (typeof value === "number") {
        return new Date(value).toISOString();
    }
    if (/^\d+$/.test(value)) {
        return new Date(Number(value)).toISOString();
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function normalizePrivateKey(value: string): string {
    return value.replace(/\\n/g, "\n");
}

function numberOrStringObjectField(
    value: unknown,
    field: string,
): Record<string, number | string> {
    const recordValue = isRecord(value) ? value[field] : undefined;
    return typeof recordValue === "string" || typeof recordValue === "number"
        ? { [field]: recordValue }
        : {};
}

function readDerLength(
    input: Buffer,
    offset: number,
): { length: number; offset: number } {
    const first = input[offset++];
    if (first === undefined) {
        throw new BillingVerificationError("Invalid DER length.", 500);
    }
    if (first < 0x80) {
        return { length: first, offset };
    }
    const byteCount = first & 0x7f;
    let length = 0;
    for (let i = 0; i < byteCount; i++) {
        const byte = input[offset++];
        if (byte === undefined) {
            throw new BillingVerificationError("Invalid DER length.", 500);
        }
        length = (length << 8) | byte;
    }
    return { length, offset };
}

function recordField(
    value: unknown,
    field: string,
): Record<string, unknown> | undefined {
    const recordValue = isRecord(value) ? value[field] : undefined;
    return isRecord(recordValue) ? recordValue : undefined;
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
    const value = env[key]?.trim();
    if (!value) {
        throw new BillingVerificationError(
            `Missing required billing environment variable ${key}.`,
            503,
        );
    }
    return value;
}

function stringField(value: unknown, field: string): string | undefined {
    const recordValue = isRecord(value) ? value[field] : undefined;
    return typeof recordValue === "string" && recordValue.length > 0
        ? recordValue
        : undefined;
}

function stringObjectField(
    value: unknown,
    field: string,
): Record<string, string> {
    const recordValue = stringField(value, field);
    return recordValue ? { [field]: recordValue } : {};
}

function subscriptionStatusFromExpiry(args: {
    expiresAt: null | string;
    revoked: boolean;
}): BillingSubscriptionStatus {
    if (args.revoked) {
        return "revoked";
    }
    if (!args.expiresAt) {
        return "active";
    }
    const expiresAtMs = Date.parse(args.expiresAt);
    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now()
        ? "active"
        : "expired";
}
