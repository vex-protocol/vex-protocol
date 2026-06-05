/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientManager } from "./ClientManager.ts";
import type { Database, NotificationSubscription } from "./Database.ts";
import type { NotifyMsg } from "@vex-chat/types";

import { readFileSync } from "node:fs";
import * as http2 from "node:http2";

import jwt from "jsonwebtoken";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";
const FCM_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const EXPO_BATCH_SIZE = 100;
const EXPO_RECEIPT_DELAY_MS = 15 * 60 * 1000;
const EXPO_REQUEST_TIMEOUT_MS = 10_000;
const MAIL_PUSH_WEBSOCKET_GRACE_MS = 1500;
const ANDROID_PUSH_CHANNEL_ID = "vex-push-messages-v2";
const MESSAGE_PUSH_COLLAPSE_ID = "vex-message-summary";

export interface NotificationDispatch {
    data?: unknown;
    deviceID?: string;
    event: string;
    headlessPushUserID?: string;
    mailNonce?: Uint8Array;
    transmissionID: string;
    userID: string;
}

interface ApnsConfig {
    environment: "production" | "sandbox";
    keyID: string;
    privateKey: string;
    teamID: string;
    topic: string;
}

interface ApnsResponse {
    body: string;
    status: number;
}

type ExpoErrorDetails = {
    [key: string]: unknown;
    error?: string;
};

type ExpoPushReceipt =
    | {
          details?: ExpoErrorDetails;
          message?: string;
          status: "error";
      }
    | {
          status: "ok";
      };

type ExpoPushTicket =
    | {
          details?: ExpoErrorDetails;
          message?: string;
          status: "error";
      }
    | {
          id: string;
          status: "ok";
      };

interface FcmConfig {
    clientEmail: string;
    privateKey: string;
    projectID: string;
}

interface NotificationServiceOptions {
    receiptDelayMs?: number;
}

interface ParsedExpoPushResponse {
    errors: unknown[];
    tickets: ExpoPushTicket[];
}

interface ParsedExpoReceiptResponse {
    errors: unknown[];
    receipts: Record<string, ExpoPushReceipt>;
}

interface PendingReceipt {
    event: string;
    subscription: NotificationSubscription;
    transmissionID: string;
}

export class NotificationService {
    private readonly clients: ClientManager[];
    private readonly db: Database;
    private readonly pendingReceipts = new Map<string, PendingReceipt>();
    private readonly receiptDelayMs: number;
    private readonly removeClient: (client: ClientManager) => void;

    constructor(
        db: Database,
        clients: ClientManager[],
        removeClient: (client: ClientManager) => void,
        options: NotificationServiceOptions = {},
    ) {
        this.clients = clients;
        this.db = db;
        this.receiptDelayMs = options.receiptDelayMs ?? EXPO_RECEIPT_DELAY_MS;
        this.removeClient = removeClient;
    }

    public notify(dispatch: NotificationDispatch): void {
        const websocketDeliveries = this.notifyWebSocket(dispatch);
        if (shouldDeferMailPush(dispatch, websocketDeliveries)) {
            this.scheduleMailPush(dispatch);
            return;
        }
        this.startPush(dispatch);
    }

    private async checkExpoReceipts(receiptIDs: string[]): Promise<void> {
        const pendingIDs = receiptIDs.filter((id) =>
            this.pendingReceipts.has(id),
        );
        if (pendingIDs.length === 0) return;

        let payload: ParsedExpoReceiptResponse;
        try {
            const res = await fetchWithTimeout(
                EXPO_RECEIPT_ENDPOINT,
                {
                    body: JSON.stringify({ ids: pendingIDs }),
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                    method: "POST",
                },
                "Expo receipt request",
            );

            if (!res.ok) {
                throw new Error(
                    `Expo receipt request failed with status ${res.status.toString()}`,
                );
            }

            payload = parseExpoReceiptResponse(await res.json());
        } catch (err: unknown) {
            this.dropPendingReceipts(pendingIDs);
            throw err;
        }

        if (payload.errors.length > 0) {
            console.warn("[spire-notify] Expo receipt request errors", {
                errors: payload.errors,
                receiptIDs: pendingIDs,
            });
        }

        const receipts = payload.receipts;
        for (const receiptID of pendingIDs) {
            const receipt = receipts[receiptID];
            if (!receipt) {
                console.warn("[spire-notify] Expo receipt missing", {
                    receiptID,
                });
                this.pendingReceipts.delete(receiptID);
                continue;
            }

            const pending = this.pendingReceipts.get(receiptID);
            this.pendingReceipts.delete(receiptID);
            if (!pending || receipt.status === "ok") continue;

            await this.handleExpoDeliveryError(
                "receipt",
                pending.subscription,
                {
                    event: pending.event,
                    transmissionID: pending.transmissionID,
                },
                receipt,
            );
        }
    }

