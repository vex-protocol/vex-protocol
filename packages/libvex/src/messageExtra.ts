/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 * Commercial licenses available at vex.wtf
 */

export const MESSAGE_EXTRA_VERSION = 1;

export interface EncryptedFileAttachmentReference {
    contentType: string;
    fileID: string;
    fileName: string;
    fileSize: number;
    key: string;
}

export interface MessageDeleteEvent {
    action: "delete";
    deletedAt?: string | undefined;
    targetMailID?: string | undefined;
    targetMailIDs?: string[] | undefined;
}

export interface MessageEmbed {
    actions?: MessageEmbedAction[] | undefined;
    blocks?: MessageEmbedBlock[] | undefined;
    display: MessageEmbedDisplay;
    fields?: MessageEmbedField[] | undefined;
    icon?: string | undefined;
    iconAttachment?: EncryptedFileAttachmentReference | undefined;
    kind: string;
    source?: MessageEmbedSource | undefined;
    subtitle?: string | undefined;
    suppressLinkPreview?: boolean | undefined;
    timestamp?: string | undefined;
    title: string;
    tone?: MessageEmbedTone | undefined;
    version: typeof MESSAGE_EXTRA_VERSION;
}

export interface MessageEmbedAction {
    label: string;
    type: "link";
    url: string;
}

export type MessageEmbedBlock =
    | MessageEmbedCodeBlock
    | MessageEmbedDividerBlock
    | MessageEmbedFileBlock
    | MessageEmbedGalleryBlock
    | MessageEmbedMarkdownBlock
    | MessageEmbedMediaBlock;

export interface MessageEmbedCodeBlock {
    code: string;
    language?: string | undefined;
    type: "code";
}

export type MessageEmbedDisplay = "decorate" | "replace";

export interface MessageEmbedDividerBlock {
    type: "divider";
}

export interface MessageEmbedField {
    label: string;
    mono?: boolean | undefined;
    short?: boolean | undefined;
    value: string;
}

export interface MessageEmbedFileBlock {
    attachment: EncryptedFileAttachmentReference;
    role?: string | undefined;
    type: "file";
}

export interface MessageEmbedGalleryBlock {
    items: MessageEmbedMediaItem[];
    type: "gallery";
}

export interface MessageEmbedMarkdownBlock {
    maxLines?: number | undefined;
    source?: "message" | undefined;
    text?: string | undefined;
    type: "markdown";
}

export interface MessageEmbedMediaBlock extends MessageEmbedMediaItem {
    type: "media";
}

export interface MessageEmbedMediaItem {
    alt?: string | undefined;
    aspectRatio?: number | undefined;
    attachment: EncryptedFileAttachmentReference;
    caption?: string | undefined;
    mediaType: MessageEmbedMediaType;
    thumbnail?: EncryptedFileAttachmentReference | undefined;
    title?: string | undefined;
}

export type MessageEmbedMediaType =
    | "audio"
    | "file"
    | "image"
    | "svg"
    | "video";

export interface MessageEmbedSource {
    id?: string | undefined;
    mailID?: string | undefined;
    provider?: string | undefined;
    url?: string | undefined;
}

export type MessageEmbedTone =
    | "danger"
    | "default"
    | "info"
    | "success"
    | "warning";

export type MessageEmoji =
    | {
          imageUrl?: string | undefined;
          kind: "custom";
          name: string;
          sourceID?: string | undefined;
      }
    | {
          kind: "unicode";
          shortcode?: string | undefined;
          value: string;
      };

export interface MessageExtra {
    [key: string]: unknown;
    embed?: MessageEmbed | undefined;
    messageDeleteEvent?: MessageDeleteEvent | undefined;
    messageUpdateEvent?: MessageUpdateEvent | undefined;
    reactionEvent?: MessageReactionEvent | undefined;
    reactions?: MessageReaction[] | undefined;
    version: typeof MESSAGE_EXTRA_VERSION;
}

export interface MessageReaction {
    emoji: MessageEmoji;
    userIDs: string[];
}

