/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

export {
    type AppleServerNotificationRequest,
    AppleServerNotificationRequestSchema,
    type AppleTransactionVerificationRequest,
    AppleTransactionVerificationRequestSchema,
    type BillingAccountState,
    BillingAccountStateSchema,
    type BillingEnvironment,
    BillingEnvironmentSchema,
    BillingEnvironmentValues,
    type BillingPlatform,
    BillingPlatformSchema,
    BillingPlatformValues,
    type BillingProduct,
    BillingProductSchema,
    type BillingSubscription,
    BillingSubscriptionSchema,
    type BillingSubscriptionStatus,
    BillingSubscriptionStatusSchema,
    BillingSubscriptionStatusValues,
    type GooglePlayDeveloperNotificationRequest,
    GooglePlayDeveloperNotificationRequestSchema,
    type GooglePurchaseVerificationRequest,
    GooglePurchaseVerificationRequestSchema,
} from "./billing.js";

export {
    type CallAction,
    CallActionSchema,
    type CallConversationType,
    type CallEvent,
    CallEventSchema,
    type CallParticipant,
    CallParticipantSchema,
    type CallResourceData,
    CallResourceDataSchema,
    type CallSession,
    CallSessionSchema,
    type CallSignalKind,
    type CallSignalPayload,
    CallSignalPayloadSchema,
    type IceServerConfig,
    IceServerConfigSchema,
} from "./calls.js";

export {
    type ActionToken,
    ActionTokenSchema,
    datetime,
    TokenScopes,
    uint8,
} from "./common.js";

export {
    accountEntitlementCapabilitiesForTier,
    type AccountEntitlementCapability,
    AccountEntitlementCapabilitySchema,
    AccountEntitlementCapabilityValues,
    type AccountEntitlementLimit,
    AccountEntitlementLimitSchema,
    accountEntitlementLimitsForTier,
    AccountEntitlementLimitValues,
    type AccountEntitlements,
    type AccountEntitlementSource,
    AccountEntitlementSourceSchema,
    AccountEntitlementsSchema,
    type AccountTier,
    AccountTierSchema,
    AccountTierValues,
    buildAccountEntitlements,
} from "./entitlements.js";

export {
    type Emoji,
    EmojiSchema,
    type FilePayload,
    FilePayloadSchema,
    type FileResponse,
    FileResponseSchema,
    type FileSQL,
    FileSQLSchema,
} from "./files.js";

export {
    type IdentityKeys,
    IdentityKeysSchema,
    type SessionSQL,
    SessionSQLSchema,
} from "./identity.js";

export {
    type KeyBundle,
    type KeyBundleEntry,
    KeyBundleSchema,
    type MailSQL,
    MailSQLSchema,
    type MailWS,
    MailWSSchema,
    type PreKeysSQL,
    PreKeysSQLSchema,
    type PreKeysWS,
    PreKeysWSSchema,
    type RatchetHeader,
    RatchetHeaderSchema,
} from "./keys.js";

export {
    type AuthorizedMsg,
    AuthorizedMsgSchema,
    type BaseMsg,
    BaseMsgSchema,
    type ChallMsg,
    ChallMsgSchema,
    type ClientMessage,
    type ErrMsg,
    ErrMsgSchema,
    MailType,
    type NotifyMsg,
    NotifyMsgSchema,
    type PingMsg,
    PingMsgSchema,
    type PongMsg,
    PongMsgSchema,
    type ReceiptMsg,
    ReceiptMsgSchema,
    type ResourceMsg,
    ResourceMsgSchema,
    type RespMsg,
    RespMsgSchema,
    SocketAuthErrors,
    type SuccessMsg,
    SuccessMsgSchema,
    type UnauthorizedMsg,
    UnauthorizedMsgSchema,
    type WSMessage,
    WSMessageSchema,
} from "./messages.js";

export {
    type Passkey,
    type PasskeyAuthenticationOptions,
    PasskeyAuthFinishPayloadSchema,
    PasskeyAuthStartPayloadSchema,
    PasskeyRegistrationFinishPayloadSchema,
    type PasskeyRegistrationOptions,
    PasskeyRegistrationStartPayloadSchema,
    PasskeySchema,
    type PublicKeyCredentialCreationOptionsJSON,
    type PublicKeyCredentialDescriptorJSON,
    type PublicKeyCredentialRequestOptionsJSON,
} from "./passkeys.js";

export {
    type Channel,
    ChannelSchema,
    type Invite,
    InviteSchema,
    type Permission,
    PermissionSchema,
    type Server,
    type ServerChannelBootstrap,
    ServerChannelBootstrapSchema,
    ServerSchema,
} from "./servers.js";

export {
    ACCOUNT_PASSWORD_MAX_LENGTH,
    ACCOUNT_PASSWORD_MIN_LENGTH,
    type Device,
    type DevicePayload,
    DevicePayloadSchema,
    DeviceSchema,
    type PasswordUpdatePayload,
    PasswordUpdatePayloadSchema,
    type RegistrationPayload,
    RegistrationPayloadSchema,
    type User,
    type UserRecord,
    UserRecordSchema,
    UserSchema,
} from "./users.js";
