/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

import type { ClientManager } from "./ClientManager.ts";
import type { Database, NotificationSubscription } from "./Database.ts";
import type { NotifyMsg } from "@vex-chat/types";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;

export interface NotificationDispatch {
    data?: unknown;
    deviceID?: string;
    event: string;
    transmissionID: string;
    userID: string;
}

export class NotificationService {
    private readonly clients: ClientManager[];
    private readonly db: Database;
    private readonly removeClient: (client: ClientManager) => void;

    constructor(
        db: Database,
        clients: ClientManager[],
        removeClient: (client: ClientManager) => void,
    ) {
        this.clients = clients;
        this.db = db;
        this.removeClient = removeClient;
    }

    public notify(dispatch: NotificationDispatch): void {
        this.notifyWebSocket(dispatch);
        void this.notifyPush(dispatch).catch(() => {
            // Push is best-effort; websocket/inbox delivery remain authoritative.
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
    }
}

function bodyForEvent(event: string): string {
    if (event === "mail") return "Open Vex to read it.";
    if (event === "deviceRequest") return "Review the device request.";
    if (event === "deviceListChanged") return "Your device list changed.";
    return "Open Vex for the latest update.";
}

function titleForEvent(event: string): string {
    if (event === "mail") return "New Vex message";
    if (event === "deviceRequest") return "Device approval request";
    if (event === "deviceListChanged") return "Vex device update";
    return "Vex notification";
}