export interface MessageReactionEvent {
    action: "toggle";
    emoji: MessageEmoji;
    targetMailID: string;
}

export interface MessageUpdateEvent {
    action: "update";
    editedAt?: string | undefined;
    message: string;
    targetMailID: string;
}

export function createMessageDeleteBatchEventExtra(
    targetMailIDs: string[],
    currentExtra?: null | string,
): null | string {
    return serializeMessageExtra({
        ...parseMessageExtra(currentExtra),
        messageDeleteEvent: {
            action: "delete",
            targetMailIDs,
        },
        version: MESSAGE_EXTRA_VERSION,
    });
}

export function createMessageDeleteEventExtra(
    targetMailID: string,
    currentExtra?: null | string,
): null | string {
    return serializeMessageExtra({
        ...parseMessageExtra(currentExtra),
        messageDeleteEvent: {
            action: "delete",
            targetMailID,
        },
        version: MESSAGE_EXTRA_VERSION,
    });
}

export function createMessageEmbedExtra(
    embed: MessageEmbed,
    currentExtra?: null | string,
): null | string {
    return serializeMessageExtra({
        ...parseMessageExtra(currentExtra),
        embed,
        version: MESSAGE_EXTRA_VERSION,
    });
}

export function createMessageUpdateEventExtra(
    targetMailID: string,
    message: string,
    currentExtra?: null | string,
): null | string {
    return serializeMessageExtra({
        ...parseMessageExtra(currentExtra),
        messageUpdateEvent: {
            action: "update",
            message,
            targetMailID,
        },
        version: MESSAGE_EXTRA_VERSION,
    });
}

export function parseMessageExtra(
    extra: null | string | undefined,
): MessageExtra {
    if (!extra) {
        return { version: MESSAGE_EXTRA_VERSION };
    }

    try {
        const raw = JSON.parse(extra) as unknown;
        if (!isRecord(raw)) {
            return { version: MESSAGE_EXTRA_VERSION };
        }
        const rest: Record<string, unknown> = { ...raw };
        delete rest["embed"];
        delete rest["messageDeleteEvent"];
        delete rest["messageUpdateEvent"];
        delete rest["reactionEvent"];
        delete rest["reactions"];
        delete rest["version"];

        const embed = parseMessageEmbed(raw["embed"]);
        const messageDeleteEvent = parseMessageDeleteEvent(
            raw["messageDeleteEvent"],
        );
        const messageUpdateEvent = parseMessageUpdateEvent(
            raw["messageUpdateEvent"],
        );
        const reactionEvent = parseMessageReactionEvent(raw["reactionEvent"]);
        const reactions = parseMessageReactions(raw["reactions"]);

        return {
            ...rest,
            ...(embed ? { embed } : {}),
            ...(messageDeleteEvent ? { messageDeleteEvent } : {}),
            ...(messageUpdateEvent ? { messageUpdateEvent } : {}),
            ...(reactionEvent ? { reactionEvent } : {}),
            ...(reactions.length > 0 ? { reactions } : {}),
            version: MESSAGE_EXTRA_VERSION,
        };
    } catch {
        return { version: MESSAGE_EXTRA_VERSION };
    }
}

export function serializeMessageExtra(extra: MessageExtra): null | string {
    const normalized = normalizeMessageExtra(extra);
    if (Object.keys(normalized).length === 1) {
        return null;
    }
    return JSON.stringify(normalized);
}

function copyOptionalBoolean(
    target: object,
    source: Record<string, unknown>,
    key: string,
): void {
    const value = source[key];
    if (typeof value === "boolean") {
        Reflect.set(target, key, value);
    }
}

function copyOptionalNumber(
    target: object,
    source: Record<string, unknown>,
    key: string,
): void {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
        Reflect.set(target, key, value);
    }
}

function copyOptionalString(
    target: object,
    source: Record<string, unknown>,
    key: string,
): void {
    const value = source[key];
    if (typeof value === "string") {
        Reflect.set(target, key, value);
    }
}

