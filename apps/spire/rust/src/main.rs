use std::{
    collections::HashMap,
    env, fs,
    net::SocketAddr,
    path::{Path as FsPath, PathBuf},
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::Bytes,
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        DefaultBodyLimit, Multipart, Path, Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use base64::{engine::general_purpose, Engine};
use chrono::{DateTime, SecondsFormat, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use futures_util::{SinkExt, StreamExt};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use p256::{
    ecdsa::{Signature as P256Signature, VerifyingKey as P256VerifyingKey},
    pkcs8::DecodePublicKey,
};
use rand::RngCore;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_bytes::ByteBuf;
use tokio::sync::{mpsc, Mutex};
use tower_http::cors::{Any, CorsLayer};
use url::Url;
use uuid::Uuid;
use webauthn_rs::prelude::{
    Passkey as WebauthnPasskey, PasskeyAuthentication, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential, Webauthn, WebauthnBuilder,
};

const DEFAULT_SPIRE_API_PORT: u16 = 16_777;
const TOKEN_EXPIRY: Duration = Duration::from_secs(10 * 60);
const JWT_EXPIRY_SECS: usize = 7 * 24 * 60 * 60;
const PASSKEY_JWT_EXPIRY_SECS: usize = 5 * 60;
const DEVICE_CHALLENGE_EXPIRY: Duration = Duration::from_secs(60);
const DEVICE_REQUEST_TTL_SECS: i64 = 10 * 60;
const PASSKEY_REGISTRATION_TTL_SECS: i64 = 5 * 60;
const RESOLVED_REQUEST_TTL_SECS: i64 = 30 * 60;
const MAX_PASSKEYS_PER_USER: usize = 10;
const MAX_HTTP_BODY_BYTES: usize = 20 * 1024 * 1024;
const AUTH_RATE_LIMIT: u32 = 50;
const AUTH_RATE_WINDOW: Duration = Duration::from_secs(15 * 60);
const KEY_BUNDLE_RATE_LIMIT: u32 = 30;
const KEY_BUNDLE_RATE_WINDOW: Duration = Duration::from_secs(15 * 60);
const UPLOAD_RATE_LIMIT: u32 = 200;
const UPLOAD_RATE_WINDOW: Duration = Duration::from_secs(60);
const STATE_FILE_NAME: &str = "spire-state.json";
const STATE_SNAPSHOT_INTERVAL: Duration = Duration::from_secs(1);
const OPENAPI_JSON: &str = include_str!("../../../../packages/types/openapi.json");
const ASYNCAPI_JSON: &str = include_str!("../../../../packages/types/asyncapi.json");
const CLI_PASSKEY_PAGE_TS: &str = include_str!("../../src/server/cliPasskeyPage.ts");

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    if let Err(err) = run().await {
        eprintln!("[spire-rs] {err}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let jwt_secret = required_env("JWT_SECRET")?;
    let spk = required_env("SPK")?;
    if spk.trim().is_empty() || spk == jwt_secret {
        return Err("SPK must be set and JWT_SECRET must be separate from SPK".into());
    }

    let port = env::var("API_PORT")
        .ok()
        .and_then(|s| s.trim().parse::<u16>().ok())
        .unwrap_or(DEFAULT_SPIRE_API_PORT);
    let fips_enabled = matches!(
        env::var("SPIRE_FIPS").ok().as_deref(),
        Some("1") | Some("true") | Some("TRUE")
    );
    let crypto_profile = if fips_enabled { "fips" } else { "tweetnacl" }.to_string();
    let data_dir = env::var("SPIRE_DATA_DIR")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("failed to create data dir {}: {e}", data_dir.display()))?;
    for dir in ["files", "avatars", "emoji"] {
        let path = data_dir.join(dir);
        fs::create_dir_all(&path)
            .map_err(|e| format!("failed to create {}: {e}", path.display()))?;
    }
    let inner = load_persistent_inner(&data_dir)?;

    let state = AppState {
        crypto_profile,
        data_dir,
        dev_api_key: env::var("DEV_API_KEY")
            .ok()
            .filter(|v| !v.trim().is_empty()),
        disable_rate_limits: env_truthy("SPIRE_DISABLE_RATE_LIMITS"),
        inner: Arc::new(Mutex::new(inner)),
        jwt_secret,
        started_at: Instant::now(),
        webauthn: build_webauthn_from_env().map(Arc::new),
    };

    spawn_persistent_snapshotter(state.clone());

    let shutdown_state = state.clone();
    let app = router(state);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    eprintln!("[spire-rs] listening on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|e| format!("failed to bind {addr}: {e}"))?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal(shutdown_state))
        .await
        .map_err(|e| format!("server failed: {e}"))
}

fn persistence_path(data_dir: &FsPath) -> PathBuf {
    data_dir.join(STATE_FILE_NAME)
}

fn load_persistent_inner(data_dir: &FsPath) -> Result<Inner, String> {
    let path = persistence_path(data_dir);
    if !path.exists() {
        return Ok(Inner::default());
    }
    let bytes = fs::read(&path).map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    let snapshot = serde_json::from_slice::<PersistentInner>(&bytes)
        .map_err(|e| format!("failed to parse {}: {e}", path.display()))?;
    Ok(snapshot.into_inner())
}

fn spawn_persistent_snapshotter(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(STATE_SNAPSHOT_INTERVAL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            if let Err(err) = persist_state_snapshot(&state).await {
                eprintln!("[spire-rs] state snapshot failed: {err}");
            }
        }
    });
}

async fn persist_state_snapshot(state: &AppState) -> Result<(), String> {
    let snapshot = {
        let inner = state.inner.lock().await;
        PersistentInner::from_inner(&inner)
    };
    let bytes = serde_json::to_vec_pretty(&snapshot)
        .map_err(|e| format!("failed to encode state snapshot: {e}"))?;
    let path = persistence_path(&state.data_dir);
    let tmp_path = state.data_dir.join(format!("{STATE_FILE_NAME}.tmp"));
    fs::write(&tmp_path, bytes)
        .map_err(|e| format!("failed to write {}: {e}", tmp_path.display()))?;
    fs::rename(&tmp_path, &path).map_err(|e| {
        format!(
            "failed to replace {} with {}: {e}",
            path.display(),
            tmp_path.display()
        )
    })
}

async fn shutdown_signal(state: AppState) {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = term.recv() => {},
        }
    }

    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }

    if let Err(err) = persist_state_snapshot(&state).await {
        eprintln!("[spire-rs] final state snapshot failed: {err}");
    }
}

fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/status", get(status))
        .route("/status/process", get(status_process))
        .route("/status/sqlite", get(status_sqlite))
        .route("/openapi.json", get(openapi_json))
        .route("/asyncapi.json", get(asyncapi_json))
        .route("/docs", get(docs_page))
        .route("/async-docs", get(async_docs_page))
        .route("/vendor/{*path}", get(vendor_not_found))
        .route("/cli/passkey", get(cli_passkey_page))
        .route(
            "/.well-known/apple-app-site-association",
            get(apple_app_site_association),
        )
        .route("/.well-known/assetlinks.json", get(assetlinks_json))
        .route("/socket", get(ws_handler))
        .route("/token/{token_type}", get(token))
        .route("/whoami", post(whoami))
        .route("/goodbye", post(goodbye))
        .route("/auth", post(auth))
        .route("/auth/device", post(auth_device))
        .route("/auth/device/verify", post(auth_device_verify))
        .route("/auth/passkey/begin", post(passkey_auth_begin))
        .route("/auth/passkey/finish", post(passkey_auth_finish))
        .route("/register", post(register))
        .route("/mail", post(mail_post))
        .route("/mail/batch", post(mail_batch))
        .route("/deviceList", post(device_list))
        .route("/device/{id}", get(device_get))
        .route("/device/{id}/connect", post(device_connect))
        .route("/device/{id}/keyBundle", post(device_key_bundle))
        .route("/device/{id}/mail", post(device_mail))
        .route("/device/{id}/otk/count", get(device_otk_count))
        .route("/device/{id}/prekey", post(device_prekey))
        .route("/device/{id}/otk", post(device_otk))
        .route(
            "/device/{id}/notifications/subscriptions",
            post(notification_subscribe),
        )
        .route(
            "/device/{id}/notifications/subscriptions/{subscription_id}",
            delete(notification_unsubscribe),
        )
        .route(
            "/server/{id}",
            get(server_get).post(server_create).delete(server_delete),
        )
        .route(
            "/server/{id}/channels",
            get(channels_get).post(channel_create),
        )
        .route("/server/{id}/invites", get(invites_get).post(invite_create))
        .route("/server/{id}/emoji", get(emoji_list))
        .route("/server/{id}/permissions", get(server_permissions))
        .route("/channel/{id}", get(channel_get).delete(channel_delete))
        .route("/permission/{id}", delete(permission_delete))
        .route("/userList/{channel_id}", post(user_list))
        .route(
            "/user/devices/requests/{request_id}/poll",
            post(device_request_poll),
        )
        .route(
            "/user/devices/requests/{request_id}/publish",
            post(device_request_publish),
        )
        .route(
            "/user/devices/requests/{request_id}/abort",
            post(device_request_abort),
        )
        .route(
            "/user/devices/requests/{request_id}/passkeys/register/begin",
            post(pending_device_passkey_register_begin),
        )
        .route(
            "/user/devices/requests/{request_id}/passkeys/register/finish",
            post(pending_device_passkey_register_finish),
        )
        .route("/user/{id}", get(user_get))
        .route(
            "/user/{id}/devices",
            get(user_devices).post(user_device_create),
        )
        .route(
            "/user/{user_id}/devices/{device_id}",
            delete(user_device_delete),
        )
        .route("/user/{id}/devices/requests", get(device_requests_list))
        .route(
            "/user/{id}/devices/requests/{request_id}",
            get(device_request_get),
        )
        .route(
            "/user/{id}/devices/requests/{request_id}/approve",
            post(device_request_approve),
        )
        .route(
            "/user/{id}/devices/requests/{request_id}/reject",
            post(device_request_reject),
        )
        .route("/user/{id}/permissions", get(user_permissions))
        .route("/user/{id}/servers", get(user_servers))
        .route("/user/{id}/servers/bootstrap", get(user_servers_bootstrap))
        .route("/user/{id}/passkeys", get(passkeys_list))
        .route(
            "/user/{id}/passkeys/register/begin",
            post(passkey_register_begin),
        )
        .route(
            "/user/{id}/passkeys/register/finish",
            post(passkey_register_finish),
        )
        .route("/user/{id}/passkeys/{passkey_id}", delete(passkey_delete))
        .route("/user/{id}/passkey/devices", get(passkey_user_devices))
        .route(
            "/user/{id}/passkey/devices/{device_id}",
            delete(passkey_user_device_delete),
        )
        .route(
            "/user/{id}/passkey/recover/devices/requests/{request_id}",
            post(passkey_recover_device_request),
        )
        .route(
            "/user/{id}/passkey/devices/requests/{request_id}/reject",
            post(passkey_reject_device_request),
        )
        .route("/file/json", post(file_json))
        .route("/file", post(file_multipart))
        .route("/file/{id}/details", get(file_details))
        .route("/file/{id}", get(file_get))
        .route("/avatar/{user_id}/json", post(avatar_json))
        .route("/avatar/{user_id}", get(avatar_get).post(avatar_multipart))
        .route("/emoji/{id}/json", post(emoji_json))
        .route("/emoji/{id}", post(emoji_multipart))
        .route("/emoji/{id}/details", get(emoji_details))
        .route("/emoji/{id}", get(emoji_get))
        .route("/invite/{invite_id}/preview", get(invite_preview))
        .route("/invite/{invite_id}", get(invite_get).patch(invite_redeem))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(DefaultBodyLimit::max(MAX_HTTP_BODY_BYTES))
        .with_state(state)
}

#[derive(Clone)]
struct AppState {
    crypto_profile: String,
    data_dir: PathBuf,
    dev_api_key: Option<String>,
    disable_rate_limits: bool,
    inner: Arc<Mutex<Inner>>,
    jwt_secret: String,
    started_at: Instant,
    webauthn: Option<Arc<Webauthn>>,
}

#[derive(Default)]
struct Inner {
    action_tokens: Vec<ActionTokenStored>,
    channels: HashMap<String, Channel>,
    clients: Vec<ConnectedClient>,
    device_challenges: HashMap<String, DeviceChallenge>,
    device_enrollments: HashMap<String, DeviceEnrollmentRequest>,
    device_passkey_approvals: HashMap<String, DevicePasskeyApproval>,
    devices: HashMap<String, Device>,
    emojis: HashMap<String, Emoji>,
    files: HashMap<String, FileSql>,
    invites: HashMap<String, Invite>,
    mail: Vec<MailRow>,
    notification_subscriptions: HashMap<String, NotificationSubscription>,
    otks: HashMap<String, Vec<PreKeyWire>>,
    passkeys: HashMap<String, PasskeyRecord>,
    pending_passkey_authentications: HashMap<String, PendingPasskeyAuthentication>,
    pending_passkey_registrations: HashMap<String, PendingPasskeyRegistration>,
    permissions: HashMap<String, Permission>,
    prekeys: HashMap<String, PreKeyWire>,
    rate_limits: HashMap<String, RateLimitEntry>,
    requests_total: u64,
    servers: HashMap<String, Server>,
    signkey_to_device_id: HashMap<String, String>,
    users: HashMap<String, UserRecord>,
    username_to_user_id: HashMap<String, String>,
}

struct RateLimitEntry {
    count: u32,
    window_start: Instant,
}

#[derive(Default, Serialize, Deserialize)]
struct PersistentInner {
    channels: HashMap<String, Channel>,
    device_passkey_approvals: HashMap<String, DevicePasskeyApproval>,
    devices: HashMap<String, Device>,
    emojis: HashMap<String, Emoji>,
    files: HashMap<String, FileSql>,
    invites: HashMap<String, Invite>,
    mail: Vec<MailRow>,
    notification_subscriptions: HashMap<String, NotificationSubscription>,
    otks: HashMap<String, Vec<PreKeyWire>>,
    passkeys: HashMap<String, PasskeyRecord>,
    permissions: HashMap<String, Permission>,
    prekeys: HashMap<String, PreKeyWire>,
    servers: HashMap<String, Server>,
    users: HashMap<String, UserRecord>,
}

impl PersistentInner {
    fn from_inner(inner: &Inner) -> Self {
        Self {
            channels: inner.channels.clone(),
            device_passkey_approvals: inner.device_passkey_approvals.clone(),
            devices: inner.devices.clone(),
            emojis: inner.emojis.clone(),
            files: inner.files.clone(),
            invites: inner.invites.clone(),
            mail: inner.mail.clone(),
            notification_subscriptions: inner.notification_subscriptions.clone(),
            otks: inner.otks.clone(),
            passkeys: inner.passkeys.clone(),
            permissions: inner.permissions.clone(),
            prekeys: inner.prekeys.clone(),
            servers: inner.servers.clone(),
            users: inner.users.clone(),
        }
    }

    fn into_inner(self) -> Inner {
        let mut inner = Inner {
            channels: self.channels,
            device_passkey_approvals: self.device_passkey_approvals,
            devices: self.devices,
            emojis: self.emojis,
            files: self.files,
            invites: self.invites,
            mail: self.mail,
            notification_subscriptions: self.notification_subscriptions,
            otks: self.otks,
            passkeys: self.passkeys,
            permissions: self.permissions,
            prekeys: self.prekeys,
            servers: self.servers,
            users: self.users,
            ..Inner::default()
        };
        inner.rebuild_derived_indexes();
        inner
    }
}

impl Inner {
    fn rebuild_derived_indexes(&mut self) {
        self.signkey_to_device_id = self
            .devices
            .values()
            .map(|device| (device.sign_key.clone(), device.device_id.clone()))
            .collect();
        self.username_to_user_id = self
            .users
            .values()
            .map(|user| (user.username.clone(), user.user_id.clone()))
            .collect();
    }
}