    private dropPendingReceipts(receiptIDs: string[]): void {
        for (const receiptID of receiptIDs) {
            this.pendingReceipts.delete(receiptID);
        }
    }

    private async handleExpoDeliveryError(
        stage: "receipt" | "ticket",
        subscription: NotificationSubscription,
        dispatch: Pick<NotificationDispatch, "event" | "transmissionID">,
        err: { details?: ExpoErrorDetails; message?: string },
    ): Promise<void> {
        const code = err.details?.error;
        console.warn("[spire-notify] Expo push delivery error", {
            code,
            event: dispatch.event,
            message: err.message,
            stage,
            subscriptionID: subscription.subscriptionID,
            transmissionID: dispatch.transmissionID,
        });

        if (code !== "DeviceNotRegistered") return;

        await this.db.removeNotificationSubscription({
            deviceID: subscription.deviceID,
            subscriptionID: subscription.subscriptionID,
            userID: subscription.userID,
        });
    }

    private async notifyPush(dispatch: NotificationDispatch): Promise<void> {
        const query = {
            event: dispatch.event,
            userID: dispatch.userID,
        };
        const subscriptions = await this.db.retrieveNotificationSubscriptions(
            dispatch.deviceID
                ? { ...query, deviceID: dispatch.deviceID }
                : query,
        );
        const expoSubscriptions = subscriptions.filter(
            (sub) => sub.channel === "expo",
        );
        const apnsSubscriptions = subscriptions.filter(
            (sub) => sub.channel === "apnsVoip",
        );
        const fcmSubscriptions = subscriptions.filter(
            (sub) => sub.channel === "fcmCall",
        );
        if (
            expoSubscriptions.length === 0 &&
            apnsSubscriptions.length === 0 &&
            fcmSubscriptions.length === 0
        ) {
            console.info("[spire-notify] no push subscriptions", {
                deviceScoped: Boolean(dispatch.deviceID),
                event: dispatch.event,
                transmissionID: dispatch.transmissionID,
                userID: dispatch.userID,
            });
            return;
        }

        for (let i = 0; i < expoSubscriptions.length; i += EXPO_BATCH_SIZE) {
            const batch = expoSubscriptions.slice(i, i + EXPO_BATCH_SIZE);
            await this.sendExpoBatch(batch, dispatch);
        }
        if (dispatch.event === "callWake") {
            if (apnsSubscriptions.length > 0) {
                await this.sendApnsVoipBatch(apnsSubscriptions, dispatch);
            }
            if (fcmSubscriptions.length > 0) {
                await this.sendFcmCallBatch(fcmSubscriptions, dispatch);
            }
        }
    }

    private async notifyPushIfMailPending(
        dispatch: NotificationDispatch & {
            deviceID: string;
            mailNonce: Uint8Array;
        },
    ): Promise<void> {
        const pending = await this.db.hasMail(
            dispatch.mailNonce,
            dispatch.deviceID,
        );
        if (!pending) {
            console.info("[spire-notify] skipping Expo push for acked mail", {
                deviceID: dispatch.deviceID,
                event: dispatch.event,
                transmissionID: dispatch.transmissionID,
                userID: dispatch.userID,
            });
            return;
        }
        await this.notifyPush(dispatch);
    }