function isEmbedTone(value: unknown): value is MessageEmbedTone {
    return (
        value === "danger" ||
        value === "default" ||
        value === "info" ||
        value === "success" ||
        value === "warning"
    );
}

function isMessageEmbedMediaType(
    value: unknown,
): value is MessageEmbedMediaType {
    return (
        value === "audio" ||
        value === "file" ||
        value === "image" ||
        value === "svg" ||
        value === "video"
    );
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMessageExtra(extra: MessageExtra): MessageExtra {
    const embed = parseMessageEmbed(extra.embed);
    const messageDeleteEvent = parseMessageDeleteEvent(
        extra.messageDeleteEvent,
    );
    const messageUpdateEvent = parseMessageUpdateEvent(
        extra.messageUpdateEvent,
    );
    const reactionEvent = parseMessageReactionEvent(extra.reactionEvent);
    const reactions = parseMessageReactions(extra.reactions);
    const normalized: MessageExtra = {
        ...extra,
        version: MESSAGE_EXTRA_VERSION,
    };

    if (embed) {
        normalized.embed = embed;
    } else {
        delete normalized.embed;
    }
    if (messageDeleteEvent) {
        normalized.messageDeleteEvent = messageDeleteEvent;
    } else {
        delete normalized.messageDeleteEvent;
    }
    if (messageUpdateEvent) {
        normalized.messageUpdateEvent = messageUpdateEvent;
    } else {
        delete normalized.messageUpdateEvent;
    }
    if (reactionEvent) {
        normalized.reactionEvent = reactionEvent;
    } else {
        delete normalized.reactionEvent;
    }
    if (reactions.length > 0) {
        normalized.reactions = reactions;
    } else {
        delete normalized.reactions;
    }
    return normalized;
}

function parseAttachment(
    value: unknown,
): EncryptedFileAttachmentReference | null {
    if (!isRecord(value)) return null;
    const { contentType, fileID, fileName, fileSize, key } = value;
    if (
        typeof contentType !== "string" ||
        typeof fileID !== "string" ||
        typeof fileName !== "string" ||
        typeof fileSize !== "number" ||
        !Number.isFinite(fileSize) ||
        typeof key !== "string"
    ) {
        return null;
    }
    return {
        contentType,
        fileID,
        fileName,
        fileSize: Math.max(0, Math.round(fileSize)),
        key,
    };
}

function parseMessageDeleteEvent(value: unknown): MessageDeleteEvent | null {
    if (!isRecord(value) || value["action"] !== "delete") {
        return null;
    }
    const targetMailID =
        typeof value["targetMailID"] === "string" &&
        value["targetMailID"].length > 0
            ? value["targetMailID"]
            : undefined;
    const targetMailIDs = parseMessageDeleteTargets(value["targetMailIDs"]);
    if (!targetMailID && targetMailIDs.length === 0) {
        return null;
    }
    const event: MessageDeleteEvent = {
        action: "delete",
        ...(targetMailID ? { targetMailID } : {}),
        ...(targetMailIDs.length > 0 ? { targetMailIDs } : {}),
    };
    copyOptionalString(event, value, "deletedAt");
    return event;
}

function parseMessageDeleteTargets(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const targets: string[] = [];
    const seen = new Set<string>();
    for (const item of value) {
        if (typeof item !== "string" || item.length === 0 || seen.has(item)) {
            continue;
        }
        seen.add(item);
        targets.push(item);
    }
    return targets;
}

function parseMessageEmbed(value: unknown): MessageEmbed | null {
    if (!isRecord(value)) return null;
    const display = value["display"];
    const kind = value["kind"];
    const title = value["title"];
    if (
        (display !== "decorate" && display !== "replace") ||
        typeof kind !== "string" ||
        typeof title !== "string"
    ) {
        return null;
    }

    const embed: MessageEmbed = {
        display,
        kind,
        title,
        version: MESSAGE_EXTRA_VERSION,
    };
    copyOptionalString(embed, value, "icon");
    const iconAttachment = parseAttachment(value["iconAttachment"]);
    if (iconAttachment) embed.iconAttachment = iconAttachment;
    copyOptionalString(embed, value, "subtitle");
    copyOptionalBoolean(embed, value, "suppressLinkPreview");
    copyOptionalString(embed, value, "timestamp");
    if (isEmbedTone(value["tone"])) {
        embed.tone = value["tone"];
    }

    const actions = parseMessageEmbedActions(value["actions"]);
    if (actions.length > 0) embed.actions = actions;
    const blocks = parseMessageEmbedBlocks(value["blocks"]);
    if (blocks.length > 0) embed.blocks = blocks;
    const fields = parseMessageEmbedFields(value["fields"]);
    if (fields.length > 0) embed.fields = fields;
    const source = parseMessageEmbedSource(value["source"]);
    if (source) embed.source = source;
    return embed;
}

function parseMessageEmbedAction(value: unknown): MessageEmbedAction | null {
    if (!isRecord(value)) return null;
    if (
        value["type"] !== "link" ||
        typeof value["label"] !== "string" ||
        typeof value["url"] !== "string"
    ) {
        return null;
    }
    return {
        label: value["label"],
        type: "link",
        url: value["url"],
    };
}

function parseMessageEmbedActions(value: unknown): MessageEmbedAction[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        const action = parseMessageEmbedAction(item);
        return action ? [action] : [];
    });
}