#[derive(Clone)]
struct ConnectedClient {
    device_id: String,
    tx: mpsc::UnboundedSender<Vec<u8>>,
    user_id: String,
}

#[derive(Clone)]
struct DeviceChallenge {
    device_id: String,
    nonce_hex: String,
    time: Instant,
}

#[derive(Clone)]
struct ActionTokenStored {
    token: ActionToken,
    time: Instant,
}

#[derive(Clone, Serialize, Deserialize)]
struct ActionToken {
    key: String,
    scope: u8,
    time: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct PublicUser {
    #[serde(rename = "lastSeen")]
    last_seen: String,
    #[serde(rename = "userID")]
    user_id: String,
    username: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct UserRecord {
    last_seen: String,
    password: String,
    user_id: String,
    username: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Device {
    deleted: bool,
    #[serde(rename = "deviceID")]
    device_id: String,
    #[serde(rename = "lastLogin")]
    last_login: String,
    name: String,
    owner: String,
    #[serde(rename = "signKey")]
    sign_key: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct DevicePayload {
    #[serde(rename = "deviceName")]
    device_name: String,
    #[serde(rename = "preKey")]
    pre_key: String,
    #[serde(rename = "preKeyIndex")]
    pre_key_index: i64,
    #[serde(rename = "preKeySignature")]
    pre_key_signature: String,
    signed: String,
    #[serde(rename = "signKey")]
    sign_key: String,
    username: Option<String>,
}

#[derive(Clone, Deserialize)]
struct RegistrationPayload {
    #[serde(rename = "deviceName")]
    device_name: String,
    #[serde(rename = "preKey")]
    pre_key: String,
    #[serde(rename = "preKeyIndex")]
    pre_key_index: i64,
    #[serde(rename = "preKeySignature")]
    pre_key_signature: String,
    signed: String,
    #[serde(rename = "signKey")]
    sign_key: String,
    username: Option<String>,
    password: Option<String>,
}

impl From<&RegistrationPayload> for DevicePayload {
    fn from(p: &RegistrationPayload) -> Self {
        Self {
            device_name: p.device_name.clone(),
            pre_key: p.pre_key.clone(),
            pre_key_index: p.pre_key_index,
            pre_key_signature: p.pre_key_signature.clone(),
            signed: p.signed.clone(),
            sign_key: p.sign_key.clone(),
            username: p.username.clone(),
        }
    }
}

#[derive(Clone, Serialize, Deserialize)]
struct PreKeyWire {
    #[serde(rename = "deviceID")]
    device_id: String,
    index: Option<i64>,
    #[serde(rename = "publicKey")]
    public_key: ByteBuf,
    signature: ByteBuf,
}

#[derive(Clone, Serialize)]
struct KeyBundle {
    #[serde(skip_serializing_if = "Option::is_none")]
    otk: Option<PreKeyWire>,
    #[serde(rename = "preKey")]
    pre_key: PreKeyWire,
    #[serde(rename = "signKey")]
    sign_key: ByteBuf,
}

#[derive(Clone, Serialize, Deserialize)]
struct MailWire {
    #[serde(rename = "authorID")]
    author_id: String,
    cipher: ByteBuf,
    extra: ByteBuf,
    forward: bool,
    group: Option<ByteBuf>,
    #[serde(rename = "mailID")]
    mail_id: String,
    #[serde(rename = "mailType")]
    mail_type: u8,
    nonce: ByteBuf,
    #[serde(rename = "readerID")]
    reader_id: String,
    recipient: String,
    sender: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct MailRow {
    header: Vec<u8>,
    mail: MailWire,
    time: String,
}

#[derive(Clone)]
struct DeviceEnrollmentRequest {
    approved_device_id: Option<String>,
    challenge_hex: String,
    created_at: DateTime<Utc>,
    device_payload: DevicePayload,
    error: Option<String>,
    owner_notified: bool,
    passkey_registration: Option<PendingDevicePasskeyRegistration>,
    requester_passkey_id: Option<String>,
    request_id: String,
    resolved_at: Option<DateTime<Utc>>,
    status: DeviceEnrollmentStatus,
    user_id: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum DeviceEnrollmentStatus {
    Approved,
    Expired,
    Pending,
    Rejected,
}

impl DeviceEnrollmentStatus {
    fn as_str(self) -> &'static str {
        match self {
            DeviceEnrollmentStatus::Approved => "approved",
            DeviceEnrollmentStatus::Expired => "expired",
            DeviceEnrollmentStatus::Pending => "pending",
            DeviceEnrollmentStatus::Rejected => "rejected",
        }
    }
}

#[derive(Clone)]
struct PendingDevicePasskeyRegistration {
    created_at: DateTime<Utc>,
    name: String,
    state: PasskeyRegistration,
}

#[derive(Clone)]
struct PendingPasskeyRegistration {
    created_at: DateTime<Utc>,
    name: String,
    state: PasskeyRegistration,
    user_id: String,
}

#[derive(Clone)]
struct PendingPasskeyAuthentication {
    created_at: DateTime<Utc>,
    state: PasskeyAuthentication,
    user_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct PasskeyRecord {
    created_at: String,
    credential: WebauthnPasskey,
    credential_id: String,
    last_used_at: Option<String>,
    name: String,
    passkey_id: String,
    transports: Vec<String>,
    user_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[allow(dead_code)]
struct DevicePasskeyApproval {
    approved_at: String,
    approved_by_device_id: Option<String>,
    approved_by_passkey_id: String,
    device_id: String,
    user_id: String,
}

#[derive(Serialize)]
struct PasskeyPublic {
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "lastUsedAt")]
    last_used_at: Option<String>,
    name: String,
    #[serde(rename = "passkeyID")]
    passkey_id: String,
    transports: Vec<String>,
    #[serde(rename = "userID")]
    user_id: String,
}

#[derive(Serialize)]
struct PendingDeviceRegistrationResponse {
    challenge: String,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "requestID")]
    request_id: String,
    status: &'static str,
    #[serde(rename = "userID")]
    user_id: String,
}

#[derive(Serialize)]
struct PendingDeviceRequestSummary {
    #[serde(rename = "approvedDeviceID", skip_serializing_if = "Option::is_none")]
    approved_device_id: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "deviceName")]
    device_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    #[serde(rename = "expiresAt")]
    expires_at: String,
    #[serde(rename = "requestID")]
    request_id: String,
    #[serde(rename = "signKey")]
    sign_key: String,
    status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    username: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
struct Server {
    #[serde(skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
    name: String,
    #[serde(rename = "serverID")]
    server_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Channel {
    #[serde(rename = "channelID")]
    channel_id: String,
    name: String,
    #[serde(rename = "serverID")]
    server_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Permission {
    #[serde(rename = "permissionID")]
    permission_id: String,
    #[serde(rename = "powerLevel")]
    power_level: i64,
    #[serde(rename = "resourceID")]
    resource_id: String,
    #[serde(rename = "resourceType")]
    resource_type: String,
    #[serde(rename = "userID")]
    user_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Invite {
    expiration: String,
    #[serde(rename = "inviteID")]
    invite_id: String,
    owner: String,
    #[serde(rename = "serverID")]
    server_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct Emoji {
    #[serde(rename = "emojiID")]
    emoji_id: String,
    name: String,
    owner: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct FileSql {
    #[serde(rename = "fileID")]
    file_id: String,
    nonce: String,
    owner: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct NotificationSubscription {
    channel: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "deviceID")]
    device_id: String,
    enabled: bool,
    events: Vec<String>,
    platform: Option<String>,
    #[serde(rename = "subscriptionID")]
    subscription_id: String,
    token: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
    #[serde(rename = "userID")]
    user_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct UserClaims {
    exp: Option<usize>,
    user: PublicUser,
}

#[derive(Clone, Serialize, Deserialize)]
struct DeviceClaims {
    device: Device,
    exp: Option<usize>,
}

#[derive(Clone, Serialize, Deserialize)]
struct PasskeyClaim {
    #[serde(rename = "passkeyID")]
    passkey_id: String,
}

#[derive(Clone, Serialize, Deserialize)]
struct PasskeyClaims {
    exp: Option<usize>,
    passkey: PasskeyClaim,
    scope: String,
    user: PublicUser,
}

#[derive(Default)]
struct AuthContext {
    device: Option<Device>,
    exp: Option<usize>,
    passkey_id: Option<String>,
    user: Option<PublicUser>,
}

#[derive(Deserialize)]
struct AuthPayload {
    password: String,
    username: String,
}

#[derive(Deserialize)]
struct PasskeyRegistrationStartPayload {
    name: String,
}

#[derive(Deserialize)]
struct PasskeyRegistrationFinishPayload {
    name: String,
    #[serde(rename = "requestID")]
    request_id: String,
    response: serde_json::Value,
}

#[derive(Deserialize)]
struct PasskeyAuthStartPayload {
    username: String,
}

#[derive(Deserialize)]
struct PasskeyAuthFinishPayload {
    #[serde(rename = "requestID")]
    request_id: String,
    response: serde_json::Value,
}

#[derive(Deserialize)]
struct SignedDeviceRequestPayload {
    signed: String,
}

#[derive(Deserialize)]
struct PendingDevicePasskeyRegistrationStartPayload {
    name: String,
    signed: String,
}

#[derive(Deserialize)]
struct PendingDevicePasskeyRegistrationFinishPayload {
    name: String,
    #[serde(rename = "requestID")]
    request_id: String,
    response: serde_json::Value,
    signed: String,
}

#[derive(Deserialize)]
struct DeviceAuthPayload {
    #[serde(rename = "deviceID")]
    device_id: String,
    #[serde(rename = "signKey")]
    sign_key: String,
}

#[derive(Deserialize)]
struct DeviceVerifyPayload {
    #[serde(rename = "challengeID")]
    challenge_id: String,
    signed: String,
}

#[derive(Deserialize)]
struct ConnectPayload {
    signed: ByteBuf,
}

#[derive(Deserialize)]
struct ChannelPayload {
    name: String,
}

#[derive(Deserialize)]
struct InvitePayload {
    duration: String,
    #[serde(rename = "serverID")]
    server_id: String,
}

#[derive(Deserialize)]
struct MailPostPayload {
    header: ByteBuf,
    mail: MailWire,
}

#[derive(Deserialize)]
struct MailBatchPayload {
    mails: Vec<MailPostPayload>,
}

#[derive(Serialize)]
struct MailBatchResponse {
    results: Vec<MailBatchResult>,
}

#[derive(Serialize)]
struct MailBatchResult {
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
    index: usize,
    #[serde(rename = "mailID", skip_serializing_if = "Option::is_none")]
    mail_id: Option<String>,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    recipient: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
}

#[derive(Deserialize)]
struct FilePayload {
    file: Option<String>,
    nonce: String,
    #[serde(rename = "owner")]
    _owner: String,
}

#[derive(Deserialize)]
struct AvatarJsonPayload {
    file: String,
}

#[derive(Deserialize)]
struct EmojiPayload {
    file: Option<String>,
    name: String,
}

#[derive(Deserialize)]
struct NotificationSubscribePayload {
    channel: String,
    events: Option<Vec<String>>,
    platform: Option<String>,
    token: String,
}

#[derive(Deserialize)]
struct WsAuth {
    token: String,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Deserialize)]
struct WsIncoming {
    #[serde(rename = "type")]
    kind: String,
    #[serde(rename = "transmissionID")]
    transmission_id: String,
    signed: Option<ByteBuf>,
    nonce: Option<ByteBuf>,
    #[serde(rename = "resourceType")]
    resource_type: Option<String>,
    action: Option<String>,
    data: Option<MailWire>,
}

#[derive(Serialize)]
struct WsBase<'a> {
    #[serde(rename = "transmissionID")]
    transmission_id: String,
    #[serde(rename = "type")]
    kind: &'a str,
}

#[derive(Serialize)]
struct WsChallenge {
    challenge: ByteBuf,
    #[serde(rename = "transmissionID")]
    transmission_id: String,
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Serialize)]
struct WsError {
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
    error: String,
    #[serde(rename = "transmissionID")]
    transmission_id: String,
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Serialize)]
struct WsNotify<T: Serialize> {
    data: Option<T>,
    event: String,
    #[serde(rename = "transmissionID")]
    transmission_id: String,
    #[serde(rename = "type")]
    kind: &'static str,
}

#[derive(Serialize)]
struct WsSuccess {
    data: Option<serde_json::Value>,
    #[serde(rename = "transmissionID")]
    transmission_id: String,
    #[serde(rename = "type")]
    kind: &'static str,
}

async fn openapi_json() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        OPENAPI_JSON,
    )
}

async fn asyncapi_json() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "application/json; charset=utf-8")],
        ASYNCAPI_JSON,
    )
}

async fn docs_page() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        r#"<!doctype html><meta charset="utf-8"><title>Spire OpenAPI</title><main><h1>Spire OpenAPI</h1><p><a href="/openapi.json">openapi.json</a></p></main>"#,
    )
}

async fn async_docs_page() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/html; charset=utf-8")],
        r#"<!doctype html><meta charset="utf-8"><title>Spire AsyncAPI</title><main><h1>Spire AsyncAPI</h1><p><a href="/asyncapi.json">asyncapi.json</a></p></main>"#,
    )
}

async fn vendor_not_found() -> impl IntoResponse {
    StatusCode::NOT_FOUND
}

async fn cli_passkey_page() -> Response {
    let html = extract_cli_passkey_page()
        .unwrap_or_else(|| "<!doctype html><title>Vex Passkey</title>".to_string());
    (
        [
            (header::CACHE_CONTROL, "no-store"),
            (
                header::CONTENT_SECURITY_POLICY,
                "default-src 'none'; base-uri 'none'; connect-src 'self' http://localhost:* http://127.0.0.1:*; form-action 'none'; frame-ancestors 'none'; img-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
            ),
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::REFERRER_POLICY, "no-referrer"),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff"),
        ],
        html,
    )
        .into_response()
}

async fn apple_app_site_association() -> Response {
    let apps = parse_env_list("SPIRE_PASSKEY_IOS_APP_IDS");
    if apps.is_empty() {
        return StatusCode::NOT_FOUND.into_response();
    }
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=300"),
        ],
        Json(serde_json::json!({ "webcredentials": { "apps": apps } })),
    )
        .into_response()
}

async fn assetlinks_json() -> Response {
    let Some(package_name) = env::var("SPIRE_PASSKEY_ANDROID_PACKAGE")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
    else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let fingerprints = normalized_android_fingerprints();
    if fingerprints.is_empty() {
        return StatusCode::NOT_FOUND.into_response();
    }
    (
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CACHE_CONTROL, "public, max-age=300"),
        ],
        Json(serde_json::json!([
            {
                "relation": [
                    "delegate_permission/common.get_login_creds",
                    "delegate_permission/common.handle_all_urls"
                ],
                "target": {
                    "namespace": "android_app",
                    "package_name": package_name,
                    "sha256_cert_fingerprints": fingerprints
                }
            }
        ])),
    )
        .into_response()
}

async fn healthz() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "dbReady": true }))
}

async fn status(State(state): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let mut body = serde_json::json!({
        "cryptoProfile": state.crypto_profile,
        "ok": true
    });
    if dev_key_matches(&state, &headers) {
        body["canary"] = serde_json::json!(false);
        body["checkDurationMs"] = serde_json::json!(0);
        body["now"] = serde_json::json!(now_iso());
        body["version"] = serde_json::json!("rust");
    }
    Json(body)
}

async fn status_process(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !dev_key_matches(&state, &headers) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let inner = state.inner.lock().await;
    Json(serde_json::json!({
        "activeRequestsApprox": inner.requests_total,
        "dbReady": true,
        "pid": std::process::id(),
        "uptimeSeconds": state.started_at.elapsed().as_secs(),
        "websocketClients": inner.clients.len()
    }))
    .into_response()
}

