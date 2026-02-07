import nacl from "tweetnacl";

// ==========================================
// CRYPTO TYPES
// ==========================================

export interface IXKeyRing {
  identityKeys: nacl.BoxKeyPair;
  ephemeralKeys: nacl.BoxKeyPair;
  preKeys: IPreKeysCrypto;
}

export interface IPreKeysCrypto {
  keyPair: nacl.BoxKeyPair;
  signature: Uint8Array;
  index?: number;
}

export interface ISessionCrypto {
  sessionID: string;
  userID: string;
  mode: "initiator" | "receiver";
  SK: Uint8Array;
  publicKey: Uint8Array;
  fingerprint: Uint8Array;
  lastUsed: Date;
}

// ==========================================
// HTTP API TYPES
// ==========================================

export enum TokenScopes {
  Register,
  File,
  Avatar,
  Device,
  Invite,
  Emoji,
  Connect,
}

export interface IActionToken {
  key: string;
  time: Date;
  scope: TokenScopes;
}

export interface IFilePayload {
  owner: string;
  signed: string;
  nonce: string;
  file?: string;
}

export interface IFileResponse {
  details: IFileSQL;
  data: Buffer;
}

export interface IDevicePayload {
  username: string;
  signKey: string;
  preKey: string;
  preKeySignature: string;
  preKeyIndex: number;
  signed: string;
  deviceName: string;
}

export interface IRegistrationPayload extends IDevicePayload {
  password: string;
}

// ==========================================
// WEBSOCKET TYPES (Network Layer)
// ==========================================

export enum SocketAuthErrors {
  BadSignature,
  InvalidToken,
  UserNotRegistered,
}

export enum MailType {
  initial,
  subsequent,
}

export interface IBaseMsg {
  transmissionID: string;
  type: string;
}

export interface ISucessMsg extends IBaseMsg {
  data: any;
  timestamp?: string;
}

export interface IErrMsg extends IBaseMsg {
  error: string;
  data?: any;
}

export interface IChallMsg extends IBaseMsg {
  type: "challenge";
  challenge: Uint8Array;
}

export interface IRespMsg extends IBaseMsg {
  type: "response";
  signed: Uint8Array;
}

export interface IReceiptMsg extends IBaseMsg {
  nonce: Uint8Array;
}

export interface IResourceMsg extends IBaseMsg {
  resourceType: string;
  action: string;
  data?: any;
}

export interface INotifyMsg extends IBaseMsg {
  event: string;
  data?: any;
}

// Resources attached to success messages

export interface IKeyBundle {
  signKey: Uint8Array;
  preKey: IPreKeysWS;
  otk?: IPreKeysWS;
}

export interface IPreKeysWS {
  deviceID: string;
  publicKey: Uint8Array;
  signature: Uint8Array;
  index: number;
}

export interface IMailWS {
  mailID: string;
  mailType: MailType;
  sender: string;
  recipient: string;
  cipher: Uint8Array;
  nonce: Uint8Array;
  extra: Uint8Array;
  group: Uint8Array | null;
  forward: boolean;
  authorID: string;
  readerID: string;
}

// ==========================================
// DATABASE TYPES (SQL / Knex)
// ==========================================

export interface IUser {
  userID: string;
  username: string;
  lastSeen: Date;
  passwordHash: string;
  passwordSalt: string;
}

export interface IDevice {
  deviceID: string;
  owner: string;
  signKey: string;
  name: string;
  lastLogin: string;
  deleted: boolean;
}

export interface IInvite {
  inviteID: string;
  serverID: string;
  owner: string;
  expiration: string;
}

export interface IMailSQL {
  mailID: string;
  mailType: MailType;
  header: string;
  recipient: string;
  sender: string;
  cipher: string;
  nonce: string;
  extra: string;
  time: Date;
  group: string | null;
  forward: boolean;
  authorID: string;
  readerID: string;
}

export interface IEmoji {
  emojiID: string;
  owner: string;
  name: string;
}

export interface IFileSQL {
  fileID: string;
  owner: string;
  nonce: string;
}

export interface IServer {
  serverID: string;
  name: string;
  icon?: string;
}

export interface IChannel {
  channelID: string;
  serverID: string;
  name: string;
}

export interface IPermission {
  permissionID: string;
  userID: string;
  resourceID: string;
  resourceType: string;
  powerLevel: number;
}

export interface IIdentityKeys {
  keyID: string;
  userID: string;
  deviceID: string;
  privateKey?: string;
  publicKey: string;
}

export interface IPreKeysSQL {
  keyID: string;
  userID: string;
  deviceID: string;
  index: number;
  privateKey?: string;
  publicKey: string;
  signature: string;
}

export interface ISessionSQL {
  sessionID: string;
  userID: string;
  deviceID: string;
  mode: "initiator" | "receiver";
  SK: string;
  publicKey: string;
  fingerprint: string;
  lastUsed: Date;
  verified: boolean;
}