function parseMessageEmbedBlock(value: unknown): MessageEmbedBlock | null {
    if (!isRecord(value)) return null;
    switch (value["type"]) {
        case "code":
            return parseMessageEmbedCodeBlock(value);
        case "divider":
            return { type: "divider" };
        case "file":
            return parseMessageEmbedFileBlock(value);
        case "gallery":
            return parseMessageEmbedGalleryBlock(value);
        case "markdown":
            return parseMessageEmbedMarkdownBlock(value);
        case "media":
            return parseMessageEmbedMediaBlock(value);
        default:
            return null;
    }
}

function parseMessageEmbedBlocks(value: unknown): MessageEmbedBlock[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        const block = parseMessageEmbedBlock(item);
        return block ? [block] : [];
    });
}

function parseMessageEmbedCodeBlock(
    value: Record<string, unknown>,
): MessageEmbedCodeBlock | null {
    if (typeof value["code"] !== "string") return null;
    const block: MessageEmbedCodeBlock = {
        code: value["code"],
        type: "code",
    };
    copyOptionalString(block, value, "language");
    return block;
}

function parseMessageEmbedField(value: unknown): MessageEmbedField | null {
    if (
        !isRecord(value) ||
        typeof value["label"] !== "string" ||
        typeof value["value"] !== "string"
    ) {
        return null;
    }
    const field: MessageEmbedField = {
        label: value["label"],
        value: value["value"],
    };
    copyOptionalBoolean(field, value, "mono");
    copyOptionalBoolean(field, value, "short");
    return field;
}

function parseMessageEmbedFields(value: unknown): MessageEmbedField[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        const field = parseMessageEmbedField(item);
        return field ? [field] : [];
    });
}

function parseMessageEmbedFileBlock(
    value: Record<string, unknown>,
): MessageEmbedFileBlock | null {
    const attachment = parseAttachment(value["attachment"]);
    if (!attachment) return null;
    const block: MessageEmbedFileBlock = {
        attachment,
        type: "file",
    };
    copyOptionalString(block, value, "role");
    return block;
}

function parseMessageEmbedGalleryBlock(
    value: Record<string, unknown>,
): MessageEmbedGalleryBlock | null {
    if (!Array.isArray(value["items"])) return null;
    const items = value["items"].flatMap((item) => {
        const media = parseMessageEmbedMediaItem(item);
        return media ? [media] : [];
    });
    return items.length > 0 ? { items, type: "gallery" } : null;
}