async fn status_sqlite(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if !dev_key_matches(&state, &headers) {
        return StatusCode::NOT_FOUND.into_response();
    }
    Json(serde_json::json!({
        "ok": true,
        "sqlite": {
            "dbType": "json-snapshot",
            "path": persistence_path(&state.data_dir).display().to_string(),
            "runtime": "rust"
        }
    }))
    .into_response()
}

async fn token(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(token_type): Path<String>,
) -> Response {
    let scope = match token_type.as_str() {
        "register" => 0,
        "file" => 1,
        "avatar" => 2,
        "device" => 3,
        "invite" => 4,
        "emoji" => 5,
        "connect" => 6,
        _ => return StatusCode::BAD_REQUEST.into_response(),
    };
    if token_type != "register" && auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let token = ActionToken {
        key: Uuid::new_v4().to_string(),
        scope,
        time: now_iso(),
    };
    {
        let mut inner = state.inner.lock().await;
        inner.action_tokens.push(ActionTokenStored {
            token: token.clone(),
            time: Instant::now(),
        });
    }

    let accept = headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if accept.contains("application/json")
        && !accept.contains("application/msgpack")
        && !accept.contains("*/*")
    {
        Json(token).into_response()
    } else {
        msgpack_response(&token)
    }
}

async fn whoami(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    msgpack_response(&serde_json::json!({
        "exp": auth.exp.unwrap_or(0),
        "user": user
    }))
}

async fn goodbye() -> impl IntoResponse {
    StatusCode::OK
}

async fn auth(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "auth",
        None,
        AUTH_RATE_LIMIT,
        AUTH_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Ok(payload) = decode_msgpack::<AuthPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid credentials format");
    };
    let username = payload.username.trim().to_ascii_lowercase();
    let user = {
        let inner = state.inner.lock().await;
        inner
            .username_to_user_id
            .get(&username)
            .and_then(|id| inner.users.get(id))
            .cloned()
    };
    let Some(user) = user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.password != payload.password {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let auth = auth_context(&state, &headers).await;
    {
        let inner = state.inner.lock().await;
        if let Some(err) = passkey_second_factor_error(
            &inner,
            &user.user_id,
            auth.passkey_id.as_deref(),
            "Passkey verification does not match this account.",
        ) {
            return json_error(StatusCode::FORBIDDEN, &err);
        }
    }
    let public = public_user(&user);
    let Ok(token) = sign_user_token(&state, &public) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    msgpack_response(&serde_json::json!({ "token": token, "user": public }))
}

async fn register(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "auth",
        None,
        AUTH_RATE_LIMIT,
        AUTH_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Ok(payload) = decode_msgpack::<RegistrationPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid registration payload");
    };
    let username = normalize_username(payload.username.as_deref(), &payload.sign_key);
    if !valid_username(&username) {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Username must be between three and nineteen letters, digits, or underscores.",
        );
    }
    let signed = match hex::decode(&payload.signed) {
        Ok(v) => v,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "Invalid or no token supplied."),
    };
    let sign_key = match hex::decode(&payload.sign_key) {
        Ok(v) => v,
        Err(_) => return json_error(StatusCode::BAD_REQUEST, "Invalid public key."),
    };
    if !verify_registration_payload_prekey_signature(&payload, &state.crypto_profile) {
        return json_error(StatusCode::UNAUTHORIZED, "Prekey signature invalid.");
    }
    let Some(opened) = open_signed_message(&signed, &sign_key) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid or no token supplied.");
    };
    if opened.len() != 16 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Invalid registration token payload.",
        );
    }
    let user_id = uuid_from_16(&opened);
    if !consume_action_token(&state, &user_id, 0).await {
        return json_error(StatusCode::BAD_REQUEST, "Invalid or no token supplied.");
    }

    let now = now_iso();
    let device_payload = DevicePayload::from(&payload);
    let (device, public) = {
        let mut inner = state.inner.lock().await;
        if inner.username_to_user_id.contains_key(&username) {
            let Some(existing_user_id) = inner.username_to_user_id.get(&username).cloned() else {
                return json_error(StatusCode::BAD_REQUEST, "Username is already registered.");
            };
            if inner.signkey_to_device_id.contains_key(&payload.sign_key) {
                return json_error(StatusCode::BAD_REQUEST, "Public key is already registered.");
            }
            let pending = create_pending_device_enrollment_locked(
                &mut inner,
                &existing_user_id,
                device_payload,
                true,
                None,
            );
            drop(inner);
            return msgpack_response_status(StatusCode::ACCEPTED, &pending);
        }
        if inner.signkey_to_device_id.contains_key(&payload.sign_key) {
            return json_error(StatusCode::BAD_REQUEST, "Public key is already registered.");
        }
        let user = UserRecord {
            last_seen: now.clone(),
            password: payload.password.unwrap_or_default(),
            user_id: user_id.clone(),
            username: username.clone(),
        };
        inner.username_to_user_id.insert(username, user_id.clone());
        inner.users.insert(user_id.clone(), user.clone());
        let device = create_device_locked(&mut inner, &user_id, &device_payload);
        (device, public_user(&user))
    };
    let Ok(token) = sign_user_token(&state, &public) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    msgpack_response(&serde_json::json!({
        "device": device,
        "token": token,
        "user": public
    }))
}

async fn auth_device(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "auth",
        None,
        AUTH_RATE_LIMIT,
        AUTH_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Ok(payload) = decode_msgpack::<DeviceAuthPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "deviceID and signKey required.");
    };
    let device = {
        let inner = state.inner.lock().await;
        retrieve_device_locked(&inner, &payload.device_id)
    };
    let Some(device) = device else {
        return json_error(StatusCode::NOT_FOUND, "Device not found.");
    };
    if device.sign_key != payload.sign_key {
        return json_error(StatusCode::NOT_FOUND, "Device not found.");
    }
    let nonce = random_hex(32);
    let challenge_id = Uuid::new_v4().to_string();
    {
        let mut inner = state.inner.lock().await;
        inner.device_challenges.insert(
            challenge_id.clone(),
            DeviceChallenge {
                device_id: device.device_id,
                nonce_hex: nonce.clone(),
                time: Instant::now(),
            },
        );
    }
    msgpack_response(&serde_json::json!({
        "challenge": nonce,
        "challengeID": challenge_id
    }))
}

async fn auth_device_verify(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "auth",
        None,
        AUTH_RATE_LIMIT,
        AUTH_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Ok(payload) = decode_msgpack::<DeviceVerifyPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "challengeID and signed required.");
    };
    let challenge = {
        let mut inner = state.inner.lock().await;
        inner.device_challenges.remove(&payload.challenge_id)
    };
    let Some(challenge) = challenge else {
        return json_error(StatusCode::UNAUTHORIZED, "Challenge expired or not found.");
    };
    if challenge.time.elapsed() > DEVICE_CHALLENGE_EXPIRY {
        return json_error(StatusCode::UNAUTHORIZED, "Challenge expired.");
    }
    let (device, user) = {
        let inner = state.inner.lock().await;
        let Some(device) = retrieve_device_locked(&inner, &challenge.device_id) else {
            return json_error(StatusCode::NOT_FOUND, "Device not found.");
        };
        let Some(user) = inner.users.get(&device.owner).cloned() else {
            return json_error(StatusCode::NOT_FOUND, "Device owner not found.");
        };
        (device, user)
    };
    let signed = match hex::decode(&payload.signed) {
        Ok(v) => v,
        Err(_) => return json_error(StatusCode::UNAUTHORIZED, "Signature verification failed."),
    };
    let public_key = match hex::decode(&device.sign_key) {
        Ok(v) => v,
        Err(_) => return json_error(StatusCode::UNAUTHORIZED, "Signature verification failed."),
    };
    let Some(opened) = open_signed_message(&signed, &public_key) else {
        return json_error(StatusCode::UNAUTHORIZED, "Signature verification failed.");
    };
    if hex::encode(opened) != challenge.nonce_hex {
        return json_error(StatusCode::UNAUTHORIZED, "Challenge mismatch.");
    }
    let auth = auth_context(&state, &headers).await;
    {
        let inner = state.inner.lock().await;
        if let Some(err) = passkey_second_factor_error(
            &inner,
            &user.user_id,
            auth.passkey_id.as_deref(),
            "Passkey verification does not match this device.",
        ) {
            let mut body = serde_json::json!({ "error": err });
            if err == "Passkey verification required." {
                body["username"] = serde_json::json!(user.username);
            }
            return (StatusCode::FORBIDDEN, Json(body)).into_response();
        }
    }
    let public = public_user(&user);
    let Ok(token) = sign_user_token(&state, &public) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    msgpack_response(&serde_json::json!({ "token": token, "user": public }))
}

async fn device_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    match retrieve_device_locked(&inner, &id) {
        Some(device) => msgpack_response(&device),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn device_connect(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<ConnectPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid connect payload");
    };
    let device = {
        let inner = state.inner.lock().await;
        retrieve_device_locked(&inner, &id)
    };
    let Some(device) = device else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if user.user_id != device.owner {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    {
        let inner = state.inner.lock().await;
        let passkey_count = inner
            .passkeys
            .values()
            .filter(|p| p.user_id == device.owner)
            .count();
        if passkey_count == 0 && !dev_key_matches(&state, &headers) {
            return json_error(
                StatusCode::FORBIDDEN,
                "A passkey must be registered before this device can connect.",
            );
        }
    }
    let public_key = match hex::decode(&device.sign_key) {
        Ok(v) => v,
        Err(_) => return StatusCode::UNAUTHORIZED.into_response(),
    };
    let Some(opened) = open_signed_message(payload.signed.as_ref(), &public_key) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if opened.len() != 16 {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let token_key = uuid_from_16(&opened);
    if !consume_action_token(&state, &token_key, 6).await {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(device_token) = sign_device_token(&state, &device) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    msgpack_response(&serde_json::json!({ "deviceToken": device_token }))
}

async fn device_key_bundle(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let limiter_key = format!("{}:{id}", user.user_id);
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "keyBundle",
        Some(&limiter_key),
        KEY_BUNDLE_RATE_LIMIT,
        KEY_BUNDLE_RATE_WINDOW,
    )
    .await
    {
        return resp;
    };
    let mut inner = state.inner.lock().await;
    let Some(device) = retrieve_device_locked(&inner, &id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(pre_key) = inner.prekeys.get(&device.device_id).cloned() else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    let otk = inner.otks.get_mut(&device.device_id).and_then(|keys| {
        if keys.is_empty() {
            None
        } else {
            Some(keys.remove(0))
        }
    });
    let sign_key_wire = match hex::decode(&device.sign_key) {
        Ok(v) => v,
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    let sign_key = if state.crypto_profile == "fips" {
        match fips_ecdh_raw_public_key_from_ecdsa_spki(&sign_key_wire) {
            Some(raw) => raw,
            None => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
        }
    } else {
        sign_key_wire
    };
    msgpack_response(&KeyBundle {
        otk,
        pre_key,
        sign_key: ByteBuf::from(sign_key),
    })
}

async fn device_mail(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(device) = auth.device else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    let rows: Vec<(ByteBuf, MailWire, String)> = inner
        .mail
        .iter()
        .filter(|m| m.mail.recipient == device.device_id)
        .map(|m| {
            (
                ByteBuf::from(m.header.clone()),
                m.mail.clone(),
                m.time.clone(),
            )
        })
        .collect();
    msgpack_response(&rows)
}

async fn device_otk_count(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(device) = auth.device else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    let count = inner
        .otks
        .get(&device.device_id)
        .map(|v| v.len())
        .unwrap_or(0);
    msgpack_response(&serde_json::json!({ "count": count }))
}

async fn device_prekey(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(device)) = (auth.user, auth.device) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if device.device_id != id || user.user_id != device.owner {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(mut prekey) = decode_msgpack::<PreKeyWire>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid prekey payload");
    };
    if prekey.device_id != id {
        return json_error(StatusCode::BAD_REQUEST, "Prekey deviceID mismatch.");
    }
    if !verify_prekey_signature(&prekey, &device.sign_key, &state.crypto_profile) {
        return json_error(StatusCode::UNAUTHORIZED, "Prekey signature invalid.");
    }
    prekey.device_id = id.clone();
    let mut inner = state.inner.lock().await;
    inner.prekeys.insert(id, prekey);
    StatusCode::OK.into_response()
}

async fn device_otk(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(device)) = (auth.user, auth.device) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if device.device_id != id || user.user_id != device.owner {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(otks) = decode_msgpack::<Vec<PreKeyWire>>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid OTK payload");
    };
    for otk in &otks {
        if otk.device_id != id {
            return json_error(StatusCode::BAD_REQUEST, "OTK deviceID mismatch.");
        }
        if !verify_prekey_signature(otk, &device.sign_key, &state.crypto_profile) {
            return json_error(StatusCode::UNAUTHORIZED, "OTK signature invalid.");
        }
    }
    let mut inner = state.inner.lock().await;
    inner.otks.entry(id).or_default().extend(otks);
    StatusCode::OK.into_response()
}

async fn mail_post(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(device)) = (auth.user, auth.device) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<MailPostPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid mail payload");
    };
    match save_mail_and_notify(
        &state,
        &user.user_id,
        &device.device_id,
        payload.header.into_vec(),
        payload.mail,
    )
    .await
    {
        Ok(()) => StatusCode::OK.into_response(),
        Err((status, msg)) => json_error(status, &msg),
    }
}

async fn mail_batch(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(device)) = (auth.user, auth.device) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<MailBatchPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid mail batch payload");
    };
    if payload.mails.is_empty() || payload.mails.len() > 256 {
        return json_error(StatusCode::BAD_REQUEST, "Invalid mail batch payload");
    }
    let mut results = Vec::with_capacity(payload.mails.len());
    for (index, item) in payload.mails.into_iter().enumerate() {
        let mail_id = item.mail.mail_id.clone();
        let recipient = item.mail.recipient.clone();
        match save_mail_and_notify(
            &state,
            &user.user_id,
            &device.device_id,
            item.header.into_vec(),
            item.mail,
        )
        .await
        {
            Ok(()) => results.push(MailBatchResult {
                error: None,
                index,
                mail_id: Some(mail_id),
                ok: true,
                recipient: Some(recipient),
                status: None,
            }),
            Err((status, msg)) => results.push(MailBatchResult {
                error: Some(msg),
                index,
                mail_id: Some(mail_id),
                ok: false,
                recipient: Some(recipient),
                status: Some(status.as_u16()),
            }),
        }
    }
    msgpack_response(&MailBatchResponse { results })
}

async fn device_list(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(ids) = decode_msgpack::<Vec<String>>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Expected array of user ID strings");
    };
    let inner = state.inner.lock().await;
    let devices: Vec<Device> = inner
        .devices
        .values()
        .filter(|d| !d.deleted && ids.iter().any(|id| id == &d.owner))
        .cloned()
        .collect();
    msgpack_response(&devices)
}

async fn server_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name_b64): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let name = general_purpose::STANDARD
        .decode(name_b64.as_bytes())
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .unwrap_or(name_b64);
    let mut inner = state.inner.lock().await;
    let server = create_server_locked(&mut inner, &name, &user.user_id);
    msgpack_response(&server)
}

async fn server_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    match inner.servers.get(&id) {
        Some(server) => msgpack_response(server),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn server_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let mut inner = state.inner.lock().await;
    if !has_permission(&inner, &user.user_id, &id, 50) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let channel_ids: Vec<String> = inner
        .channels
        .values()
        .filter(|c| c.server_id == id)
        .map(|c| c.channel_id.clone())
        .collect();
    for channel_id in &channel_ids {
        inner.channels.remove(channel_id);
    }
    inner.mail.retain(|m| {
        let group_id = m.mail.group.as_ref().map(|g| uuid_from_16(g.as_ref()));
        !matches!(group_id, Some(ref gid) if channel_ids.iter().any(|id| id == gid))
    });
    inner.servers.remove(&id);
    inner.permissions.retain(|_, p| p.resource_id != id);
    StatusCode::OK.into_response()
}