    private notifyWebSocket(dispatch: NotificationDispatch): number {
        const msg: NotifyMsg = {
            data: dispatch.data,
            event: dispatch.event,
            transmissionID: dispatch.transmissionID,
            type: "notify",
        };

        let deliveries = 0;
        const snapshot = this.clients.slice();
        for (const client of snapshot) {
            try {
                if (client.hasFailed()) {
                    this.removeClient(client);
                    continue;
                }

                if (dispatch.deviceID) {
                    const currentDeviceID = client.getDeviceID();
                    if (currentDeviceID === null) {
                        this.removeClient(client);
                        continue;
                    }
                    if (currentDeviceID === dispatch.deviceID) {
                        client.send(msg);
                        deliveries++;
                    }
                    continue;
                }

                const currentUserID = client.getUserID();
                if (currentUserID === null) {
                    this.removeClient(client);
                    continue;
                }
                if (currentUserID === dispatch.userID) {
                    client.send(msg);
                    deliveries++;
                }
            } catch (_err: unknown) {
                this.removeClient(client);
            }
        }
        return deliveries;
    }

    private scheduleMailPush(
        dispatch: NotificationDispatch & {
            deviceID: string;
            mailNonce: Uint8Array;
        },
    ): void {
        const timer = setTimeout(() => {
            void this.notifyPushIfMailPending(dispatch).catch(
                (err: unknown) => {
                    console.warn("[spire-notify] Expo push fanout failed", {
                        event: dispatch.event,
                        message:
                            err instanceof Error ? err.message : String(err),
                        transmissionID: dispatch.transmissionID,
                        userID: dispatch.userID,
                    });
                },
            );
        }, MAIL_PUSH_WEBSOCKET_GRACE_MS);
        (timer as { unref?: () => void }).unref?.();
    }

    private scheduleReceiptCheck(receiptIDs: string[]): void {
        const timer = setTimeout(() => {
            void this.checkExpoReceipts(receiptIDs).catch((err: unknown) => {
                console.warn(
                    "[spire-notify] Expo receipt check failed",
                    err instanceof Error ? err.message : String(err),
                );
            });
        }, this.receiptDelayMs);
        (timer as { unref?: () => void }).unref?.();
    }

    private async sendApnsVoipBatch(
        subscriptions: NotificationSubscription[],
        dispatch: NotificationDispatch,
    ): Promise<void> {
        const config = readApnsConfig();
        if (!config) {
            console.warn("[spire-notify] APNs VoIP env is not configured", {
                event: dispatch.event,
                size: subscriptions.length,
                transmissionID: dispatch.transmissionID,
            });
            return;
        }

        const providerToken = jwt.sign({}, config.privateKey, {
            algorithm: "ES256",
            expiresIn: "50m",
            header: { alg: "ES256", kid: config.keyID },
            issuer: config.teamID,
        });

        for (const subscription of subscriptions) {
            const response = await sendApnsVoipNotification(
                config,
                providerToken,
                subscription,
                dispatch,
            );
            if (response.status >= 200 && response.status < 300) {
                continue;
            }

            console.warn("[spire-notify] APNs VoIP delivery failed", {
                body: response.body.slice(0, 500),
                status: response.status,
                subscriptionID: subscription.subscriptionID,
                transmissionID: dispatch.transmissionID,
            });
            if (
                response.status === 400 ||
                response.status === 410 ||
                response.body.includes("BadDeviceToken") ||
                response.body.includes("Unregistered")
            ) {
                await this.db.removeNotificationSubscription({
                    deviceID: subscription.deviceID,
                    subscriptionID: subscription.subscriptionID,
                    userID: subscription.userID,
                });
            }
        }
    }

