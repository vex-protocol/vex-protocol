/**
 * Generates asyncapi.json from Zod schemas for the WebSocket protocol.
 *
 * Run: npx tsx scripts/generate-asyncapi.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const { version: packageVersion } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

import { z } from "zod/v4";

// Import WS message schemas
const {
    BaseMsgSchema: baseMsg,
    ChallMsgSchema: challMsg,
    ErrMsgSchema: errMsg,
    MailWSSchema: mailWS,
    NotifyMsgSchema: notifyMsg,
    ReceiptMsgSchema: receiptMsg,
    ResourceMsgSchema: resourceMsg,
    RespMsgSchema: respMsg,
    SuccessMsgSchema: successMsg,
} = await import("../src/schemas/index.js");

// ── Convert each schema to JSON Schema ──────────────────────────────────────

function toJsonSchema(schema: z.ZodType, description?: string) {
    const result = z.toJSONSchema(schema, {
        unrepresentable: "any",
    });
    if (description) {
        (result as Record<string, unknown>).description = description;
    }
    return result;
}

// ── Define message types ────────────────────────────────────────────────────

interface MsgDef {
    name: string;
    title: string;
    direction: "receive" | "send";
    schema: z.ZodType;
    description: string;
    operationDescription: string;
}

const messages: MsgDef[] = [
    // Client -> Server
    {
        name: "auth",
        title: "Authentication",
        direction: "send",
        schema: z.object({
            token: z.string().describe("JWT Bearer token"),
            type: z.literal("auth"),
        }),
        description: "Initial authentication message with JWT token",
        operationDescription:
            "Send a JWT bearer token to authenticate the WebSocket session.",
    },
    {
        name: "response",
        title: "Auth response",
        direction: "send",
        schema: respMsg,
        description: "Signed challenge response for device authentication",
        operationDescription:
            "Send a signed challenge response to complete device-key authentication.",
    },
    {
        name: "resource",
        title: "Resource operation",
        direction: "send",
        schema: resourceMsg,
        description: "CRUD operation on a resource (mail, preKeys, etc.)",
        operationDescription:
            "Send a CRUD operation targeting a specific resource type (mail, preKeys, etc.).",
    },
    {
        name: "receipt",
        title: "Mail receipt",
        direction: "send",
        schema: receiptMsg,
        description: "Acknowledge receipt of a mail message",
        operationDescription:
            "Send a receipt acknowledging that a mail message has been received and processed.",
    },
    {
        name: "ping",
        title: "Keepalive ping",
        direction: "send",
        schema: z.object({ type: z.literal("ping") }),
        description: "Client keepalive ping",
        operationDescription:
            "Send a keepalive ping to prevent the WebSocket connection from timing out.",
    },

    // Server -> Client
    {
        name: "challenge",
        title: "Auth challenge",
        direction: "receive",
        schema: challMsg,
        description: "Server sends a challenge nonce for device authentication",
        operationDescription:
            "Receive a challenge nonce from the server that must be signed with the device key.",
    },
    {
        name: "authorized",
        title: "Auth success",
        direction: "receive",
        schema: z.object({ type: z.literal("authorized") }),
        description: "Server confirms authentication succeeded",
        operationDescription:
            "Receive confirmation that the WebSocket session has been successfully authenticated.",
    },
    {
        name: "success",
        title: "Operation success",
        direction: "receive",
        schema: successMsg,
        description: "Server response to a successful resource operation",
        operationDescription:
            "Receive the server response for a successfully completed resource operation.",
    },
    {
        name: "error",
        title: "Operation error",
        direction: "receive",
        schema: errMsg,
        description: "Server response to a failed operation",
        operationDescription:
            "Receive an error response when a resource operation fails.",
    },
    {
        name: "notify",
        title: "Server notification",
        direction: "receive",
        schema: notifyMsg,
        description:
            "Server push notification (new mail, server change, permission update)",
        operationDescription:
            "Receive a server-initiated push notification for events like new mail, server changes, or permission updates.",
    },
    {
        name: "pong",
        title: "Keepalive pong",
        direction: "receive",
        schema: z.object({ type: z.literal("pong") }),
        description: "Server keepalive pong response",
        operationDescription:
            "Receive a pong response from the server confirming the connection is alive.",
    },
];

// ── Build AsyncAPI 3.0 document ─────────────────────────────────────────────

const messageComponents: Record<string, object> = {};
const channelMessages: Record<string, { $ref: string }> = {};
const operations: Record<string, object> = {};

for (const msg of messages) {
    const key = msg.name.charAt(0).toUpperCase() + msg.name.slice(1);

    messageComponents[key] = {
        name: msg.name,
        title: msg.title,
        contentType: "application/msgpack",
        payload: toJsonSchema(msg.schema, msg.description),
    };

    channelMessages[msg.name] = {
        $ref: `#/components/messages/${key}`,
    };

    const opName = msg.direction === "send" ? msg.name : `receive${key}`;
    operations[opName] = {
        action: msg.direction,
        channel: { $ref: "#/channels/chat" },
        summary: msg.title,
        description: msg.operationDescription,
        messages: [{ $ref: `#/channels/chat/messages/${msg.name}` }],
    };
}

const doc = {
    asyncapi: "3.0.0",
    info: {
        title: "Vex Protocol",
        version: packageVersion,
        description:
            "Real-time encrypted chat protocol for vex.wtf.\nMessages are serialized using msgpack over WebSocket.",
        license: { name: "AGPL-3.0-or-later" },
        contact: {
            name: "Vex Protocol",
            url: "https://github.com/vex-protocol/types-js",
        },
        tags: [
            {
                name: "auth",
                description: "Authentication and session management",
            },
            { name: "messaging", description: "Real-time message exchange" },
        ],
    },
    servers: {
        production: {
            host: "api.vex.wtf",
            protocol: "wss",
            description: "Production WebSocket endpoint",
            security: [{ $ref: "#/components/securitySchemes/bearerAuth" }],
        },
    },
    channels: {
        chat: {
            address: "/ws",
            title: "Main WebSocket channel",
            description:
                "Bidirectional channel for all real-time communication.\nMessages are encoded as msgpack binary frames.",
            messages: channelMessages,
            bindings: {
                ws: {
                    method: "GET",
                    headers: {
                        type: "object",
                        properties: {
                            Authorization: {
                                type: "string",
                                description: "Bearer token",
                            },
                        },
                    },
                },
            },
        },
    },
    operations,
    components: {
        securitySchemes: {
            bearerAuth: {
                type: "http",
                scheme: "bearer",
                bearerFormat: "JWT",
            },
        },
        messages: messageComponents,
    },
};

writeFileSync("asyncapi.json", JSON.stringify(doc, null, 4) + "\n");
console.log(
    `Generated asyncapi.json with ${messages.length} message types (${messages.filter((m) => m.direction === "send").length} send, ${messages.filter((m) => m.direction === "receive").length} receive)`,
);
