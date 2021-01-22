import nacl from "tweetnacl";

// HTTP api
// tslint:disable-next-line: no-namespace
export namespace XTypes {
    // types for e2e crypto
    export namespace CRYPTO {
        export interface IXKeyRing {
            identityKeys: nacl.BoxKeyPair;
            ephemeralKeys: nacl.BoxKeyPair;
            preKeys: IPreKeys;
        }

        export interface IPreKeys {
            keyPair: nacl.BoxKeyPair;
            signature: Uint8Array;
            index?: number;
        }

        export interface ISession {
            sessionID: string;
            userID: string;
            mode: "initiator" | "receiver";
            SK: Uint8Array;
            publicKey: Uint8Array;
            fingerprint: Uint8Array;
            lastUsed: Date;
        }
    }

    // types for the HTTP API
    export namespace HTTP {
        export interface IFilePayload {
            owner: string;
            signed: string;
            nonce: string;
            file?: string;
        }

        export interface IFileResponse {
            details: XTypes.SQL.IFile;
            data: Buffer;
        }

        export enum TokenScopes {
            Register,
            File,
            Avatar,
            Device,
            Invite,
            Emoji,
        }

        export interface IActionToken {
            key: string;
            time: Date;
            scope: TokenScopes;
        }

        export interface IDevicePayload {
            username: string;
            password: string;
            signKey: string;
            preKey: string;
            preKeySignature: string;
            preKeyIndex: number;
            signed: string;
            deviceName: string;
        }
    }

    // WS messages
    export namespace WS {
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

        // resources attach to success message

        // keybundle resource
        export interface IKeyBundle {
            signKey: Uint8Array;
            preKey: IPreKeys;
            otk?: IPreKeys;
        }

        // prekey resource
        export interface IPreKeys {
            deviceID: string;
            publicKey: Uint8Array;
            signature: Uint8Array;
            index: number;
        }

        // mail resource
        export interface IMail {
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

        export enum MailType {
            initial,
            subsequent,
        }
    }

    // Database types
    export namespace SQL {
        // universal
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
        }

        export interface IInvite {
            inviteID: string;
            serverID: string;
            owner: string;
            expiration: string;
        }

        export interface IMail {
            mailID: string;
            mailType: WS.MailType;
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

        export interface IFile {
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

        export interface IPreKeys {
            keyID: string;
            userID: string;
            deviceID: string;
            index: number;
            privateKey?: string;
            publicKey: string;
            signature: string;
        }

        export interface ISession {
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
    }
}