    private async sendExpoBatch(
        subscriptions: NotificationSubscription[],
        dispatch: NotificationDispatch,
    ): Promise<void> {
        const headless = shouldSendHeadlessPush(dispatch);
        const messages = subscriptions.map((sub) =>
            expoMessageForSubscription(sub, dispatch, headless),
        );
        console.info("[spire-notify] sending Expo push batch", {
            channelIDs: [
                ...new Set(
                    messages
                        .map((msg) => msg["channelId"])
                        .filter((value): value is string => {
                            return typeof value === "string";
                        }),
                ),
            ],
            event: dispatch.event,
            headless,
            platforms: [...new Set(subscriptions.map((sub) => sub.platform))],
            size: subscriptions.length,
            transmissionID: dispatch.transmissionID,
        });

        const res = await fetchWithTimeout(
            EXPO_PUSH_ENDPOINT,
            {
                body: JSON.stringify(messages),
                headers: {
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                method: "POST",
            },
            "Expo push request",
        );

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(
                `Expo push request failed with status ${res.status.toString()}${body ? `: ${body.slice(0, 500)}` : ""}`,
            );
        }

        const payload = parseExpoPushResponse(await res.json());
        if (payload.errors.length > 0) {
            console.warn("[spire-notify] Expo push request errors", {
                errors: payload.errors,
                event: dispatch.event,
                transmissionID: dispatch.transmissionID,
            });
        }

        const tickets = payload.tickets;
        console.info("[spire-notify] Expo push tickets received", {
            errors: tickets.filter((ticket) => ticket.status === "error")
                .length,
            event: dispatch.event,
            ok: tickets.filter((ticket) => ticket.status === "ok").length,
            transmissionID: dispatch.transmissionID,
        });
        for (const [idx, ticket] of tickets.entries()) {
            const subscription = subscriptions[idx];
            if (!subscription) continue;

            if (ticket.status === "error") {
                await this.handleExpoDeliveryError(
                    "ticket",
                    subscription,
                    dispatch,
                    ticket,
                );
                continue;
            }

            this.pendingReceipts.set(ticket.id, {
                event: dispatch.event,
                subscription,
                transmissionID: dispatch.transmissionID,
            });
        }

        const receiptIDs = tickets.flatMap((ticket) =>
            ticket.status === "ok" ? [ticket.id] : [],
        );
        if (receiptIDs.length > 0) {
            this.scheduleReceiptCheck(receiptIDs);
        }
    }

    private async sendFcmCallBatch(
        subscriptions: NotificationSubscription[],
        dispatch: NotificationDispatch,
    ): Promise<void> {
        const config = readFcmConfig();
        if (!config) {
            console.warn("[spire-notify] FCM call env is not configured", {
                event: dispatch.event,
                size: subscriptions.length,
                transmissionID: dispatch.transmissionID,
            });
            return;
        }

        const accessToken = await fetchFcmAccessToken(config);
        for (const subscription of subscriptions) {
            const res = await fetchWithTimeout(
                `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
                    config.projectID,
                )}/messages:send`,
                {
                    body: JSON.stringify(
                        fcmCallMessageForSubscription(subscription, dispatch),
                    ),
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "Content-Type": "application/json",
                    },
                    method: "POST",
                },
                "FCM call push request",
            );
            if (res.ok) {
                continue;
            }

            const body = await res.text().catch(() => "");
            console.warn("[spire-notify] FCM call delivery failed", {
                body: body.slice(0, 500),
                status: res.status,
                subscriptionID: subscription.subscriptionID,
                transmissionID: dispatch.transmissionID,
            });
            if (
                res.status === 400 ||
                res.status === 404 ||
                body.includes("UNREGISTERED") ||
                body.includes("registration-token-not-registered")
            ) {
                await this.db.removeNotificationSubscription({
                    deviceID: subscription.deviceID,
                    subscriptionID: subscription.subscriptionID,
                    userID: subscription.userID,
                });
            }
        }
    }

    private startPush(dispatch: NotificationDispatch): void {
        void this.notifyPush(dispatch).catch((err: unknown) => {
            // Push is best-effort; websocket/inbox delivery remain authoritative.
            console.warn("[spire-notify] push fanout failed", {
                event: dispatch.event,
                message: err instanceof Error ? err.message : String(err),
                transmissionID: dispatch.transmissionID,
                userID: dispatch.userID,
            });
        });
    }
}