function parseMessageEmbedMarkdownBlock(
    value: Record<string, unknown>,
): MessageEmbedMarkdownBlock | null {
    const text = value["text"];
    const source = value["source"];
    if (
        text !== undefined &&
        typeof text !== "string" &&
        source !== "message"
    ) {
        return null;
    }
    if (text === undefined && source !== "message") return null;
    const block: MessageEmbedMarkdownBlock = { type: "markdown" };
    copyOptionalNumber(block, value, "maxLines");
    if (source === "message") block.source = "message";
    if (typeof text === "string") block.text = text;
    return block;
}

function parseMessageEmbedMediaBlock(
    value: Record<string, unknown>,
): MessageEmbedMediaBlock | null {
    const media = parseMessageEmbedMediaItem(value);
    return media ? { ...media, type: "media" } : null;
}

function parseMessageEmbedMediaItem(
    value: unknown,
): MessageEmbedMediaItem | null {
    if (!isRecord(value) || !isMessageEmbedMediaType(value["mediaType"])) {
        return null;
    }
    const attachment = parseAttachment(value["attachment"]);
    if (!attachment) return null;
    const media: MessageEmbedMediaItem = {
        attachment,
        mediaType: value["mediaType"],
    };
    copyOptionalString(media, value, "alt");
    copyOptionalNumber(media, value, "aspectRatio");
    copyOptionalString(media, value, "caption");
    copyOptionalString(media, value, "title");
    const thumbnail = parseAttachment(value["thumbnail"]);
    if (thumbnail) media.thumbnail = thumbnail;
    return media;
}

function parseMessageEmbedSource(value: unknown): MessageEmbedSource | null {
    if (!isRecord(value)) return null;
    const source: MessageEmbedSource = {};
    copyOptionalString(source, value, "id");
    copyOptionalString(source, value, "mailID");
    copyOptionalString(source, value, "provider");
    copyOptionalString(source, value, "url");
    return Object.keys(source).length > 0 ? source : null;
}

function parseMessageEmoji(value: unknown): MessageEmoji | null {
    if (!isRecord(value)) return null;
    if (value["kind"] === "unicode" && typeof value["value"] === "string") {
        return {
            kind: "unicode",
            ...(typeof value["shortcode"] === "string"
                ? { shortcode: value["shortcode"] }
                : {}),
            value: value["value"],
        };
    }
    if (value["kind"] === "custom" && typeof value["name"] === "string") {
        return {
            ...(typeof value["imageUrl"] === "string"
                ? { imageUrl: value["imageUrl"] }
                : {}),
            kind: "custom",
            name: value["name"],
            ...(typeof value["sourceID"] === "string"
                ? { sourceID: value["sourceID"] }
                : {}),
        };
    }
    return null;
}

function parseMessageReaction(value: unknown): MessageReaction | null {
    if (!isRecord(value) || !Array.isArray(value["userIDs"])) return null;
    const emoji = parseMessageEmoji(value["emoji"]);
    if (!emoji) return null;
    const userIDs = value["userIDs"].filter(
        (id): id is string => typeof id === "string",
    );
    return userIDs.length > 0 ? { emoji, userIDs } : null;
}

function parseMessageReactionEvent(
    value: unknown,
): MessageReactionEvent | null {
    if (
        !isRecord(value) ||
        value["action"] !== "toggle" ||
        typeof value["targetMailID"] !== "string"
    ) {
        return null;
    }
    const emoji = parseMessageEmoji(value["emoji"]);
    return emoji
        ? {
              action: "toggle",
              emoji,
              targetMailID: value["targetMailID"],
          }
        : null;
}

function parseMessageReactions(value: unknown): MessageReaction[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        const reaction = parseMessageReaction(item);
        return reaction ? [reaction] : [];
    });
}

function parseMessageUpdateEvent(value: unknown): MessageUpdateEvent | null {
    if (
        !isRecord(value) ||
        value["action"] !== "update" ||
        typeof value["message"] !== "string" ||
        typeof value["targetMailID"] !== "string"
    ) {
        return null;
    }
    const event: MessageUpdateEvent = {
        action: "update",
        message: value["message"],
        targetMailID: value["targetMailID"],
    };
    copyOptionalString(event, value, "editedAt");
    return event;
}
