/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientManager } from "./ClientManager.ts";
import type { Database, NotificationSubscription } from "./Database.ts";
import type { NotifyMsg } from "@vex-chat/types";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPT_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";
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
        const expoSubscriptions = subscriptions;
        if (expoSubscriptions.length === 0) {
            console.info("[spire-notify] no Expo push subscriptions", {
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

    private startPush(dispatch: NotificationDispatch): void {
        void this.notifyPush(dispatch).catch((err: unknown) => {
            // Push is best-effort; websocket/inbox delivery remain authoritative.
            console.warn("[spire-notify] Expo push fanout failed", {
                event: dispatch.event,
                message: err instanceof Error ? err.message : String(err),
                transmissionID: dispatch.transmissionID,
                userID: dispatch.userID,
            });
        });
    }
}

function bodyForEvent(event: string): string | undefined {
    if (event === "mail") return undefined;
    if (event === "deviceRequest") return "Review the device request.";
    if (event === "deviceListChanged") return "Your device list changed.";
    return "Open Vex for the latest update.";
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

function titleForEvent(event: string): string {
    if (event === "mail") return "New Message";
    if (event === "deviceRequest") return "Device approval request";
    if (event === "deviceListChanged") return "Vex device update";
    return "Vex notification";
}
