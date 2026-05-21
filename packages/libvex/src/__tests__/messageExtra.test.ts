/**
 * Copyright (c) 2020-2026 Vex Heavy Industries LLC
 * Licensed under AGPL-3.0. See LICENSE for details.
 */

import { describe, expect, it } from "vitest";

import {
    createMessageDeleteEventExtra,
    createMessageEmbedExtra,
    createMessageUpdateEventExtra,
    type MessageEmbed,
    parseMessageExtra,
    serializeMessageExtra,
} from "../messageExtra.js";

const imageAttachment = {
    contentType: "image/svg+xml",
    fileID: "file-1",
    fileName: "summary.svg",
    fileSize: 2048,
    key: "secret",
};

describe("message extra", () => {
    it("serializes and parses an encrypted media embed", () => {
        const embed: MessageEmbed = {
            blocks: [
                {
                    attachment: imageAttachment,
                    mediaType: "svg",
                    title: "Workflow summary",
                    type: "media",
                },
                {
                    source: "message",
                    type: "markdown",
                },
            ],
            display: "decorate",
            kind: "git.workflow",
            title: "CI finished",
            version: 1,
        };

        const extra = serializeMessageExtra({ embed, version: 1 });
        expect(parseMessageExtra(extra).embed).toEqual(embed);
    });

    it("merges embed metadata with existing reactions", () => {
        const current = JSON.stringify({
            reactions: [
                {
                    emoji: { kind: "unicode", value: "👍" },
                    userIDs: ["alice"],
                },
            ],
            version: 1,
        });
        const extra = createMessageEmbedExtra(
            {
                display: "replace",
                kind: "voice.transcript",
                title: "Voice memo transcript",
                version: 1,
            },
            current,
        );
        const parsed = parseMessageExtra(extra);

        expect(parsed.embed?.kind).toBe("voice.transcript");
        expect(parsed.reactions).toEqual([
            {
                emoji: { kind: "unicode", value: "👍" },
                userIDs: ["alice"],
            },
        ]);
    });

    it("drops malformed known fields while preserving unknown metadata", () => {
        const parsed = parseMessageExtra(
            JSON.stringify({
                embed: { display: "replace", kind: 123 },
                messageDeleteEvent: { action: "delete" },
                messageUpdateEvent: { action: "update", targetMailID: "m1" },
                reactionEvent: { action: "toggle", targetMailID: "m1" },
                vendor: { ok: true },
                version: 999,
            }),
        );

        expect(parsed).toEqual({
            vendor: { ok: true },
            version: 1,
        });
    });

    it("serializes and parses message update and delete events", () => {
        const updateExtra = createMessageUpdateEventExtra(
            "m-target",
            "edited text",
        );
        const deleteExtra = createMessageDeleteEventExtra("m-target");

        expect(parseMessageExtra(updateExtra).messageUpdateEvent).toEqual({
            action: "update",
            message: "edited text",
            targetMailID: "m-target",
        });
        expect(parseMessageExtra(deleteExtra).messageDeleteEvent).toEqual({
            action: "delete",
            targetMailID: "m-target",
        });
    });

    it("returns null for an empty serialized extra", () => {
        expect(serializeMessageExtra({ version: 1 })).toBeNull();
    });
});
