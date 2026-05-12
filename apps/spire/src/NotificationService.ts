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

export interface NotificationDispatch {
    data?: unknown;
    deviceID?: string;
    event: string;
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
        this.notifyWebSocket(dispatch);
        void this.notifyPush(dispatch).catch(() => {
            // Push is best-effort; websocket/inbox delivery remain authoritative.
        });
    }

    private async checkExpoReceipts(receiptIDs: string[]): Promise<void> {
        const pendingIDs = receiptIDs.filter((id) =>
            this.pendingReceipts.has(id),
        );
        if (pendingIDs.length === 0) return;

        const res = await fetch(EXPO_RECEIPT_ENDPOINT, {
            body: JSON.stringify({ ids: pendingIDs }),
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            method: "POST",
        });

        if (!res.ok) {
            throw new Error(
                `Expo receipt request failed with status ${res.status.toString()}`,
            );
        }

        const payload = parseExpoReceiptResponse(await res.json());
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
        if (expoSubscriptions.length === 0) return;

        for (let i = 0; i < expoSubscriptions.length; i += EXPO_BATCH_SIZE) {
            const batch = expoSubscriptions.slice(i, i + EXPO_BATCH_SIZE);
            await this.sendExpoBatch(batch, dispatch);
        }
    }

    private notifyWebSocket(dispatch: NotificationDispatch): void {
        const msg: NotifyMsg = {
            data: dispatch.data,
            event: dispatch.event,
            transmissionID: dispatch.transmissionID,
            type: "notify",
        };

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
                }
            } catch (_err: unknown) {
                this.removeClient(client);
            }
        }
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
        const messages = subscriptions.map((sub) => ({
            body: bodyForEvent(dispatch.event),
            data: {
                deviceID: dispatch.deviceID ?? null,
                event: dispatch.event,
                transmissionID: dispatch.transmissionID,
            },
            sound: "default",
            title: titleForEvent(dispatch.event),
            to: sub.token,
        }));

        const res = await fetch(EXPO_PUSH_ENDPOINT, {
            body: JSON.stringify(messages),
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
            },
            method: "POST",
        });

        if (!res.ok) {
            throw new Error(
                `Expo push request failed with status ${res.status.toString()}`,
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
        tickets.forEach((ticket, idx) => {
            const subscription = subscriptions[idx];
            if (!subscription) return;

            if (ticket.status === "error") {
                void this.handleExpoDeliveryError(
                    "ticket",
                    subscription,
                    dispatch,
                    ticket,
                );
                return;
            }

            this.pendingReceipts.set(ticket.id, {
                event: dispatch.event,
                subscription,
                transmissionID: dispatch.transmissionID,
            });
        });

        const receiptIDs = tickets.flatMap((ticket) =>
            ticket.status === "ok" ? [ticket.id] : [],
        );
        if (receiptIDs.length > 0) {
            this.scheduleReceiptCheck(receiptIDs);
        }
    }
}

function bodyForEvent(event: string): string {
    if (event === "mail") return "Open Vex to read it.";
    if (event === "deviceRequest") return "Review the device request.";
    if (event === "deviceListChanged") return "Your device list changed.";
    return "Open Vex for the latest update.";
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

function titleForEvent(event: string): string {
    if (event === "mail") return "New Vex message";
    if (event === "deviceRequest") return "Device approval request";
    if (event === "deviceListChanged") return "Vex device update";
    return "Vex notification";
}