async fn channels_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    if !has_any_permission(&inner, &user.user_id, &id) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let channels: Vec<Channel> = inner
        .channels
        .values()
        .filter(|c| c.server_id == id)
        .cloned()
        .collect();
    msgpack_response(&channels)
}

async fn channel_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<ChannelPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid channel payload");
    };
    let mut inner = state.inner.lock().await;
    if !has_permission(&inner, &user.user_id, &id, 50) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let channel = Channel {
        channel_id: Uuid::new_v4().to_string(),
        name: payload.name,
        server_id: id,
    };
    inner
        .channels
        .insert(channel.channel_id.clone(), channel.clone());
    msgpack_response(&channel)
}

async fn channel_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    match inner.channels.get(&id) {
        Some(channel) => msgpack_response(channel),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn channel_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let mut inner = state.inner.lock().await;
    let Some(channel) = inner.channels.get(&id).cloned() else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if !has_permission(&inner, &user.user_id, &channel.server_id, 50) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    inner.channels.remove(&id);
    inner.mail.retain(|m| {
        let group_id = m.mail.group.as_ref().map(|g| uuid_from_16(g.as_ref()));
        !matches!(group_id, Some(ref gid) if gid == &id)
    });
    StatusCode::OK.into_response()
}

async fn invites_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    if !has_permission(&inner, &user.user_id, &id, 25) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let now = Utc::now();
    let invites: Vec<Invite> = inner
        .invites
        .values()
        .filter(|i| i.server_id == id && parse_iso(&i.expiration).map(|t| t > now).unwrap_or(true))
        .cloned()
        .collect();
    msgpack_response(&invites)
}

async fn invite_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<InvitePayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid invite payload");
    };
    let duration = parse_duration_ms(&payload.duration).unwrap_or(3_600_000);
    let mut inner = state.inner.lock().await;
    if payload.server_id != id || !inner.servers.contains_key(&id) {
        return StatusCode::NOT_FOUND.into_response();
    }
    if !has_permission(&inner, &user.user_id, &id, 25) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let invite = Invite {
        expiration: (Utc::now() + chrono::Duration::milliseconds(duration as i64))
            .to_rfc3339_opts(SecondsFormat::Millis, true),
        invite_id: Uuid::new_v4().to_string(),
        owner: user.user_id,
        server_id: id,
    };
    inner
        .invites
        .insert(invite.invite_id.clone(), invite.clone());
    msgpack_response(&invite)
}

async fn invite_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(invite_id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    match inner.invites.get(&invite_id) {
        Some(invite) => msgpack_response(invite),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn invite_preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(invite_id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    let Some(invite) = inner.invites.get(&invite_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if is_expired(&invite.expiration) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Some(server) = inner.servers.get(&invite.server_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let channels: Vec<Channel> = inner
        .channels
        .values()
        .filter(|c| c.server_id == invite.server_id)
        .cloned()
        .collect();
    msgpack_response(
        &serde_json::json!({ "invite": invite, "server": server, "channels": channels }),
    )
}

async fn invite_redeem(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(invite_id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let mut inner = state.inner.lock().await;
    let Some(invite) = inner.invites.get(&invite_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if is_expired(&invite.expiration) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let permission =
        create_permission_locked(&mut inner, &user.user_id, "server", &invite.server_id, 0);
    msgpack_response(&permission)
}

async fn user_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    match retrieve_user_locked(&inner, &id) {
        Some(user) => msgpack_response(&public_user(&user)),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn user_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    if !inner.users.contains_key(&id) {
        return StatusCode::NOT_FOUND.into_response();
    }
    let devices: Vec<Device> = inner
        .devices
        .values()
        .filter(|d| !d.deleted && d.owner == id)
        .cloned()
        .collect();
    msgpack_response(&devices)
}

async fn user_device_create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(payload) = decode_msgpack::<DevicePayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid device payload");
    };
    let signed = match hex::decode(&payload.signed) {
        Ok(v) => v,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    let sign_key = match hex::decode(&payload.sign_key) {
        Ok(v) => v,
        Err(_) => return StatusCode::BAD_REQUEST.into_response(),
    };
    if !verify_device_payload_prekey_signature(&payload, &state.crypto_profile) {
        return json_error(StatusCode::UNAUTHORIZED, "Prekey signature invalid.");
    }
    let Some(opened) = open_signed_message(&signed, &sign_key) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    if opened.len() != 16 || !consume_action_token(&state, &uuid_from_16(&opened), 3).await {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let requester_passkey_id = auth.passkey_id;
    let mut inner = state.inner.lock().await;
    if inner.signkey_to_device_id.contains_key(&payload.sign_key) {
        return StatusCode::from_u16(470).unwrap().into_response();
    }
    let active_count = inner
        .devices
        .values()
        .filter(|d| !d.deleted && d.owner == id)
        .count();
    if active_count > 0 {
        let pending = create_pending_device_enrollment_locked(
            &mut inner,
            &id,
            payload,
            false,
            requester_passkey_id,
        );
        drop(inner);
        notify_user(
            &state,
            &id,
            "deviceRequest",
            Some(serde_json::json!({
                "requestID": pending.request_id,
                "status": "pending"
            })),
            None,
        )
        .await;
        return msgpack_response_status(StatusCode::ACCEPTED, &pending);
    }
    let device = create_device_locked(&mut inner, &id, &payload);
    msgpack_response(&device)
}

async fn user_device_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((_user_id, device_id)): Path<(String, String)>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let mut inner = state.inner.lock().await;
    let Some(device) = inner.devices.get(&device_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if device.owner != user.user_id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let active_count = inner
        .devices
        .values()
        .filter(|d| !d.deleted && d.owner == user.user_id)
        .count();
    if active_count <= 1 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "You can't delete your last device.",
        );
    }
    if let Some(d) = inner.devices.get_mut(&device_id) {
        d.deleted = true;
    }
    StatusCode::OK.into_response()
}

async fn user_permissions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    let permissions: Vec<Permission> = inner
        .permissions
        .values()
        .filter(|p| p.user_id == user.user_id)
        .cloned()
        .collect();
    msgpack_response(&permissions)
}

async fn user_servers(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    let servers = user_servers_locked(&inner, &user.user_id);
    msgpack_response(&servers)
}

async fn user_servers_bootstrap(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    let servers = user_servers_locked(&inner, &user.user_id);
    let mut channels_by_server: HashMap<String, Vec<Channel>> = HashMap::new();
    for server in &servers {
        channels_by_server.insert(
            server.server_id.clone(),
            inner
                .channels
                .values()
                .filter(|c| c.server_id == server.server_id)
                .cloned()
                .collect(),
        );
    }
    msgpack_response(&serde_json::json!({
        "servers": servers,
        "channelsByServer": channels_by_server
    }))
}

async fn server_permissions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    if !has_any_permission(&inner, &user.user_id, &id) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let permissions: Vec<Permission> = inner
        .permissions
        .values()
        .filter(|p| p.resource_id == id)
        .cloned()
        .collect();
    msgpack_response(&permissions)
}

async fn permission_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let mut inner = state.inner.lock().await;
    let Some(target) = inner.permissions.get(&id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let can_delete = target.user_id == user.user_id
        || inner.permissions.values().any(|p| {
            p.user_id == user.user_id
                && p.resource_id == target.resource_id
                && p.power_level > 50
                && p.power_level > target.power_level
        });
    if !can_delete {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    inner.permissions.remove(&id);
    StatusCode::OK.into_response()
}

async fn user_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(channel_id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let inner = state.inner.lock().await;
    let Some(channel) = inner.channels.get(&channel_id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if !has_any_permission(&inner, &user.user_id, &channel.server_id) {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let users: Vec<PublicUser> = inner
        .permissions
        .values()
        .filter(|p| p.resource_id == channel.server_id)
        .filter_map(|p| inner.users.get(&p.user_id).map(public_user))
        .collect();
    msgpack_response(&users)
}

async fn passkeys_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    let list: Vec<PasskeyPublic> = inner
        .passkeys
        .values()
        .filter(|p| p.user_id == id)
        .map(passkey_public)
        .collect();
    wire_response(&query, &list)
}

async fn passkey_register_begin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(payload) = decode_wire::<PasskeyRegistrationStartPayload>(&headers, &body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid registration payload");
    };
    if payload.name.is_empty() || payload.name.len() > 255 {
        return json_error(StatusCode::BAD_REQUEST, "Invalid registration payload");
    }
    let Some(webauthn) = state.webauthn.as_ref() else {
        return passkeys_not_configured();
    };
    let existing = {
        let inner = state.inner.lock().await;
        inner
            .passkeys
            .values()
            .filter(|p| p.user_id == id)
            .cloned()
            .collect::<Vec<_>>()
    };
    if auth.device.is_none() && !existing.is_empty() {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "Adding another passkey requires an authenticated device.",
        );
    }
    if existing.len() >= MAX_PASSKEYS_PER_USER {
        return json_error(
            StatusCode::CONFLICT,
            &format!("Each account is limited to {MAX_PASSKEYS_PER_USER} passkeys."),
        );
    }
    let exclude_credentials = existing
        .iter()
        .map(|p| p.credential.cred_id().clone())
        .collect();
    let Ok(user_uuid) = Uuid::parse_str(&id) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid user ID.");
    };
    let Ok((challenge, registration_state)) = webauthn.start_passkey_registration(
        user_uuid,
        &user.username,
        &user.username,
        Some(exclude_credentials),
    ) else {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not start passkey registration.",
        );
    };
    let request_id = Uuid::new_v4().to_string();
    {
        let mut inner = state.inner.lock().await;
        prune_passkey_ceremonies_locked(&mut inner);
        inner.pending_passkey_registrations.insert(
            request_id.clone(),
            PendingPasskeyRegistration {
                created_at: Utc::now(),
                name: payload.name,
                state: registration_state,
                user_id: id,
            },
        );
    }
    let Some(options) = webauthn_creation_options_value(challenge) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    wire_response(
        &query,
        &serde_json::json!({ "options": options, "requestID": request_id }),
    )
}

async fn passkey_register_finish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Path(id): Path<String>,
    body: Bytes,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(payload) = decode_wire::<PasskeyRegistrationFinishPayload>(&headers, &body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid finish payload");
    };
    if payload.name.is_empty() || payload.name.len() > 255 {
        return json_error(StatusCode::BAD_REQUEST, "Invalid finish payload");
    }
    let Some(webauthn) = state.webauthn.as_ref() else {
        return passkeys_not_configured();
    };
    let existing_count = {
        let inner = state.inner.lock().await;
        inner.passkeys.values().filter(|p| p.user_id == id).count()
    };
    if auth.device.is_none() && existing_count > 0 {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "Adding another passkey requires an authenticated device.",
        );
    }
    let pending = {
        let mut inner = state.inner.lock().await;
        prune_passkey_ceremonies_locked(&mut inner);
        inner
            .pending_passkey_registrations
            .remove(&payload.request_id)
    };
    let Some(pending) = pending.filter(|p| p.user_id == id) else {
        return json_error(
            StatusCode::NOT_FOUND,
            "Registration request not found or expired.",
        );
    };
    let Ok(registration_response) =
        serde_json::from_value::<RegisterPublicKeyCredential>(payload.response)
    else {
        return json_error(StatusCode::BAD_REQUEST, "Passkey attestation invalid.");
    };
    let credential =
        match webauthn.finish_passkey_registration(&registration_response, &pending.state) {
            Ok(credential) => credential,
            Err(err) => {
                return json_error(
                    StatusCode::BAD_REQUEST,
                    &format!("Passkey attestation invalid: {err}"),
                );
            }
        };
    let credential_id = webauthn_credential_id(&credential);
    let transports = passkey_transports_from_registration(&registration_response);
    let public = {
        let mut inner = state.inner.lock().await;
        if inner
            .passkeys
            .values()
            .any(|p| p.credential_id == credential_id)
        {
            return json_error(
                StatusCode::CONFLICT,
                "This authenticator is already registered.",
            );
        }
        if inner.passkeys.values().filter(|p| p.user_id == id).count() >= MAX_PASSKEYS_PER_USER {
            return json_error(
                StatusCode::CONFLICT,
                &format!("Each account is limited to {MAX_PASSKEYS_PER_USER} passkeys."),
            );
        }
        let record =
            create_passkey_record(&id, pending.name, credential_id, credential, transports);
        let public = passkey_public(&record);
        inner.passkeys.insert(record.passkey_id.clone(), record);
        public
    };
    wire_response(&query, &public)
}

async fn passkey_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, passkey_id)): Path<(String, String)>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut inner = state.inner.lock().await;
    let Some(row) = inner.passkeys.get(&passkey_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if row.user_id != id {
        return StatusCode::NOT_FOUND.into_response();
    }
    let count = inner.passkeys.values().filter(|p| p.user_id == id).count();
    if count <= 1 {
        return json_error(
            StatusCode::BAD_REQUEST,
            "You can't delete your last passkey.",
        );
    }
    inner.passkeys.remove(&passkey_id);
    StatusCode::OK.into_response()
}

async fn passkey_auth_begin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    body: Bytes,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "auth",
        None,
        AUTH_RATE_LIMIT,
        AUTH_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Ok(payload) = decode_wire::<PasskeyAuthStartPayload>(&headers, &body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid begin payload");
    };
    let Some(webauthn) = state.webauthn.as_ref() else {
        return passkeys_not_configured();
    };
    let (user, credentials) = {
        let inner = state.inner.lock().await;
        let Some(user) = retrieve_user_locked(&inner, &payload.username) else {
            return StatusCode::UNAUTHORIZED.into_response();
        };
        let credentials = inner
            .passkeys
            .values()
            .filter(|p| p.user_id == user.user_id)
            .map(|p| p.credential.clone())
            .collect::<Vec<_>>();
        (user, credentials)
    };
    if credentials.is_empty() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok((challenge, auth_state)) = webauthn.start_passkey_authentication(&credentials) else {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not start passkey authentication.",
        );
    };
    let request_id = Uuid::new_v4().to_string();
    {
        let mut inner = state.inner.lock().await;
        prune_passkey_ceremonies_locked(&mut inner);
        inner.pending_passkey_authentications.insert(
            request_id.clone(),
            PendingPasskeyAuthentication {
                created_at: Utc::now(),
                state: auth_state,
                user_id: user.user_id,
            },
        );
    }
    let Some(options) = webauthn_request_options_value(challenge) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    wire_response(
        &query,
        &serde_json::json!({ "options": options, "requestID": request_id }),
    )
}

async fn passkey_auth_finish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    body: Bytes,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "auth",
        None,
        AUTH_RATE_LIMIT,
        AUTH_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Ok(payload) = decode_wire::<PasskeyAuthFinishPayload>(&headers, &body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid finish payload");
    };
    let Some(webauthn) = state.webauthn.as_ref() else {
        return passkeys_not_configured();
    };
    let pending = {
        let mut inner = state.inner.lock().await;
        prune_passkey_ceremonies_locked(&mut inner);
        inner
            .pending_passkey_authentications
            .remove(&payload.request_id)
    };
    let Some(pending) = pending else {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "Authentication challenge not found or expired.",
        );
    };
    let Ok(assertion) = serde_json::from_value::<PublicKeyCredential>(payload.response) else {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Assertion is missing a credential id.",
        );
    };
    if assertion.id.is_empty() {
        return json_error(
            StatusCode::BAD_REQUEST,
            "Assertion is missing a credential id.",
        );
    }
    let auth_result = match webauthn.finish_passkey_authentication(&assertion, &pending.state) {
        Ok(result) => result,
        Err(err) => {
            return json_error(
                StatusCode::UNAUTHORIZED,
                &format!("Passkey assertion invalid: {err}"),
            );
        }
    };
    let (passkey_id, public_user) = {
        let mut inner = state.inner.lock().await;
        let Some(user) = inner.users.get(&pending.user_id).cloned() else {
            return json_error(StatusCode::NOT_FOUND, "Account not found.");
        };
        let mut matched_passkey_id = None;
        for record in inner.passkeys.values_mut() {
            if record.user_id == pending.user_id
                && record.credential.update_credential(&auth_result).is_some()
            {
                record.last_used_at = Some(now_iso());
                matched_passkey_id = Some(record.passkey_id.clone());
                break;
            }
        }
        let Some(passkey_id) = matched_passkey_id else {
            return json_error(
                StatusCode::UNAUTHORIZED,
                "No matching passkey for this account.",
            );
        };
        (passkey_id, public_user(&user))
    };
    let Ok(token) = sign_passkey_token(&state, &public_user, &passkey_id) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    wire_response(
        &query,
        &serde_json::json!({
            "passkeyID": passkey_id,
            "token": token,
            "user": public_user
        }),
    )
}

