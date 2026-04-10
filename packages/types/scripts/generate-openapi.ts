/**
 * Generates openapi.json from Zod schemas.
 *
 * Run: tsx scripts/generate-openapi.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const { version: packageVersion } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

import { z } from "zod/v4";
import {
    extendZodWithOpenApi,
    OpenAPIRegistry,
    OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";

// Must extend BEFORE schema modules are loaded — patches ZodType.prototype
extendZodWithOpenApi(z);

// Dynamic import so the schemas pick up the patched prototype
const {
    ActionTokenSchema: actionToken,
    ChannelSchema: channel,
    DeviceSchema: device,
    DevicePayloadSchema: devicePayload,
    EmojiSchema: emoji,
    FileSQLSchema: fileSQL,
    InviteSchema: invite,
    PermissionSchema: permission,
    RegistrationPayloadSchema: registrationPayload,
    ServerSchema: server,
    UserSchema: user,
} = await import("../src/schemas/index.js");

const registry = new OpenAPIRegistry();

// ── Register schemas ────────────────────────────────────────────────────────

registry.register("User", user);
registry.register("Device", device);
registry.register("Server", server);
registry.register("Channel", channel);
registry.register("Permission", permission);
registry.register("Invite", invite);
registry.register("Emoji", emoji);
registry.register("FileSQL", fileSQL);
registry.register("ActionToken", actionToken);
registry.register("DevicePayload", devicePayload);
registry.register("RegistrationPayload", registrationPayload);

// ── Common parameters ───────────────────────────────────────────────────────

const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
});

const idParam = (name: string, description: string) => ({
    in: "path" as const,
    name,
    required: true,
    schema: { type: "string" as const },
    description,
});

// ── Auth endpoints ──────────────────────────────────────────────────────────

registry.registerPath({
    method: "post",
    path: "/auth",
    operationId: "login",
    summary: "Login with username and password",
    description:
        "Authenticate with username and password credentials. Returns a JWT token and the authenticated user profile.",
    tags: ["auth"],
    request: {
        body: {
            content: {
                "application/msgpack": {
                    schema: z.object({
                        username: z.string(),
                        password: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: "Login successful",
            content: {
                "application/msgpack": {
                    schema: z.object({
                        token: z.string(),
                        user,
                    }),
                },
            },
        },
        401: { description: "Invalid credentials" },
    },
});

registry.registerPath({
    method: "post",
    path: "/auth/device",
    operationId: "requestDeviceChallenge",
    summary: "Request device auth challenge",
    description:
        "Initiate device-key authentication by submitting a deviceID and signing key. Returns a challenge nonce to sign.",
    tags: ["auth"],
    request: {
        body: {
            content: {
                "application/msgpack": {
                    schema: z.object({
                        deviceID: z.string(),
                        signKey: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: "Challenge issued",
            content: {
                "application/msgpack": {
                    schema: z.object({
                        challenge: z.string(),
                        challengeID: z.string(),
                    }),
                },
            },
        },
    },
});

registry.registerPath({
    method: "post",
    path: "/auth/device/verify",
    operationId: "verifyDeviceChallenge",
    summary: "Verify device auth challenge",
    description:
        "Submit the signed challenge to complete device-key authentication. Returns a JWT token and the authenticated user profile.",
    tags: ["auth"],
    request: {
        body: {
            content: {
                "application/msgpack": {
                    schema: z.object({
                        challengeID: z.string(),
                        signed: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            description: "Device authenticated",
            content: {
                "application/msgpack": {
                    schema: z.object({
                        token: z.string(),
                        user,
                    }),
                },
            },
        },
    },
});

registry.registerPath({
    method: "post",
    path: "/register",
    operationId: "register",
    summary: "Register a new user account",
    description:
        "Create a new user account with cryptographic device registration. Requires a signed registration payload with Ed25519 keys.",
    tags: ["auth"],
    request: {
        body: {
            content: {
                "application/msgpack": { schema: registrationPayload },
            },
        },
    },
    responses: {
        200: {
            description: "Registration successful",
            content: {
                "application/msgpack": { schema: user },
            },
        },
    },
});

registry.registerPath({
    method: "post",
    path: "/whoami",
    operationId: "whoami",
    summary: "Get current session info",
    description:
        "Return the current authenticated session including token expiry and user profile.",
    tags: ["auth"],
    security: [{ [bearerAuth.name]: [] }],
    responses: {
        200: {
            description: "Current session",
            content: {
                "application/msgpack": {
                    schema: z.object({
                        exp: z.number(),
                        token: z.string(),
                        user,
                    }),
                },
            },
        },
    },
});

registry.registerPath({
    method: "post",
    path: "/goodbye",
    operationId: "logout",
    summary: "Logout (invalidate token)",
    description: "Invalidate the current JWT token, ending the session.",
    tags: ["auth"],
    security: [{ [bearerAuth.name]: [] }],
    responses: { 200: { description: "Logged out" } },
});

// ── Token ───────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/token/{tokenType}",
    operationId: "getActionToken",
    summary: "Request an action token",
    description:
        "Request a scoped, time-limited action token for operations like registration, file upload, or device pairing.",
    tags: ["tokens"],
    request: {
        params: z.object({
            tokenType: z.enum([
                "register",
                "file",
                "avatar",
                "device",
                "invite",
                "emoji",
                "connect",
            ]),
        }),
    },
    responses: {
        200: {
            description: "Token issued",
            content: { "application/msgpack": { schema: actionToken } },
        },
    },
});

// ── Users ───────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/user/{id}",
    operationId: "getUser",
    summary: "Get user profile",
    description: "Retrieve the public profile for a user by their ID.",
    tags: ["users"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "User profile",
            content: { "application/msgpack": { schema: user } },
        },
        404: { description: "User not found" },
    },
});

registry.registerPath({
    method: "get",
    path: "/user/{id}/devices",
    operationId: "listUserDevices",
    summary: "List devices for a user",
    description:
        "List all registered devices for the given user, including signing keys and login timestamps.",
    tags: ["users"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "Device list",
            content: {
                "application/msgpack": { schema: z.array(device) },
            },
        },
    },
});

registry.registerPath({
    method: "get",
    path: "/user/{id}/servers",
    operationId: "listUserServers",
    summary: "List servers for a user",
    description: "List all chat servers the given user is a member of.",
    tags: ["users"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "Server list",
            content: {
                "application/msgpack": { schema: z.array(server) },
            },
        },
    },
});

registry.registerPath({
    method: "get",
    path: "/user/{id}/permissions",
    operationId: "listUserPermissions",
    summary: "Get permissions for a user",
    description:
        "List all permission grants for the given user across all resources.",
    tags: ["users"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "Permission list",
            content: {
                "application/msgpack": { schema: z.array(permission) },
            },
        },
    },
});

// ── Servers ──────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/server/{id}",
    operationId: "getServer",
    summary: "Get a server",
    description: "Retrieve details for a chat server by its ID.",
    tags: ["servers"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "Server details",
            content: { "application/msgpack": { schema: server } },
        },
    },
});

registry.registerPath({
    method: "post",
    path: "/server/{id}",
    operationId: "createServer",
    summary: "Create a server",
    description:
        "Create a new chat server. The path parameter is used as the server name.",
    tags: ["servers"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "Server created",
            content: { "application/msgpack": { schema: server } },
        },
    },
});

registry.registerPath({
    method: "delete",
    path: "/server/{id}",
    operationId: "deleteServer",
    summary: "Delete a server",
    description:
        "Permanently delete a chat server. Requires owner-level permissions.",
    tags: ["servers"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: { description: "Server deleted" },
        401: { description: "Insufficient permissions" },
    },
});

registry.registerPath({
    method: "get",
    path: "/server/{id}/channels",
    operationId: "listServerChannels",
    summary: "List channels in a server",
    description: "List all channels belonging to the given server.",
    tags: ["servers"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "Channel list",
            content: {
                "application/msgpack": { schema: z.array(channel) },
            },
        },
    },
});

registry.registerPath({
    method: "post",
    path: "/server/{id}/channels",
    operationId: "createChannel",
    summary: "Create a channel",
    description: "Create a new channel within the given server.",
    tags: ["servers"],
    security: [{ [bearerAuth.name]: [] }],
    request: {
        params: z.object({ id: z.string() }),
        body: {
            content: {
                "application/msgpack": {
                    schema: z.object({ name: z.string() }),
                },
            },
        },
    },
    responses: {
        200: {
            description: "Channel created",
            content: { "application/msgpack": { schema: channel } },
        },
    },
});

// ── Channels ────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/channel/{id}",
    operationId: "getChannel",
    summary: "Get a channel",
    description: "Retrieve details for a channel by its ID.",
    tags: ["channels"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: {
            description: "Channel details",
            content: { "application/msgpack": { schema: channel } },
        },
    },
});

registry.registerPath({
    method: "delete",
    path: "/channel/{id}",
    operationId: "deleteChannel",
    summary: "Delete a channel",
    description:
        "Permanently delete a channel. Requires sufficient permissions on the parent server.",
    tags: ["channels"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ id: z.string() }) },
    responses: {
        200: { description: "Channel deleted" },
        401: { description: "Insufficient permissions" },
    },
});

// ── Invites ─────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/invite/{inviteID}",
    operationId: "getInvite",
    summary: "Get invite details",
    description:
        "Retrieve details for a server invite, including expiration and target server.",
    tags: ["invites"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ inviteID: z.string() }) },
    responses: {
        200: {
            description: "Invite details",
            content: { "application/msgpack": { schema: invite } },
        },
        404: { description: "Invite not found or expired" },
    },
});

registry.registerPath({
    method: "patch",
    path: "/invite/{inviteID}",
    operationId: "acceptInvite",
    summary: "Accept an invite",
    description:
        "Accept a server invite, granting the authenticated user membership and returning the new permission grant.",
    tags: ["invites"],
    security: [{ [bearerAuth.name]: [] }],
    request: { params: z.object({ inviteID: z.string() }) },
    responses: {
        200: {
            description: "Invite accepted",
            content: { "application/msgpack": { schema: permission } },
        },
    },
});

// ── Health ───────────────────────────────────────────────────────────────────

registry.registerPath({
    method: "get",
    path: "/healthz",
    operationId: "healthCheck",
    summary: "Health check",
    description:
        "Returns server and database readiness status. Used by load balancers and monitoring.",
    tags: ["health"],
    responses: {
        200: {
            description: "Server health",
            content: {
                "application/json": {
                    schema: z.object({
                        dbReady: z.boolean(),
                        ok: z.boolean(),
                    }),
                },
            },
        },
    },
});

// ── Generate ────────────────────────────────────────────────────────────────

const generator = new OpenApiGeneratorV31(registry.definitions);
const doc = generator.generateDocument({
    openapi: "3.1.0",
    info: {
        title: "Vex Protocol API",
        version: packageVersion,
        description:
            "REST API for the Vex encrypted chat platform. Messages are serialized using msgpack.",
        license: { name: "AGPL-3.0-or-later" },
        contact: {
            name: "Vex Protocol",
            url: "https://github.com/vex-protocol/types-js",
        },
    },
    servers: [
        {
            url: "https://api.vex.wtf",
            description: "Production",
        },
        {
            url: "http://localhost:16777",
            description: "Local development",
        },
    ],
    tags: [
        { name: "auth", description: "Authentication and session management" },
        { name: "tokens", description: "Scoped action tokens" },
        {
            name: "users",
            description: "User profiles and associated resources",
        },
        { name: "servers", description: "Chat servers and channels" },
        { name: "channels", description: "Channel operations" },
        { name: "invites", description: "Server invitations" },
        { name: "health", description: "Health and readiness checks" },
    ],
});

writeFileSync("openapi.json", JSON.stringify(doc, null, 4) + "\n");
console.log(
    `Generated openapi.json with ${Object.keys(doc.paths ?? {}).length} paths`,
);
