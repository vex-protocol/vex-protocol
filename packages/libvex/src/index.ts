/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

export { Client, DeviceApprovalRequiredError } from "./Client.js";
export type {
    Channel,
    Channels,
    ClientEvents,
    ClientOptions,
    Device,
    DeviceRegistrationResult,
    Devices,
    Emojis,
    FileProgress,
    FileRes,
    Files,
    Invites,
    Keys,
    Me,
    Message,
    Messages,
    MessageSendOptions,
    Moderation,
    NotificationSubscription,
    NotificationSubscriptionInput,
    Passkeys,
    PendingDeviceApprovalStatus,
    PendingDeviceRegistration,
    PendingDeviceRequest,
    Permission,
    Permissions,
    Server,
    ServerChannelBootstrap,
    Servers,
    Session,
    Sessions,
    User,
    Users,
    VexFile,
} from "./Client.js";
export { createCodec, msgpack } from "./codec.js";
export { HttpError, isHttpError } from "./http.js";
export type {
    HttpErrorOptions,
    HttpRequestRecord,
    HttpResponse,
} from "./http.js";
export {
    clampLocalMessageRetentionDays,
    effectiveMessageRetentionHintDays,
    MAX_LOCAL_MESSAGE_RETENTION_DAYS,
} from "./retention.js";
export type { Storage } from "./Storage.js";
export type {
    KeyPair,
    KeyStore,
    PreKeysCrypto,
    SessionCrypto,
    StoredCredentials,
    UnsavedPreKey,
} from "./types/index.js";
// Re-export app-facing types
export type { Invite, Passkey } from "@vex-chat/types";