function apnsExpiration(dispatch: NotificationDispatch): string {
    const expiresAt = notifyDataFields(dispatch.data)["expiresAt"];
    if (typeof expiresAt === "string") {
        const epochSeconds = Math.floor(Date.parse(expiresAt) / 1000);
        if (Number.isFinite(epochSeconds) && epochSeconds > 0) {
            return String(epochSeconds);
        }
    }
    return String(Math.floor((Date.now() + 60_000) / 1000));
}

function bodyForEvent(event: string): string | undefined {
    if (event === "callWake") return "Incoming voice call.";
    if (event === "callInvite") return "Incoming voice call.";
    if (event === "mail") return undefined;
    if (event === "deviceRequest") return "Review the device request.";
    if (event === "deviceListChanged") return "Your device list changed.";
    return "Open Vex for the latest update.";
}

function callWakeTtl(dispatch: NotificationDispatch): string {
    const expiresAt = notifyDataFields(dispatch.data)["expiresAt"];
    if (typeof expiresAt !== "string") {
        return "60s";
    }
    const ms = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) {
        return "1s";
    }
    return `${Math.max(1, Math.ceil(ms / 1000)).toString()}s`;
}

function expoMessageForSubscription(
    subscription: NotificationSubscription,
    dispatch: NotificationDispatch,
    headless: boolean,
): Record<string, unknown> {
    if (headless) {
        return {
            _contentAvailable: true,
            data: {
                deviceID: dispatch.deviceID ?? null,
                event: dispatch.event,
                headless: true,
                transmissionID: dispatch.transmissionID,
            },
            priority: subscription.platform === "android" ? "high" : undefined,
            to: subscription.token,
        };
    }

    const title = titleForEvent(dispatch.event);
    const body = bodyForEvent(dispatch.event);
    const data = {
        ...notifyDataFields(dispatch.data),
        deviceID: dispatch.deviceID ?? null,
        event: dispatch.event,
        title,
        transmissionID: dispatch.transmissionID,
    };

    const message: Record<string, unknown> = {
        channelId:
            subscription.platform === "android"
                ? ANDROID_PUSH_CHANNEL_ID
                : undefined,
        data,
        priority: subscription.platform === "android" ? "high" : undefined,
        title,
        to: subscription.token,
    };
    if (subscription.platform === "ios") {
        message["sound"] = "default";
    }
    if (body) {
        message["body"] = body;
    }
    if (dispatch.event === "mail") {
        message["collapseId"] = MESSAGE_PUSH_COLLAPSE_ID;
        if (subscription.platform === "android") {
            message["tag"] = MESSAGE_PUSH_COLLAPSE_ID;
        }
    }
    return message;
}

function fcmCallMessageForSubscription(
    subscription: NotificationSubscription,
    dispatch: NotificationDispatch,
): Record<string, unknown> {
    return {
        message: {
            android: {
                priority: "HIGH",
                ttl: callWakeTtl(dispatch),
            },
            data: stringRecord({
                ...notifyDataFields(dispatch.data),
                deviceID: dispatch.deviceID ?? "",
                event: dispatch.event,
                transmissionID: dispatch.transmissionID,
            }),
            token: subscription.token,
        },
    };
}

async function fetchFcmAccessToken(config: FcmConfig): Promise<string> {
    const assertion = jwt.sign(
        {
            scope: "https://www.googleapis.com/auth/firebase.messaging",
        },
        config.privateKey,
        {
            algorithm: "RS256",
            audience: FCM_TOKEN_ENDPOINT,
            expiresIn: "55m",
            issuer: config.clientEmail,
            subject: config.clientEmail,
        },
    );
    const body = new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    });
    const res = await fetchWithTimeout(
        FCM_TOKEN_ENDPOINT,
        {
            body,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            method: "POST",
        },
        "FCM OAuth token request",
    );
    if (!res.ok) {
        const responseBody = await res.text().catch(() => "");
        throw new Error(
            `FCM OAuth token request failed with status ${res.status.toString()}${
                responseBody ? `: ${responseBody.slice(0, 500)}` : ""
            }`,
        );
    }
    const raw = await res.json();
    if (!isRecord(raw) || typeof raw["access_token"] !== "string") {
        throw new Error(
            "FCM OAuth token response did not include access_token",
        );
    }
    return raw["access_token"];
}