async fn device_requests_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut inner = state.inner.lock().await;
    prune_device_enrollments_locked(&mut inner);
    let mut requests: Vec<PendingDeviceRequestSummary> = inner
        .device_enrollments
        .values()
        .filter(|r| r.user_id == id)
        .map(device_request_summary)
        .collect();
    requests.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    msgpack_response(&requests)
}

async fn device_request_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, request_id)): Path<(String, String)>,
) -> Response {
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut inner = state.inner.lock().await;
    prune_device_enrollments_locked(&mut inner);
    let Some(req) = inner.device_enrollments.get(&request_id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if req.user_id != id {
        return StatusCode::NOT_FOUND.into_response();
    }
    msgpack_response(&device_request_summary(req))
}

async fn device_request_poll(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
    body: Bytes,
) -> Response {
    let Ok(payload) = decode_msgpack::<SignedDeviceRequestPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid poll payload");
    };
    let mut inner = state.inner.lock().await;
    prune_device_enrollments_locked(&mut inner);
    let Ok(summary) = verified_pending_request_summary_locked(&inner, &request_id, &payload.signed)
    else {
        return pending_signature_error_response(&inner, &request_id);
    };
    msgpack_response(&summary)
}

async fn device_request_publish(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
    body: Bytes,
) -> Response {
    let Ok(payload) = decode_msgpack::<SignedDeviceRequestPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid poll payload");
    };
    {
        let inner = state.inner.lock().await;
        if verified_pending_request_locked(&inner, &request_id, &payload.signed).is_err() {
            return pending_signature_error_response(&inner, &request_id);
        }
    }
    let user_to_notify = {
        let mut inner = state.inner.lock().await;
        prune_device_enrollments_locked(&mut inner);
        let Some(pending) = inner.device_enrollments.get_mut(&request_id) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        if pending.owner_notified {
            return StatusCode::NO_CONTENT.into_response();
        }
        pending.owner_notified = true;
        pending.user_id.clone()
    };
    notify_user(
        &state,
        &user_to_notify,
        "deviceRequest",
        Some(serde_json::json!({ "requestID": request_id, "status": "pending" })),
        None,
    )
    .await;
    StatusCode::OK.into_response()
}

async fn device_request_abort(
    State(state): State<AppState>,
    Path(request_id): Path<String>,
    body: Bytes,
) -> Response {
    let Ok(payload) = decode_msgpack::<SignedDeviceRequestPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid poll payload");
    };
    {
        let inner = state.inner.lock().await;
        if verified_pending_request_locked(&inner, &request_id, &payload.signed).is_err() {
            return pending_signature_error_response(&inner, &request_id);
        }
    }
    let mut inner = state.inner.lock().await;
    let Some(pending) = inner.device_enrollments.get(&request_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if pending.owner_notified {
        return json_error(
            StatusCode::CONFLICT,
            "This request was already sent to your other devices.",
        );
    }
    inner.device_enrollments.remove(&request_id);
    StatusCode::OK.into_response()
}

async fn device_request_approve(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, request_id)): Path<(String, String)>,
    body: Bytes,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(approver_device)) = (auth.user, auth.device) else {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "Approve requires an authenticated existing device.",
        );
    };
    if user.user_id != id || approver_device.owner != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let Ok(payload) = decode_msgpack::<SignedDeviceRequestPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid approval payload");
    };
    let (device, notify_status) = {
        let mut inner = state.inner.lock().await;
        prune_device_enrollments_locked(&mut inner);
        let Some(pending) = inner.device_enrollments.get(&request_id).cloned() else {
            return StatusCode::NOT_FOUND.into_response();
        };
        let err = validate_pending_approval_locked(
            &inner,
            &pending,
            &approver_device,
            &payload.signed,
            auth.passkey_id.as_deref(),
        );
        if let Some((status, message)) = err {
            return json_error(status, &message);
        }
        if inner
            .signkey_to_device_id
            .contains_key(&pending.device_payload.sign_key)
        {
            return StatusCode::from_u16(470).unwrap().into_response();
        }
        let device = create_device_locked(&mut inner, &id, &pending.device_payload);
        let passkey_id = pending
            .requester_passkey_id
            .clone()
            .or_else(|| auth.passkey_id.clone());
        if let Some(passkey_id) = passkey_id {
            inner.device_passkey_approvals.insert(
                device.device_id.clone(),
                DevicePasskeyApproval {
                    approved_at: now_iso(),
                    approved_by_device_id: Some(approver_device.device_id.clone()),
                    approved_by_passkey_id: passkey_id,
                    device_id: device.device_id.clone(),
                    user_id: id.clone(),
                },
            );
        }
        if let Some(p) = inner.device_enrollments.get_mut(&request_id) {
            p.status = DeviceEnrollmentStatus::Approved;
            p.approved_device_id = Some(device.device_id.clone());
            p.resolved_at = Some(Utc::now());
        }
        (device, "approved")
    };
    notify_user(
        &state,
        &id,
        "deviceRequest",
        Some(serde_json::json!({ "requestID": request_id, "status": notify_status })),
        None,
    )
    .await;
    msgpack_response(&device)
}

async fn device_request_reject(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, request_id)): Path<(String, String)>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(device)) = (auth.user, auth.device) else {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "Reject requires an authenticated existing device.",
        );
    };
    if user.user_id != id || device.owner != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let result = reject_device_request_locked_response(&state, &id, &request_id).await;
    result
}

async fn pending_device_passkey_register_begin(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Path(request_id): Path<String>,
    body: Bytes,
) -> Response {
    let Ok(payload) = decode_wire::<PendingDevicePasskeyRegistrationStartPayload>(&headers, &body)
    else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid registration payload");
    };
    if payload.name.is_empty() || payload.name.len() > 255 {
        return json_error(StatusCode::BAD_REQUEST, "Invalid registration payload");
    }
    let Some(webauthn) = state.webauthn.as_ref() else {
        return passkeys_not_configured();
    };
    let (user_id, username, existing_credentials) = {
        let inner = state.inner.lock().await;
        let Ok(pending) = verified_pending_request_locked(&inner, &request_id, &payload.signed)
        else {
            return pending_signature_error_response(&inner, &request_id);
        };
        if pending.status != DeviceEnrollmentStatus::Approved
            || pending.approved_device_id.is_none()
        {
            return json_error(
                StatusCode::CONFLICT,
                "Device approval must complete before passkey setup.",
            );
        }
        let Some(user) = inner.users.get(&pending.user_id).cloned() else {
            return StatusCode::NOT_FOUND.into_response();
        };
        let existing = inner
            .passkeys
            .values()
            .filter(|p| p.user_id == pending.user_id)
            .map(|p| p.credential.cred_id().clone())
            .collect::<Vec<_>>();
        if existing.len() >= MAX_PASSKEYS_PER_USER {
            return json_error(
                StatusCode::CONFLICT,
                &format!("Each account is limited to {MAX_PASSKEYS_PER_USER} passkeys."),
            );
        }
        (pending.user_id, user.username, existing)
    };
    let Ok(user_uuid) = Uuid::parse_str(&user_id) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid user ID.");
    };
    let Ok((challenge, registration_state)) = webauthn.start_passkey_registration(
        user_uuid,
        &username,
        &username,
        Some(existing_credentials),
    ) else {
        return json_error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not start passkey registration.",
        );
    };
    {
        let mut inner = state.inner.lock().await;
        if let Some(pending) = inner.device_enrollments.get_mut(&request_id) {
            pending.passkey_registration = Some(PendingDevicePasskeyRegistration {
                created_at: Utc::now(),
                name: payload.name,
                state: registration_state,
            });
        }
    }
    let Some(options) = webauthn_creation_options_value(challenge) else {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    };
    wire_response(
        &query,
        &serde_json::json!({ "options": options, "requestID": request_id }),
    )
}

async fn pending_device_passkey_register_finish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Path(request_id): Path<String>,
    body: Bytes,
) -> Response {
    let Ok(payload) = decode_wire::<PendingDevicePasskeyRegistrationFinishPayload>(&headers, &body)
    else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid finish payload");
    };
    if payload.request_id != request_id {
        return json_error(StatusCode::BAD_REQUEST, "Request ID mismatch.");
    }
    if payload.name.is_empty() || payload.name.len() > 255 {
        return json_error(StatusCode::BAD_REQUEST, "Invalid finish payload");
    }
    let Some(webauthn) = state.webauthn.as_ref() else {
        return passkeys_not_configured();
    };
    let passkey_registration = {
        let mut inner = state.inner.lock().await;
        let Ok(pending) = verified_pending_request_locked(&inner, &request_id, &payload.signed)
        else {
            return pending_signature_error_response(&inner, &request_id);
        };
        if pending.status != DeviceEnrollmentStatus::Approved
            || pending.approved_device_id.is_none()
        {
            return json_error(
                StatusCode::CONFLICT,
                "Device approval must complete before passkey setup.",
            );
        }
        let Some(p) = inner.device_enrollments.get_mut(&request_id) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        p.passkey_registration.take()
    };
    let Some(passkey_registration) = passkey_registration else {
        return json_error(
            StatusCode::NOT_FOUND,
            "Passkey registration request not found or expired.",
        );
    };
    if Utc::now()
        .signed_duration_since(passkey_registration.created_at)
        .num_seconds()
        > PASSKEY_REGISTRATION_TTL_SECS
    {
        return json_error(StatusCode::GONE, "Passkey registration request expired.");
    }
    let Ok(registration_response) =
        serde_json::from_value::<RegisterPublicKeyCredential>(payload.response)
    else {
        return json_error(StatusCode::BAD_REQUEST, "Passkey attestation invalid.");
    };
    let credential = match webauthn
        .finish_passkey_registration(&registration_response, &passkey_registration.state)
    {
        Ok(credential) => credential,
        Err(err) => {
            return json_error(
                StatusCode::BAD_REQUEST,
                &format!("Passkey attestation invalid: {err}"),
            );
        }
    };
    let credential_id = webauthn_credential_id(&credential);
    let transports = passkey_transports_from_registration(&registration_response);
    let public = {
        let mut inner = state.inner.lock().await;
        let Some(pending) = inner.device_enrollments.get(&request_id).cloned() else {
            return StatusCode::NOT_FOUND.into_response();
        };
        if inner
            .passkeys
            .values()
            .any(|p| p.credential_id == credential_id)
        {
            return json_error(
                StatusCode::CONFLICT,
                "This authenticator is already registered.",
            );
        }
        if inner
            .passkeys
            .values()
            .filter(|p| p.user_id == pending.user_id)
            .count()
            >= MAX_PASSKEYS_PER_USER
        {
            return json_error(
                StatusCode::CONFLICT,
                &format!("Each account is limited to {MAX_PASSKEYS_PER_USER} passkeys."),
            );
        }
        let record = create_passkey_record(
            &pending.user_id,
            passkey_registration.name,
            credential_id,
            credential,
            transports,
        );
        let public = passkey_public(&record);
        inner.passkeys.insert(record.passkey_id.clone(), record);
        public
    };
    wire_response(&query, &public)
}

async fn passkey_user_devices(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Path(id): Path<String>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id || auth.passkey_id.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    let devices: Vec<Device> = inner
        .devices
        .values()
        .filter(|d| !d.deleted && d.owner == id)
        .cloned()
        .collect();
    wire_response(&query, &devices)
}

async fn passkey_user_device_delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, device_id)): Path<(String, String)>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id || auth.passkey_id.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let mut inner = state.inner.lock().await;
    let Some(device) = inner.devices.get(&device_id).cloned() else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if device.owner != id {
        return StatusCode::NOT_FOUND.into_response();
    }
    delete_device_locked(&mut inner, &device_id);
    drop(inner);
    notify_user(&state, &id, "deviceListChanged", None, None).await;
    StatusCode::OK.into_response()
}

async fn passkey_recover_device_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
    Path((id, request_id)): Path<(String, String)>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Some(passkey_id) = auth.passkey_id else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let (device, revoked_ids) = {
        let mut inner = state.inner.lock().await;
        prune_device_enrollments_locked(&mut inner);
        let Some(pending) = inner.device_enrollments.get(&request_id).cloned() else {
            return StatusCode::NOT_FOUND.into_response();
        };
        if pending.user_id != id {
            return StatusCode::NOT_FOUND.into_response();
        }
        if pending.status != DeviceEnrollmentStatus::Pending {
            return json_error(StatusCode::CONFLICT, "Request is not pending.");
        }
        if device_request_expired(&pending) {
            expire_device_request_locked(&mut inner, &request_id);
            return json_error(StatusCode::GONE, "Request expired.");
        }
        let revoked_ids = inner
            .devices
            .values()
            .filter(|d| !d.deleted && d.owner == id)
            .map(|d| d.device_id.clone())
            .collect::<Vec<_>>();
        for revoked in &revoked_ids {
            delete_device_locked(&mut inner, revoked);
        }
        let device = create_device_locked(&mut inner, &id, &pending.device_payload);
        inner.device_passkey_approvals.insert(
            device.device_id.clone(),
            DevicePasskeyApproval {
                approved_at: now_iso(),
                approved_by_device_id: None,
                approved_by_passkey_id: passkey_id,
                device_id: device.device_id.clone(),
                user_id: id.clone(),
            },
        );
        if let Some(p) = inner.device_enrollments.get_mut(&request_id) {
            p.status = DeviceEnrollmentStatus::Approved;
            p.approved_device_id = Some(device.device_id.clone());
            p.resolved_at = Some(Utc::now());
        }
        (device, revoked_ids)
    };
    notify_user(
        &state,
        &id,
        "deviceRequest",
        Some(serde_json::json!({ "requestID": request_id, "status": "approved" })),
        None,
    )
    .await;
    notify_user(&state, &id, "deviceListChanged", None, None).await;
    disconnect_devices(&state, &revoked_ids).await;
    wire_response(&query, &device)
}

async fn passkey_reject_device_request(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, request_id)): Path<(String, String)>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(user) = auth.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if user.user_id != id || auth.passkey_id.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    reject_device_request_locked_response(&state, &id, &request_id).await
}

async fn file_json(State(state): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "upload",
        None,
        UPLOAD_RATE_LIMIT,
        UPLOAD_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let auth = auth_context(&state, &headers).await;
    let Some(device) = auth.device else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<FilePayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid file payload");
    };
    let Some(file_b64) = payload.file else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let Ok(bytes) = general_purpose::STANDARD.decode(file_b64.as_bytes()) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    save_file_payload(&state, &device.device_id, payload.nonce, bytes).await
}

async fn file_multipart(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "upload",
        None,
        UPLOAD_RATE_LIMIT,
        UPLOAD_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let auth = auth_context(&state, &headers).await;
    let Some(device) = auth.device else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let mut nonce = None;
    let mut file = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "nonce" {
            nonce = field.text().await.ok();
        } else if name == "file" {
            file = field.bytes().await.ok().map(|b| b.to_vec());
        }
    }
    let (Some(nonce), Some(file)) = (nonce, file) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    save_file_payload(&state, &device.device_id, nonce, file).await
}