async function fetchWithTimeout(
    input: string,
    init: RequestInit,
    label: string,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort();
    }, EXPO_REQUEST_TIMEOUT_MS);
    (timer as { unref?: () => void }).unref?.();
    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } catch (err: unknown) {
        if (
            err instanceof Error &&
            (err.name === "AbortError" || err.name === "TimeoutError")
        ) {
            throw new Error(
                `${label} timed out after ${EXPO_REQUEST_TIMEOUT_MS.toString()}ms`,
                { cause: err },
            );
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

function isExpoPushReceipt(value: unknown): value is ExpoPushReceipt {
    if (!isRecord(value)) return false;
    return value["status"] === "ok" || value["status"] === "error";
}

function isExpoPushTicket(value: unknown): value is ExpoPushTicket {
    if (!isRecord(value)) return false;
    if (value["status"] === "ok") {
        return typeof value["id"] === "string";
    }
    return value["status"] === "error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function normalizeExpoTickets(data: unknown): ExpoPushTicket[] {
    if (!data) return [];
    const tickets = Array.isArray(data) ? data : [data];
    return tickets.filter(isExpoPushTicket);
}

function normalizePrivateKey(value: string): string {
    return value.replaceAll("\\n", "\n");
}

function notifyDataFields(data: unknown): Record<string, unknown> {
    if (!isRecord(data)) {
        return {};
    }
    const out: Record<string, unknown> = {};
    for (const key of ["callID", "expiresAt", "mailID", "mailNonce"]) {
        const value = data[key];
        if (typeof value === "string") {
            out[key] = value;
        }
    }
    return out;
}

function parseExpoPushResponse(raw: unknown): ParsedExpoPushResponse {
    if (!isRecord(raw)) {
        return { errors: [], tickets: [] };
    }
    return {
        errors: Array.isArray(raw["errors"]) ? raw["errors"] : [],
        tickets: normalizeExpoTickets(raw["data"]),
    };
}

function parseExpoReceiptResponse(raw: unknown): ParsedExpoReceiptResponse {
    if (!isRecord(raw)) {
        return { errors: [], receipts: {} };
    }
    return {
        errors: Array.isArray(raw["errors"]) ? raw["errors"] : [],
        receipts: parseExpoReceipts(raw["data"]),
    };
}

function parseExpoReceipts(data: unknown): Record<string, ExpoPushReceipt> {
    if (!isRecord(data)) return {};
    const receipts: Record<string, ExpoPushReceipt> = {};
    for (const [receiptID, receipt] of Object.entries(data)) {
        if (isExpoPushReceipt(receipt)) {
            receipts[receiptID] = receipt;
        }
    }
    return receipts;
}

function readApnsConfig(): ApnsConfig | null {
    const teamID = readEnv("SPIRE_APNS_TEAM_ID");
    const keyID = readEnv("SPIRE_APNS_KEY_ID");
    const bundleID = readEnv("SPIRE_APNS_BUNDLE_ID");
    const topic = readEnv("SPIRE_APNS_TOPIC") ?? `${bundleID ?? ""}.voip`;
    const privateKey = readPrivateKeyEnv(
        "SPIRE_APNS_PRIVATE_KEY",
        "SPIRE_APNS_PRIVATE_KEY_FILE",
    );
    if (!teamID || !keyID || !bundleID || !topic || !privateKey) {
        return null;
    }
    const environment =
        readEnv("SPIRE_APNS_ENV") === "sandbox" ? "sandbox" : "production";
    return {
        environment,
        keyID,
        privateKey,
        teamID,
        topic,
    };
}

function readEnv(name: string): null | string {
    const value = process.env[name]?.trim();
    return value && value.length > 0 ? value : null;
}

function readFcmConfig(): FcmConfig | null {
    const json = readEnv("SPIRE_FCM_SERVICE_ACCOUNT_JSON");
    if (json) {
        try {
            const raw = JSON.parse(json) as unknown;
            if (
                isRecord(raw) &&
                typeof raw["client_email"] === "string" &&
                typeof raw["private_key"] === "string" &&
                typeof raw["project_id"] === "string"
            ) {
                return {
                    clientEmail: raw["client_email"],
                    privateKey: normalizePrivateKey(raw["private_key"]),
                    projectID: raw["project_id"],
                };
            }
        } catch {
            return null;
        }
    }

    const clientEmail = readEnv("SPIRE_FCM_CLIENT_EMAIL");
    const projectID = readEnv("SPIRE_FCM_PROJECT_ID");
    const privateKey = readPrivateKeyEnv(
        "SPIRE_FCM_PRIVATE_KEY",
        "SPIRE_FCM_PRIVATE_KEY_FILE",
    );
    if (!clientEmail || !projectID || !privateKey) {
        return null;
    }
    return { clientEmail, privateKey, projectID };
}

function readPrivateKeyEnv(valueName: string, fileName: string): null | string {
    const inline = readEnv(valueName);
    if (inline) {
        return normalizePrivateKey(inline);
    }
    const file = readEnv(fileName);
    if (!file) {
        return null;
    }
    try {
        return normalizePrivateKey(readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

function sendApnsVoipNotification(
    config: ApnsConfig,
    providerToken: string,
    subscription: NotificationSubscription,
    dispatch: NotificationDispatch,
): Promise<ApnsResponse> {
    const host =
        config.environment === "sandbox"
            ? "api.sandbox.push.apple.com"
            : "api.push.apple.com";
    const payload = JSON.stringify({
        aps: {
            "content-available": 1,
        },
        ...notifyDataFields(dispatch.data),
        event: dispatch.event,
        transmissionID: dispatch.transmissionID,
    });

    return new Promise<ApnsResponse>((resolve, reject) => {
        const client = http2.connect(`https://${host}`);
        const timer = setTimeout(() => {
            client.close();
            reject(
                new Error(
                    `APNs VoIP request timed out after ${EXPO_REQUEST_TIMEOUT_MS.toString()}ms`,
                ),
            );
        }, EXPO_REQUEST_TIMEOUT_MS);
        (timer as { unref?: () => void }).unref?.();

        client.once("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });

        const req = client.request({
            ":method": "POST",
            ":path": `/3/device/${subscription.token}`,
            "apns-expiration": apnsExpiration(dispatch),
            "apns-priority": "10",
            "apns-push-type": "voip",
            "apns-topic": config.topic,
            authorization: `bearer ${providerToken}`,
        });
        let status = 0;
        let body = "";
        req.setEncoding("utf8");
        req.on("response", (headers) => {
            const rawStatus = headers[":status"];
            status = typeof rawStatus === "number" ? rawStatus : 0;
        });
        req.on("data", (chunk: string) => {
            body += chunk;
        });
        req.on("error", (err) => {
            clearTimeout(timer);
            client.close();
            reject(err);
        });
        req.on("end", () => {
            clearTimeout(timer);
            client.close();
            resolve({ body, status });
        });
        req.end(payload);
    });
}

function shouldDeferMailPush(
    dispatch: NotificationDispatch,
    websocketDeliveries: number,
): dispatch is NotificationDispatch & {
    deviceID: string;
    mailNonce: Uint8Array;
} {
    return (
        dispatch.event === "mail" &&
        websocketDeliveries > 0 &&
        typeof dispatch.deviceID === "string" &&
        dispatch.mailNonce instanceof Uint8Array
    );
}

function shouldSendHeadlessPush(dispatch: NotificationDispatch): boolean {
    return (
        dispatch.headlessPushUserID !== undefined &&
        dispatch.userID === dispatch.headlessPushUserID
    );
}

function stringRecord(input: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
        if (typeof value === "string") {
            out[key] = value;
        }
    }
    return out;
}

function titleForEvent(event: string): string {
    if (event === "callWake") return "Incoming Vex call";
    if (event === "callInvite") return "Incoming Vex call";
    if (event === "mail") return "New Message";
    if (event === "deviceRequest") return "Device approval request";
    if (event === "deviceListChanged") return "Vex device update";
    return "Vex notification";
}