async fn file_details(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    match inner.files.get(&id) {
        Some(file) => msgpack_response(file),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn file_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let exists = {
        let inner = state.inner.lock().await;
        inner.files.contains_key(&id)
    };
    if !exists {
        return StatusCode::NOT_FOUND.into_response();
    }
    let path = state.data_dir.join("files").join(&id);
    match tokio::fs::read(path).await {
        Ok(bytes) => bytes.into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn avatar_json(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_user_id): Path<String>,
    body: Bytes,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "upload",
        None,
        UPLOAD_RATE_LIMIT,
        UPLOAD_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(_device)) = (auth.user, auth.device) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<AvatarJsonPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid avatar payload");
    };
    let Ok(bytes) = general_purpose::STANDARD.decode(payload.file.as_bytes()) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    write_named_file(&state, "avatars", &user.user_id, bytes).await
}

async fn avatar_multipart(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(_user_id): Path<String>,
    mut multipart: Multipart,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "upload",
        None,
        UPLOAD_RATE_LIMIT,
        UPLOAD_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(_device)) = (auth.user, auth.device) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let mut file = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        if field.name().unwrap_or("") == "avatar" {
            file = field.bytes().await.ok().map(|b| b.to_vec());
        }
    }
    let Some(bytes) = file else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    write_named_file(&state, "avatars", &user.user_id, bytes).await
}

async fn avatar_get(State(state): State<AppState>, Path(user_id): Path<String>) -> Response {
    read_named_file(&state, "avatars", &user_id).await
}

async fn emoji_json(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(server_id): Path<String>,
    body: Bytes,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "upload",
        None,
        UPLOAD_RATE_LIMIT,
        UPLOAD_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let Ok(payload) = decode_msgpack::<EmojiPayload>(&body) else {
        return json_error(StatusCode::BAD_REQUEST, "Invalid emoji payload");
    };
    let Some(file_b64) = payload.file else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    let Ok(bytes) = general_purpose::STANDARD.decode(file_b64.as_bytes()) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    create_emoji_payload(&state, &user.user_id, &server_id, payload.name, bytes).await
}

async fn emoji_multipart(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(server_id): Path<String>,
    mut multipart: Multipart,
) -> Response {
    if let Some(resp) = enforce_rate_limit(
        &state,
        &headers,
        "upload",
        None,
        UPLOAD_RATE_LIMIT,
        UPLOAD_RATE_WINDOW,
    )
    .await
    {
        return resp;
    }
    let Some(user) = auth_context(&state, &headers).await.user else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    let mut name = None;
    let mut file = None;
    while let Ok(Some(field)) = multipart.next_field().await {
        let field_name = field.name().unwrap_or("").to_string();
        if field_name == "name" {
            name = field.text().await.ok();
        } else if field_name == "emoji" {
            file = field.bytes().await.ok().map(|b| b.to_vec());
        }
    }
    let (Some(name), Some(file)) = (name, file) else {
        return StatusCode::BAD_REQUEST.into_response();
    };
    create_emoji_payload(&state, &user.user_id, &server_id, name, file).await
}

async fn emoji_list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(server_id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    let emojis: Vec<Emoji> = inner
        .emojis
        .values()
        .filter(|e| e.owner == server_id)
        .cloned()
        .collect();
    msgpack_response(&emojis)
}

async fn emoji_details(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(emoji_id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    let inner = state.inner.lock().await;
    match inner.emojis.get(&emoji_id) {
        Some(emoji) => msgpack_response(emoji),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn emoji_get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(emoji_id): Path<String>,
) -> Response {
    if auth_context(&state, &headers).await.user.is_none() {
        return StatusCode::UNAUTHORIZED.into_response();
    }
    read_named_file(&state, "emoji", &emoji_id).await
}

async fn notification_subscribe(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(payload): Json<NotificationSubscribePayload>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let (Some(user), Some(device)) = (auth.user, auth.device) else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if device.device_id != id {
        return StatusCode::FORBIDDEN.into_response();
    }
    let now = now_iso();
    let sub = NotificationSubscription {
        channel: payload.channel,
        created_at: now.clone(),
        device_id: device.device_id,
        enabled: true,
        events: payload.events.unwrap_or_else(|| vec!["mail".to_string()]),
        platform: payload.platform,
        subscription_id: Uuid::new_v4().to_string(),
        token: payload.token,
        updated_at: now,
        user_id: user.user_id,
    };
    let mut inner = state.inner.lock().await;
    inner
        .notification_subscriptions
        .insert(sub.subscription_id.clone(), sub.clone());
    (StatusCode::CREATED, Json(sub)).into_response()
}

async fn notification_unsubscribe(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((id, subscription_id)): Path<(String, String)>,
) -> Response {
    let auth = auth_context(&state, &headers).await;
    let Some(device) = auth.device else {
        return StatusCode::UNAUTHORIZED.into_response();
    };
    if device.device_id != id {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut inner = state.inner.lock().await;
    if inner
        .notification_subscriptions
        .remove(&subscription_id)
        .is_some()
    {
        StatusCode::NO_CONTENT.into_response()
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

async fn ws_handler(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.max_message_size(4096)
        .on_upgrade(move |socket| websocket_session(state, socket))
}

async fn websocket_session(state: AppState, mut socket: WebSocket) {
    let Some(Ok(first)) = socket.next().await else {
        return;
    };
    let auth_bytes = match first {
        Message::Text(s) => s.as_bytes().to_vec(),
        Message::Binary(b) => b.to_vec(),
        _ => return,
    };
    let Ok(auth) = serde_json::from_slice::<WsAuth>(&auth_bytes) else {
        let _ = socket
            .send(Message::Binary(
                pack_ws(&WsBase {
                    transmission_id: Uuid::new_v4().to_string(),
                    kind: "unauthorized",
                })
                .into(),
            ))
            .await;
        return;
    };
    if auth.kind != "auth" {
        return;
    }
    let Some(user) = decode_user_token(&state, &auth.token).map(|c| c.user) else {
        let _ = socket
            .send(Message::Binary(
                pack_ws(&WsBase {
                    transmission_id: Uuid::new_v4().to_string(),
                    kind: "unauthorized",
                })
                .into(),
            ))
            .await;
        return;
    };

    let (mut sender, mut receiver) = socket.split();
    let challenge = random_bytes(16);
    let challenge_msg = WsChallenge {
        challenge: ByteBuf::from(challenge.clone()),
        transmission_id: Uuid::new_v4().to_string(),
        kind: "challenge",
    };
    if sender
        .send(Message::Binary(pack_ws(&challenge_msg).into()))
        .await
        .is_err()
    {
        return;
    }

    let (tx, mut rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let writer = tokio::spawn(async move {
        while let Some(bytes) = rx.recv().await {
            if sender.send(Message::Binary(bytes.into())).await.is_err() {
                break;
            }
        }
    });

    let mut authed_device: Option<Device> = None;
    while let Some(Ok(msg)) = receiver.next().await {
        let Message::Binary(bytes) = msg else {
            continue;
        };
        let Some((header, incoming)) = unpack_ws(&bytes) else {
            continue;
        };
        match incoming.kind.as_str() {
            "response" => {
                let Some(signed) = incoming.signed else {
                    continue;
                };
                let devices: Vec<Device> = {
                    let inner = state.inner.lock().await;
                    inner
                        .devices
                        .values()
                        .filter(|d| !d.deleted && d.owner == user.user_id)
                        .cloned()
                        .collect()
                };
                let mut matched = None;
                for device in devices {
                    let Ok(public_key) = hex::decode(&device.sign_key) else {
                        continue;
                    };
                    if open_signed_message(signed.as_ref(), &public_key)
                        .map(|opened| opened == challenge)
                        .unwrap_or(false)
                    {
                        matched = Some(device);
                        break;
                    }
                }
                let Some(device) = matched else {
                    let _ = tx.send(pack_ws(&WsError {
                        data: Some(serde_json::json!(0)),
                        error: "0".to_string(),
                        transmission_id: Uuid::new_v4().to_string(),
                        kind: "error",
                    }));
                    break;
                };
                authed_device = Some(device.clone());
                {
                    let mut inner = state.inner.lock().await;
                    inner.clients.push(ConnectedClient {
                        device_id: device.device_id.clone(),
                        tx: tx.clone(),
                        user_id: user.user_id.clone(),
                    });
                }
                let _ = tx.send(pack_ws(&WsBase {
                    transmission_id: incoming.transmission_id,
                    kind: "authorized",
                }));
            }
            "ping" => {
                let _ = tx.send(pack_ws(&WsBase {
                    transmission_id: incoming.transmission_id,
                    kind: "pong",
                }));
            }
            "pong" => {}
            "receipt" => {
                let Some(device) = &authed_device else {
                    let _ = tx.send(pack_ws(&WsError {
                        data: None,
                        error: "You are not authenticated.".to_string(),
                        transmission_id: incoming.transmission_id,
                        kind: "error",
                    }));
                    continue;
                };
                let Some(nonce) = incoming.nonce else {
                    let _ = tx.send(pack_ws(&WsError {
                        data: None,
                        error: "Receipt nonce is required.".to_string(),
                        transmission_id: incoming.transmission_id,
                        kind: "error",
                    }));
                    continue;
                };
                let mut inner = state.inner.lock().await;
                inner.mail.retain(|m| {
                    !(m.mail.recipient == device.device_id
                        && m.mail.nonce.as_ref() == nonce.as_ref())
                });
            }
            "resource" => {
                let Some(device) = &authed_device else {
                    let _ = tx.send(pack_ws(&WsError {
                        data: None,
                        error: "You are not authenticated.".to_string(),
                        transmission_id: incoming.transmission_id,
                        kind: "error",
                    }));
                    continue;
                };
                if incoming.resource_type.as_deref() == Some("mail")
                    && incoming.action.as_deref() == Some("CREATE")
                {
                    if let Some(mail) = incoming.data {
                        match save_mail_and_notify(
                            &state,
                            &user.user_id,
                            &device.device_id,
                            header,
                            mail,
                        )
                        .await
                        {
                            Ok(()) => {
                                let _ = tx.send(pack_ws(&WsSuccess {
                                    data: None,
                                    transmission_id: incoming.transmission_id,
                                    kind: "success",
                                }));
                            }
                            Err((_status, msg)) => {
                                let _ = tx.send(pack_ws(&WsError {
                                    data: None,
                                    error: msg,
                                    transmission_id: incoming.transmission_id,
                                    kind: "error",
                                }));
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    if let Some(device) = authed_device {
        let mut inner = state.inner.lock().await;
        inner
            .clients
            .retain(|c| c.device_id != device.device_id || c.user_id != user.user_id);
    }
    writer.abort();
}

async fn save_mail_and_notify(
    state: &AppState,
    user_id: &str,
    sender_device_id: &str,
    header: Vec<u8>,
    mail: MailWire,
) -> Result<(), (StatusCode, String)> {
    if mail.sender != sender_device_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Mail sender does not match the authenticated device.".to_string(),
        ));
    }
    if mail.author_id != user_id {
        return Err((
            StatusCode::FORBIDDEN,
            "Mail author does not match the authenticated user.".to_string(),
        ));
    }
    let timestamp = now_iso();
    let (recipient_owner, clients) = {
        let mut inner = state.inner.lock().await;
        let Some(recipient) = retrieve_device_locked(&inner, &mail.recipient) else {
            return Err((
                StatusCode::BAD_REQUEST,
                "No associated user record found for recipient device.".to_string(),
            ));
        };
        if mail.reader_id != recipient.owner {
            return Err((
                StatusCode::BAD_REQUEST,
                "Mail reader does not match the recipient device owner.".to_string(),
            ));
        }
        inner.mail.push(MailRow {
            header: header.clone(),
            mail: mail.clone(),
            time: timestamp.clone(),
        });
        let clients = inner
            .clients
            .iter()
            .filter(|c| c.user_id == recipient.owner && c.device_id == mail.recipient)
            .cloned()
            .collect::<Vec<_>>();
        (recipient.owner, clients)
    };
    let notify = pack_ws(&WsNotify {
        data: Some((ByteBuf::from(header), mail.clone(), timestamp)),
        event: "mail".to_string(),
        transmission_id: Uuid::new_v4().to_string(),
        kind: "notify",
    });
    for client in clients {
        let _ = client.tx.send(notify.clone());
    }
    let _ = recipient_owner;
    Ok(())
}

async fn save_file_payload(
    state: &AppState,
    owner_device_id: &str,
    nonce: String,
    bytes: Vec<u8>,
) -> Response {
    if nonce.is_empty() {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let file = FileSql {
        file_id: Uuid::new_v4().to_string(),
        nonce,
        owner: owner_device_id.to_string(),
    };
    let path = state.data_dir.join("files").join(&file.file_id);
    if tokio::fs::write(path, bytes).await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    let mut inner = state.inner.lock().await;
    inner.files.insert(file.file_id.clone(), file.clone());
    msgpack_response(&file)
}

async fn write_named_file(state: &AppState, dir: &str, name: &str, bytes: Vec<u8>) -> Response {
    let path = state.data_dir.join(dir).join(name);
    match tokio::fs::write(path, bytes).await {
        Ok(()) => StatusCode::OK.into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn read_named_file(state: &AppState, dir: &str, name: &str) -> Response {
    let path = state.data_dir.join(dir).join(name);
    match tokio::fs::read(path).await {
        Ok(bytes) => bytes.into_response(),
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn create_emoji_payload(
    state: &AppState,
    user_id: &str,
    server_id: &str,
    name: String,
    bytes: Vec<u8>,
) -> Response {
    {
        let inner = state.inner.lock().await;
        if !inner.servers.contains_key(server_id) {
            return StatusCode::NOT_FOUND.into_response();
        }
        if !has_permission(&inner, user_id, server_id, 25) {
            return StatusCode::UNAUTHORIZED.into_response();
        }
    }
    let emoji = Emoji {
        emoji_id: Uuid::new_v4().to_string(),
        name,
        owner: server_id.to_string(),
    };
    let path = state.data_dir.join("emoji").join(&emoji.emoji_id);
    if tokio::fs::write(path, bytes).await.is_err() {
        return StatusCode::INTERNAL_SERVER_ERROR.into_response();
    }
    let mut inner = state.inner.lock().await;
    inner.emojis.insert(emoji.emoji_id.clone(), emoji.clone());
    msgpack_response(&emoji)
}

fn build_webauthn_from_env() -> Option<Webauthn> {
    let rp_id = env::var("SPIRE_PASSKEY_RP_ID")
        .ok()
        .map(|s| normalize_env_value(&s))
        .filter(|s| !s.is_empty())?;
    let origins = parse_env_list("SPIRE_PASSKEY_ORIGINS");
    let first_origin = origins.first()?;
    let rp_origin = Url::parse(first_origin).ok()?;
    let rp_name = env::var("SPIRE_PASSKEY_RP_NAME")
        .ok()
        .map(|s| normalize_env_value(&s))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "Vex".to_string());
    let mut builder = WebauthnBuilder::new(&rp_id, &rp_origin)
        .ok()?
        .rp_name(Box::leak(rp_name.into_boxed_str()));
    for origin in origins.iter().skip(1) {
        if let Ok(url) = Url::parse(origin) {
            builder = builder.append_allowed_origin(&url);
        }
    }
    for origin in android_apk_key_hash_origins() {
        if let Ok(url) = Url::parse(&origin) {
            builder = builder.append_allowed_origin(&url);
        }
    }
    builder.build().ok()
}

fn passkeys_not_configured() -> Response {
    json_error(
        StatusCode::INTERNAL_SERVER_ERROR,
        "Passkeys are not configured",
    )
}

fn parse_env_list(name: &str) -> Vec<String> {
    env::var(name)
        .ok()
        .map(|raw| {
            raw.split(',')
                .map(|s| normalize_env_value(s).trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn normalized_android_fingerprints() -> Vec<String> {
    parse_env_list("SPIRE_PASSKEY_ANDROID_FINGERPRINTS")
        .into_iter()
        .filter_map(|raw| normalize_fingerprint(&raw))
        .collect()
}

fn android_apk_key_hash_origins() -> Vec<String> {
    normalized_android_fingerprints()
        .into_iter()
        .filter_map(|fingerprint| hex::decode(fingerprint.replace(':', "")).ok())
        .map(|bytes| {
            format!(
                "android:apk-key-hash:{}",
                general_purpose::URL_SAFE_NO_PAD.encode(bytes)
            )
        })
        .collect()
}

fn normalize_fingerprint(raw: &str) -> Option<String> {
    let compact = raw.replace(':', "");
    if compact.len() != 64 || !compact.as_bytes().iter().all(|b| b.is_ascii_hexdigit()) {
        return None;
    }
    let upper = compact.to_ascii_uppercase();
    let pairs = upper
        .as_bytes()
        .chunks(2)
        .filter_map(|chunk| std::str::from_utf8(chunk).ok())
        .collect::<Vec<_>>();
    Some(pairs.join(":"))
}

fn extract_cli_passkey_page() -> Option<String> {
    let marker = "const CLI_PASSKEY_PAGE = `";
    let start = CLI_PASSKEY_PAGE_TS.find(marker)? + marker.len();
    let rest = &CLI_PASSKEY_PAGE_TS[start..];
    let end = rest.find("`;\n\nexport const getCliPasskeyPageRouter")?;
    Some(rest[..end].replace("\\\\", "\\"))
}

fn decode_wire<T: DeserializeOwned>(headers: &HeaderMap, body: &[u8]) -> Result<T, String> {
    let content_type = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    if content_type.contains("application/json") {
        serde_json::from_slice(body).map_err(|e| e.to_string())
    } else {
        rmp_serde::from_slice(body).map_err(|e| e.to_string())
    }
}

fn wire_response<T: Serialize>(query: &HashMap<String, String>, value: &T) -> Response {
    if query.get("format").map(|v| v == "json").unwrap_or(false) {
        Json(value).into_response()
    } else {
        msgpack_response(value)
    }
}

fn msgpack_response_status<T: Serialize>(status: StatusCode, value: &T) -> Response {
    match rmp_serde::to_vec_named(value) {
        Ok(bytes) => (
            status,
            [(header::CONTENT_TYPE, "application/msgpack")],
            bytes,
        )
            .into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

fn webauthn_creation_options_value<T: Serialize>(challenge: T) -> Option<serde_json::Value> {
    let value = serde_json::to_value(challenge).ok()?;
    value
        .get("publicKey")
        .or_else(|| value.get("public_key"))
        .cloned()
        .or(Some(value))
}

fn webauthn_request_options_value<T: Serialize>(challenge: T) -> Option<serde_json::Value> {
    webauthn_creation_options_value(challenge)
}

fn passkey_public(record: &PasskeyRecord) -> PasskeyPublic {
    PasskeyPublic {
        created_at: record.created_at.clone(),
        last_used_at: record.last_used_at.clone(),
        name: record.name.clone(),
        passkey_id: record.passkey_id.clone(),
        transports: record.transports.clone(),
        user_id: record.user_id.clone(),
    }
}

fn webauthn_credential_id(credential: &WebauthnPasskey) -> String {
    match serde_json::to_value(credential.cred_id()) {
        Ok(serde_json::Value::String(s)) => s,
        _ => format!("{:?}", credential.cred_id()),
    }
}

fn passkey_transports_from_registration(response: &RegisterPublicKeyCredential) -> Vec<String> {
    serde_json::to_value(response)
        .ok()
        .and_then(|value| {
            value
                .get("response")
                .and_then(|r| r.get("transports"))
                .and_then(|t| t.as_array())
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.as_str().map(str::to_string))
                        .filter(|s| is_known_transport(s))
                        .collect::<Vec<_>>()
                })
        })
        .unwrap_or_default()
}

fn is_known_transport(s: &str) -> bool {
    matches!(
        s,
        "ble" | "cable" | "hybrid" | "internal" | "nfc" | "smart-card" | "usb"
    )
}

fn create_passkey_record(
    user_id: &str,
    name: String,
    credential_id: String,
    credential: WebauthnPasskey,
    transports: Vec<String>,
) -> PasskeyRecord {
    PasskeyRecord {
        created_at: now_iso(),
        credential,
        credential_id,
        last_used_at: None,
        name,
        passkey_id: Uuid::new_v4().to_string(),
        transports,
        user_id: user_id.to_string(),
    }
}

fn passkey_second_factor_error(
    inner: &Inner,
    user_id: &str,
    passkey_id: Option<&str>,
    mismatch_error: &str,
) -> Option<String> {
    let has_passkeys = inner.passkeys.values().any(|p| p.user_id == user_id);
    if !has_passkeys {
        return None;
    }
    let Some(passkey_id) = passkey_id else {
        return Some("Passkey verification required.".to_string());
    };
    match inner.passkeys.get(passkey_id) {
        Some(passkey) if passkey.user_id == user_id => None,
        _ => Some(mismatch_error.to_string()),
    }
}

fn create_pending_device_enrollment_locked(
    inner: &mut Inner,
    user_id: &str,
    device_payload: DevicePayload,
    defer_owner_notification: bool,
    requester_passkey_id: Option<String>,
) -> PendingDeviceRegistrationResponse {
    prune_device_enrollments_locked(inner);
    let request_id = Uuid::new_v4().to_string();
    let challenge_hex = random_hex(32);
    let created_at = Utc::now();
    let pending = DeviceEnrollmentRequest {
        approved_device_id: None,
        challenge_hex: challenge_hex.clone(),
        created_at,
        device_payload,
        error: None,
        owner_notified: !defer_owner_notification,
        passkey_registration: None,
        requester_passkey_id,
        request_id: request_id.clone(),
        resolved_at: None,
        status: DeviceEnrollmentStatus::Pending,
        user_id: user_id.to_string(),
    };
    inner.device_enrollments.insert(request_id.clone(), pending);
    PendingDeviceRegistrationResponse {
        challenge: challenge_hex,
        expires_at: (created_at + chrono::Duration::seconds(DEVICE_REQUEST_TTL_SECS))
            .to_rfc3339_opts(SecondsFormat::Millis, true),
        request_id,
        status: "pending_approval",
        user_id: user_id.to_string(),
    }
}

fn prune_device_enrollments_locked(inner: &mut Inner) {
    let now = Utc::now();
    let mut to_delete = Vec::new();
    for (request_id, req) in inner.device_enrollments.iter_mut() {
        if req.status == DeviceEnrollmentStatus::Pending
            && now.signed_duration_since(req.created_at).num_seconds() > DEVICE_REQUEST_TTL_SECS
        {
            req.status = DeviceEnrollmentStatus::Expired;
            req.resolved_at = Some(now);
            req.error = Some("Request expired.".to_string());
        }
        if req.status != DeviceEnrollmentStatus::Pending {
            if let Some(resolved_at) = req.resolved_at {
                if now.signed_duration_since(resolved_at).num_seconds() > RESOLVED_REQUEST_TTL_SECS
                {
                    to_delete.push(request_id.clone());
                }
            }
        }
    }
    for request_id in to_delete {
        inner.device_enrollments.remove(&request_id);
    }
}

fn prune_passkey_ceremonies_locked(inner: &mut Inner) {
    let now = Utc::now();
    inner.pending_passkey_registrations.retain(|_, pending| {
        now.signed_duration_since(pending.created_at).num_seconds() <= PASSKEY_REGISTRATION_TTL_SECS
    });
    inner.pending_passkey_authentications.retain(|_, pending| {
        now.signed_duration_since(pending.created_at).num_seconds() <= PASSKEY_REGISTRATION_TTL_SECS
    });
}

fn device_request_summary(req: &DeviceEnrollmentRequest) -> PendingDeviceRequestSummary {
    PendingDeviceRequestSummary {
        approved_device_id: req.approved_device_id.clone(),
        created_at: req.created_at.to_rfc3339_opts(SecondsFormat::Millis, true),
        device_name: req.device_payload.device_name.clone(),
        error: req.error.clone(),
        expires_at: (req.created_at + chrono::Duration::seconds(DEVICE_REQUEST_TTL_SECS))
            .to_rfc3339_opts(SecondsFormat::Millis, true),
        request_id: req.request_id.clone(),
        sign_key: req.device_payload.sign_key.clone(),
        status: req.status.as_str(),
        username: req.device_payload.username.clone(),
    }
}

fn device_request_expired(req: &DeviceEnrollmentRequest) -> bool {
    Utc::now()
        .signed_duration_since(req.created_at)
        .num_seconds()
        > DEVICE_REQUEST_TTL_SECS
}

fn expire_device_request_locked(inner: &mut Inner, request_id: &str) {
    if let Some(pending) = inner.device_enrollments.get_mut(request_id) {
        pending.status = DeviceEnrollmentStatus::Expired;
        pending.resolved_at = Some(Utc::now());
        pending.error = Some("Request expired.".to_string());
    }
}

#[derive(Debug)]
enum PendingRequestError {
    InvalidSignature,
    Missing,
}

fn verified_pending_request_summary_locked(
    inner: &Inner,
    request_id: &str,
    signed_hex: &str,
) -> Result<PendingDeviceRequestSummary, PendingRequestError> {
    verified_pending_request_locked(inner, request_id, signed_hex)
        .map(|req| device_request_summary(&req))
}

fn verified_pending_request_locked(
    inner: &Inner,
    request_id: &str,
    signed_hex: &str,
) -> Result<DeviceEnrollmentRequest, PendingRequestError> {
    let Some(pending) = inner.device_enrollments.get(request_id).cloned() else {
        return Err(PendingRequestError::Missing);
    };
    let signed = hex::decode(signed_hex).map_err(|_| PendingRequestError::InvalidSignature)?;
    let public_key = hex::decode(&pending.device_payload.sign_key)
        .map_err(|_| PendingRequestError::InvalidSignature)?;
    let Some(opened) = open_signed_message(&signed, &public_key) else {
        return Err(PendingRequestError::InvalidSignature);
    };
    let expected =
        hex::decode(&pending.challenge_hex).map_err(|_| PendingRequestError::InvalidSignature)?;
    if opened != expected {
        return Err(PendingRequestError::InvalidSignature);
    }
    Ok(pending)
}

fn pending_signature_error_response(inner: &Inner, request_id: &str) -> Response {
    if inner.device_enrollments.contains_key(request_id) {
        json_error(StatusCode::UNAUTHORIZED, "Poll signature invalid.")
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

fn validate_pending_approval_locked(
    inner: &Inner,
    pending: &DeviceEnrollmentRequest,
    approver_device: &Device,
    signed_hex: &str,
    approval_passkey_id: Option<&str>,
) -> Option<(StatusCode, String)> {
    if pending.status != DeviceEnrollmentStatus::Pending {
        return Some((StatusCode::CONFLICT, "Request is not pending.".to_string()));
    }
    if device_request_expired(pending) {
        return Some((StatusCode::GONE, "Request expired.".to_string()));
    }
    if approver_device.sign_key == pending.device_payload.sign_key {
        return Some((
            StatusCode::BAD_REQUEST,
            "Cannot self-approve with the requesting device key.".to_string(),
        ));
    }
    let approved_by_passkey = pending
        .requester_passkey_id
        .as_deref()
        .or(approval_passkey_id);
    if let Some(err) = passkey_second_factor_error(
        inner,
        &pending.user_id,
        approved_by_passkey,
        "Passkey verification does not match this account.",
    ) {
        return Some((StatusCode::FORBIDDEN, err));
    }
    let signed = match hex::decode(signed_hex) {
        Ok(signed) => signed,
        Err(_) => {
            return Some((
                StatusCode::UNAUTHORIZED,
                "Approval signature invalid.".to_string(),
            ));
        }
    };
    let public_key = match hex::decode(&approver_device.sign_key) {
        Ok(public_key) => public_key,
        Err(_) => {
            return Some((
                StatusCode::UNAUTHORIZED,
                "Approval signature invalid.".to_string(),
            ));
        }
    };
    let Some(opened) = open_signed_message(&signed, &public_key) else {
        return Some((
            StatusCode::UNAUTHORIZED,
            "Approval signature invalid.".to_string(),
        ));
    };
    let expected = format!(
        "{}:{}",
        pending.request_id,
        pending.device_payload.sign_key.to_ascii_lowercase()
    );
    if opened != expected.as_bytes() {
        return Some((
            StatusCode::UNAUTHORIZED,
            "Approval challenge mismatch.".to_string(),
        ));
    }
    None
}

async fn reject_device_request_locked_response(
    state: &AppState,
    user_id: &str,
    request_id: &str,
) -> Response {
    {
        let mut inner = state.inner.lock().await;
        prune_device_enrollments_locked(&mut inner);
        let Some(pending) = inner.device_enrollments.get_mut(request_id) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        if pending.user_id != user_id {
            return StatusCode::NOT_FOUND.into_response();
        }
        if pending.status != DeviceEnrollmentStatus::Pending {
            return json_error(StatusCode::CONFLICT, "Request is not pending.");
        }
        pending.status = DeviceEnrollmentStatus::Rejected;
        pending.resolved_at = Some(Utc::now());
        pending.error = Some("Rejected by existing device.".to_string());
    }
    notify_user(
        state,
        user_id,
        "deviceRequest",
        Some(serde_json::json!({ "requestID": request_id, "status": "rejected" })),
        None,
    )
    .await;
    StatusCode::OK.into_response()
}

async fn notify_user(
    state: &AppState,
    user_id: &str,
    event: &str,
    data: Option<serde_json::Value>,
    device_id: Option<&str>,
) {
    let clients = {
        let inner = state.inner.lock().await;
        inner
            .clients
            .iter()
            .filter(|c| c.user_id == user_id)
            .filter(|c| device_id.map(|id| c.device_id == id).unwrap_or(true))
            .cloned()
            .collect::<Vec<_>>()
    };
    let payload = pack_ws(&WsNotify {
        data,
        event: event.to_string(),
        transmission_id: Uuid::new_v4().to_string(),
        kind: "notify",
    });
    for client in clients {
        let _ = client.tx.send(payload.clone());
    }
}

async fn disconnect_devices(state: &AppState, device_ids: &[String]) {
    let mut inner = state.inner.lock().await;
    inner
        .clients
        .retain(|client| !device_ids.iter().any(|id| id == &client.device_id));
}

fn delete_device_locked(inner: &mut Inner, device_id: &str) {
    if let Some(device) = inner.devices.get_mut(device_id) {
        device.deleted = true;
        inner.signkey_to_device_id.remove(&device.sign_key);
    }
    inner.prekeys.remove(device_id);
    inner.otks.remove(device_id);
    inner
        .notification_subscriptions
        .retain(|_, sub| sub.device_id != device_id);
    inner.device_passkey_approvals.remove(device_id);
}

async fn auth_context(state: &AppState, headers: &HeaderMap) -> AuthContext {
    {
        let mut inner = state.inner.lock().await;
        inner.requests_total = inner.requests_total.saturating_add(1);
    }
    let mut ctx = AuthContext::default();
    if let Some(token) = bearer_token(headers) {
        if let Some(claims) = decode_passkey_token(state, token) {
            if claims.scope == "passkey" {
                ctx.exp = claims.exp;
                ctx.passkey_id = Some(claims.passkey.passkey_id);
                ctx.user = Some(claims.user);
            }
        } else if let Some(claims) = decode_user_token(state, token) {
            ctx.exp = claims.exp;
            ctx.user = Some(claims.user);
        }
    }
    if let Some(token) = headers.get("x-device-token").and_then(|v| v.to_str().ok()) {
        if let Some(claims) = decode_device_token(state, token) {
            let inner = state.inner.lock().await;
            if let Some(current) = retrieve_device_locked(&inner, &claims.device.device_id) {
                if current.sign_key == claims.device.sign_key
                    && ctx
                        .user
                        .as_ref()
                        .map(|u| u.user_id == current.owner)
                        .unwrap_or(true)
                {
                    ctx.device = Some(current);
                }
            }
        }
    }
    ctx
}

async fn enforce_rate_limit(
    state: &AppState,
    headers: &HeaderMap,
    bucket: &str,
    explicit_key: Option<&str>,
    limit: u32,
    window: Duration,
) -> Option<Response> {
    if skips_rate_limits(state, headers) {
        return None;
    }
    let key = explicit_key
        .map(|k| k.to_string())
        .unwrap_or_else(|| client_ip_key(headers));
    let now = Instant::now();
    let mut inner = state.inner.lock().await;
    inner
        .rate_limits
        .retain(|_, entry| now.duration_since(entry.window_start) <= AUTH_RATE_WINDOW);
    let entry = inner
        .rate_limits
        .entry(format!("{bucket}:{key}"))
        .or_insert(RateLimitEntry {
            count: 0,
            window_start: now,
        });
    if now.duration_since(entry.window_start) > window {
        entry.count = 0;
        entry.window_start = now;
    }
    if entry.count >= limit {
        return Some(json_error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many requests.",
        ));
    }
    entry.count = entry.count.saturating_add(1);
    None
}

fn client_ip_key(headers: &HeaderMap) -> String {
    headers
        .get("x-real-ip")
        .and_then(|v| v.to_str().ok())
        .filter(|v| !v.trim().is_empty())
        .map(|v| v.trim().to_string())
        .or_else(|| {
            headers
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.split(',').next())
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(ToString::to_string)
        })
        .unwrap_or_else(|| "unknown".to_string())
}

fn skips_rate_limits(state: &AppState, headers: &HeaderMap) -> bool {
    state.disable_rate_limits || dev_key_matches(state, headers)
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
}

fn decode_user_token(state: &AppState, token: &str) -> Option<UserClaims> {
    decode::<UserClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .ok()
    .map(|d| d.claims)
}

fn decode_device_token(state: &AppState, token: &str) -> Option<DeviceClaims> {
    decode::<DeviceClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .ok()
    .map(|d| d.claims)
}

fn decode_passkey_token(state: &AppState, token: &str) -> Option<PasskeyClaims> {
    decode::<PasskeyClaims>(
        token,
        &DecodingKey::from_secret(state.jwt_secret.as_bytes()),
        &Validation::new(Algorithm::HS256),
    )
    .ok()
    .map(|d| d.claims)
}

fn sign_user_token(
    state: &AppState,
    user: &PublicUser,
) -> Result<String, jsonwebtoken::errors::Error> {
    encode(
        &Header::new(Algorithm::HS256),
        &UserClaims {
            exp: Some(exp_7d()),
            user: user.clone(),
        },
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
}

fn sign_device_token(
    state: &AppState,
    device: &Device,
) -> Result<String, jsonwebtoken::errors::Error> {
    encode(
        &Header::new(Algorithm::HS256),
        &DeviceClaims {
            device: device.clone(),
            exp: Some(exp_7d()),
        },
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
}

fn sign_passkey_token(
    state: &AppState,
    user: &PublicUser,
    passkey_id: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    encode(
        &Header::new(Algorithm::HS256),
        &PasskeyClaims {
            exp: Some(exp_5m()),
            passkey: PasskeyClaim {
                passkey_id: passkey_id.to_string(),
            },
            scope: "passkey".to_string(),
            user: user.clone(),
        },
        &EncodingKey::from_secret(state.jwt_secret.as_bytes()),
    )
}

async fn consume_action_token(state: &AppState, key: &str, scope: u8) -> bool {
    let mut inner = state.inner.lock().await;
    let now = Instant::now();
    inner
        .action_tokens
        .retain(|stored| now.duration_since(stored.time) < TOKEN_EXPIRY);
    let Some(index) = inner
        .action_tokens
        .iter()
        .position(|stored| stored.token.key == key && stored.token.scope == scope)
    else {
        return false;
    };
    inner.action_tokens.remove(index);
    true
}

fn create_device_locked(inner: &mut Inner, owner: &str, payload: &DevicePayload) -> Device {
    let device = Device {
        deleted: false,
        device_id: Uuid::new_v4().to_string(),
        last_login: now_iso(),
        name: payload.device_name.clone(),
        owner: owner.to_string(),
        sign_key: payload.sign_key.clone(),
    };
    let prekey = PreKeyWire {
        device_id: device.device_id.clone(),
        index: Some(payload.pre_key_index),
        public_key: ByteBuf::from(hex::decode(&payload.pre_key).unwrap_or_default()),
        signature: ByteBuf::from(hex::decode(&payload.pre_key_signature).unwrap_or_default()),
    };
    inner
        .signkey_to_device_id
        .insert(device.sign_key.clone(), device.device_id.clone());
    inner.prekeys.insert(device.device_id.clone(), prekey);
    inner
        .devices
        .insert(device.device_id.clone(), device.clone());
    device
}

fn create_server_locked(inner: &mut Inner, name: &str, owner_id: &str) -> Server {
    let server = Server {
        icon: None,
        name: name.to_string(),
        server_id: Uuid::new_v4().to_string(),
    };
    inner
        .servers
        .insert(server.server_id.clone(), server.clone());
    create_permission_locked(inner, owner_id, "server", &server.server_id, 100);
    let channel = Channel {
        channel_id: Uuid::new_v4().to_string(),
        name: "general".to_string(),
        server_id: server.server_id.clone(),
    };
    inner.channels.insert(channel.channel_id.clone(), channel);
    server
}

fn create_permission_locked(
    inner: &mut Inner,
    user_id: &str,
    resource_type: &str,
    resource_id: &str,
    power_level: i64,
) -> Permission {
    if let Some(existing) = inner.permissions.values().find(|p| {
        p.user_id == user_id && p.resource_id == resource_id && p.resource_type == resource_type
    }) {
        return existing.clone();
    }
    let permission = Permission {
        permission_id: Uuid::new_v4().to_string(),
        power_level,
        resource_id: resource_id.to_string(),
        resource_type: resource_type.to_string(),
        user_id: user_id.to_string(),
    };
    inner
        .permissions
        .insert(permission.permission_id.clone(), permission.clone());
    permission
}

fn retrieve_device_locked(inner: &Inner, id: &str) -> Option<Device> {
    if let Some(device) = inner.devices.get(id) {
        return (!device.deleted).then(|| device.clone());
    }
    if is_hexish(id) {
        return inner
            .signkey_to_device_id
            .get(id)
            .and_then(|device_id| inner.devices.get(device_id))
            .filter(|device| !device.deleted)
            .cloned();
    }
    None
}

fn retrieve_user_locked(inner: &Inner, id: &str) -> Option<UserRecord> {
    inner.users.get(id).cloned().or_else(|| {
        inner
            .username_to_user_id
            .get(&id.to_ascii_lowercase())
            .and_then(|user_id| inner.users.get(user_id))
            .cloned()
    })
}

fn public_user(user: &UserRecord) -> PublicUser {
    PublicUser {
        last_seen: user.last_seen.clone(),
        user_id: user.user_id.clone(),
        username: user.username.clone(),
    }
}

fn user_servers_locked(inner: &Inner, user_id: &str) -> Vec<Server> {
    inner
        .permissions
        .values()
        .filter(|p| p.user_id == user_id && p.resource_type == "server")
        .filter_map(|p| inner.servers.get(&p.resource_id))
        .cloned()
        .collect()
}

fn has_any_permission(inner: &Inner, user_id: &str, resource_id: &str) -> bool {
    inner
        .permissions
        .values()
        .any(|p| p.user_id == user_id && p.resource_id == resource_id)
}

fn has_permission(inner: &Inner, user_id: &str, resource_id: &str, min_power: i64) -> bool {
    inner
        .permissions
        .values()
        .any(|p| p.user_id == user_id && p.resource_id == resource_id && p.power_level > min_power)
}

fn verify_registration_payload_prekey_signature(
    payload: &RegistrationPayload,
    crypto_profile: &str,
) -> bool {
    let Ok(pre_key) = hex::decode(&payload.pre_key) else {
        return false;
    };
    let Ok(signature) = hex::decode(&payload.pre_key_signature) else {
        return false;
    };
    verify_signed_prekey(&pre_key, &signature, &payload.sign_key, crypto_profile)
}

fn verify_device_payload_prekey_signature(payload: &DevicePayload, crypto_profile: &str) -> bool {
    let Ok(pre_key) = hex::decode(&payload.pre_key) else {
        return false;
    };
    let Ok(signature) = hex::decode(&payload.pre_key_signature) else {
        return false;
    };
    verify_signed_prekey(&pre_key, &signature, &payload.sign_key, crypto_profile)
}

fn verify_prekey_signature(prekey: &PreKeyWire, sign_key_hex: &str, crypto_profile: &str) -> bool {
    verify_signed_prekey(
        prekey.public_key.as_ref(),
        prekey.signature.as_ref(),
        sign_key_hex,
        crypto_profile,
    )
}

fn verify_signed_prekey(
    public_key: &[u8],
    signature: &[u8],
    sign_key_hex: &str,
    crypto_profile: &str,
) -> bool {
    let Ok(sign_key) = hex::decode(sign_key_hex) else {
        return false;
    };
    let Some(opened) = open_signed_message(signature, &sign_key) else {
        return false;
    };
    opened == prekey_sign_payload(public_key, crypto_profile)
}

fn prekey_sign_payload(public_key: &[u8], crypto_profile: &str) -> Vec<u8> {
    if crypto_profile == "fips" {
        let mut out = Vec::with_capacity(public_key.len() + 1);
        out.push(0xa1);
        out.extend_from_slice(public_key);
        return out;
    }
    let parity = public_key.last().map(|b| b & 1).unwrap_or(0);
    let mut out = Vec::with_capacity(public_key.len() + 2);
    out.push(0);
    out.push(parity);
    out.extend_from_slice(public_key);
    out
}

fn open_signed_message(signed: &[u8], public_key: &[u8]) -> Option<Vec<u8>> {
    if public_key.len() == 32 {
        if signed.len() < 64 {
            return None;
        }
        let signature = Signature::from_slice(&signed[..64]).ok()?;
        let key = VerifyingKey::from_bytes(public_key.try_into().ok()?).ok()?;
        let message = &signed[64..];
        key.verify(message, &signature).ok()?;
        return Some(message.to_vec());
    }
    let (signature, message) = decode_fips_signed_message(signed)?;
    let key = P256VerifyingKey::from_public_key_der(public_key).ok()?;
    let signature = P256Signature::from_slice(signature)
        .or_else(|_| P256Signature::from_der(signature))
        .ok()?;
    key.verify(message, &signature).ok()?;
    Some(message.to_vec())
}

fn decode_fips_signed_message(signed: &[u8]) -> Option<(&[u8], &[u8])> {
    if signed.len() < 2 {
        return None;
    }
    let signature_len = ((signed[0] as usize) << 8) + signed[1] as usize;
    let signature_start: usize = 2;
    let signature_end = signature_start.checked_add(signature_len)?;
    if signed.len() < signature_end {
        return None;
    }
    Some((
        &signed[signature_start..signature_end],
        &signed[signature_end..],
    ))
}

fn fips_ecdh_raw_public_key_from_ecdsa_spki(spki: &[u8]) -> Option<Vec<u8>> {
    let key = P256VerifyingKey::from_public_key_der(spki).ok()?;
    Some(key.to_encoded_point(false).as_bytes().to_vec())
}

fn pack_ws<T: Serialize>(msg: &T) -> Vec<u8> {
    let mut out = vec![0_u8; 32];
    out.extend(rmp_serde::to_vec_named(msg).unwrap_or_default());
    out
}

fn unpack_ws(bytes: &[u8]) -> Option<(Vec<u8>, WsIncoming)> {
    if bytes.len() < 32 {
        return None;
    }
    let header = bytes[..32].to_vec();
    let msg = rmp_serde::from_slice::<WsIncoming>(&bytes[32..]).ok()?;
    Some((header, msg))
}

fn msgpack_response<T: Serialize>(value: &T) -> Response {
    match rmp_serde::to_vec_named(value) {
        Ok(bytes) => ([(header::CONTENT_TYPE, "application/msgpack")], bytes).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

fn decode_msgpack<T: DeserializeOwned>(body: &[u8]) -> Result<T, rmp_serde::decode::Error> {
    rmp_serde::from_slice(body)
}

fn json_error(status: StatusCode, message: &str) -> Response {
    (status, Json(serde_json::json!({ "error": message }))).into_response()
}

fn required_env(name: &str) -> Result<String, String> {
    env::var(name)
        .map(|v| normalize_env_value(&v))
        .map_err(|_| format!("Required environment variable '{name}' is not set."))
}

fn normalize_env_value(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.len() >= 2 {
        let first = trimmed.as_bytes()[0] as char;
        let last = trimmed.as_bytes()[trimmed.len() - 1] as char;
        if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
            return trimmed[1..trimmed.len() - 1].to_string();
        }
    }
    trimmed.to_string()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn exp_7d() -> usize {
    Utc::now().timestamp() as usize + JWT_EXPIRY_SECS
}

fn exp_5m() -> usize {
    Utc::now().timestamp() as usize + PASSKEY_JWT_EXPIRY_SECS
}

fn random_bytes(len: usize) -> Vec<u8> {
    let mut bytes = vec![0_u8; len];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes
}

fn random_hex(len: usize) -> String {
    hex::encode(random_bytes(len))
}

fn uuid_from_16(bytes: &[u8]) -> String {
    Uuid::from_slice(bytes)
        .map(|u| u.to_string())
        .unwrap_or_else(|_| Uuid::nil().to_string())
}

fn normalize_username(username: Option<&str>, sign_key_hex: &str) -> String {
    let trimmed = username.unwrap_or("").trim().to_ascii_lowercase();
    if !trimmed.is_empty() {
        return trimmed;
    }
    let seed: String = sign_key_hex
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .take(12)
        .collect::<String>()
        .to_ascii_lowercase();
    format!("key_{seed}")
}

fn valid_username(username: &str) -> bool {
    (3..=19).contains(&username.len())
        && username
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn is_hexish(s: &str) -> bool {
    s.len() >= 16 && s.as_bytes().iter().all(|b| b.is_ascii_hexdigit())
}

fn parse_duration_ms(raw: &str) -> Option<u64> {
    let s = raw.trim();
    let split = s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len());
    let n = s[..split].parse::<u64>().ok()?;
    let unit = s[split..].trim().to_ascii_lowercase();
    Some(match unit.as_str() {
        "ms" | "" => n,
        "s" | "sec" | "secs" => n * 1_000,
        "m" | "min" | "mins" => n * 60_000,
        "h" | "hr" | "hrs" => n * 3_600_000,
        "d" | "day" | "days" => n * 86_400_000,
        _ => return None,
    })
}

fn parse_iso(raw: &str) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(raw)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

fn is_expired(raw: &str) -> bool {
    parse_iso(raw).map(|dt| dt <= Utc::now()).unwrap_or(false)
}

fn env_truthy(name: &str) -> bool {
    matches!(
        env::var(name)
            .ok()
            .map(|v| v.trim().to_ascii_lowercase())
            .as_deref(),
        Some("1") | Some("true") | Some("yes")
    )
}

fn dev_key_matches(state: &AppState, headers: &HeaderMap) -> bool {
    let Some(expected) = state.dev_api_key.as_deref() else {
        return false;
    };
    headers
        .get("x-dev-api-key")
        .and_then(|v| v.to_str().ok())
        .map(|got| constant_time_eq(got.as_bytes(), expected.as_bytes()))
        .unwrap_or(false)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut diff = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        diff |= a ^ b;
    }
    diff == 0
}
