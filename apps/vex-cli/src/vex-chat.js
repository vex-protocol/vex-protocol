#!/usr/bin/env node

import { Client } from "@vex-chat/libvex";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { unpack } from "msgpackr";

const DEFAULT_HOST = "api.vex.wtf";
const LOCAL_HOST = "127.0.0.1:16777";
const COLOR = process.env.NO_COLOR === undefined;
const ANSI = {
    blue: "\x1b[34m",
    bold: "\x1b[1m",
    cyan: "\x1b[36m",
    dim: "\x1b[2m",
    green: "\x1b[32m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    reset: "\x1b[0m",
    reverse: "\x1b[7m",
    yellow: "\x1b[33m",
};
const STATUS_ACTIVITY_TTL_MS = 5_000;

async function main() {
    const { flags, positionals } = parseArgs(process.argv.slice(2));
    let command = positionals.shift() ?? "chat";
    const ctx = await createContext(flags);
    try {
        if (!isCommand(command)) {
            positionals.unshift(command);
            command = "chat";
        }

        switch (command) {
            case "auth":
                await authCommand(ctx, positionals);
                break;
            case "register":
                await register(ctx, positionals);
                break;
            case "login":
                await login(ctx, positionals);
                break;
            case "whoami":
                await whoami(ctx, positionals);
                break;
            case "user":
                await withReadyClient(
                    ctx,
                    positionals,
                    async (client, args) => {
                        const identifier = requireArg(
                            args,
                            0,
                            "user identifier",
                        );
                        const [user, err] =
                            await client.users.retrieve(identifier);
                        if (!user) {
                            throw new Error(
                                err?.message ?? `User not found: ${identifier}`,
                            );
                        }
                        printUser(user);
                    },
                );
                break;
            case "dm":
                await dmCommand(ctx, positionals);
                break;
            case "server":
                await serverCommand(ctx, positionals);
                break;
            case "servers":
                await withReadyClient(ctx, positionals, async (client) => {
                    printServers(await client.servers.retrieve());
                });
                break;
            case "channels":
                await withReadyClient(
                    ctx,
                    positionals,
                    async (client, args) => {
                        const serverID = requireArg(args, 0, "server id");
                        printChannels(await client.channels.retrieve(serverID));
                    },
                );
                break;
            case "channel":
                await channelCommand(ctx, positionals);
                break;
            case "invite":
                await inviteCommand(ctx, positionals);
                break;
            case "group":
                await groupCommand(ctx, positionals);
                break;
            case "send":
                await sendCommand(ctx, positionals);
                break;
            case "chat":
                await chat(ctx, positionals);
                break;
            case "help":
            case "--help":
            case "-h":
                printHelp();
                break;
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    } finally {
        await closeDebugStream(ctx);
    }
}

function isCommand(command) {
    return [
        "--help",
        "-h",
        "auth",
        "channel",
        "channels",
        "chat",
        "dm",
        "group",
        "help",
        "invite",
        "login",
        "register",
        "send",
        "server",
        "servers",
        "user",
        "whoami",
    ].includes(command);
}

function parseArgs(argv) {
    const flags = {};
    const positionals = [];
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--") {
            continue;
        }
        if (!arg.startsWith("--")) {
            positionals.push(arg);
            continue;
        }
        const key = arg.slice(2);
        if (["debug", "http", "help", "local", "no-home"].includes(key)) {
            flags[key] = true;
            continue;
        }
        const next = argv[++i];
        if (!next) throw new Error(`Missing value for --${key}`);
        flags[key] = next;
    }
    return { flags, positionals };
}

async function createContext(flags) {
    const debugLevel = normalizeDebugLevel(
        flags["debug-level"] ??
            process.env.VEX_CHAT_DEBUG_LEVEL ??
            process.env.VEX_CHAT_DEBUG,
    );
    const debug = Boolean(flags.debug) || debugLevel !== "off";
    const local = Boolean(flags.local) || process.env.VEX_CHAT_LOCAL === "1";
    const host = String(
        local
            ? LOCAL_HOST
            : (flags.host ??
                  process.env.VEX_CHAT_HOST ??
                  process.env.API_HOST ??
                  hostFromApiUrl(process.env.API_URL) ??
                  DEFAULT_HOST),
    );
    const unsafeHttp =
        local ||
        Boolean(flags.http) ||
        process.env.VEX_CHAT_HTTP === "1" ||
        httpFromApiUrl(process.env.API_URL) ||
        isLocalHost(host);
    if (unsafeHttp && !process.env.NODE_ENV) {
        process.env.NODE_ENV = "development";
    }
    const dataDir = path.resolve(
        String(
            flags["data-dir"] ??
                process.env.VEX_CHAT_DATA_DIR ??
                path.join(os.homedir(), ".vex-chat-cli"),
        ),
    );
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(dataDir, "db"), { recursive: true, mode: 0o700 });
    const activeDebugLevel =
        debug && debugLevel === "off" ? "debug" : debugLevel;
    const enableLibvexMailDebug =
        process.env.VEX_CHAT_LIBVEX_DEBUG === "1" ||
        shouldDebugAtLevel(activeDebugLevel, "trace");
    if (enableLibvexMailDebug && !process.env.LIBVEX_DEBUG_DM) {
        process.env.LIBVEX_DEBUG_DM = "1";
    }
    if (debug && !process.env.LIBVEX_DEBUG_LEVEL) {
        process.env.LIBVEX_DEBUG_LEVEL = activeDebugLevel;
    }
    const debugFile = debug ? resolveDebugFile(flags, dataDir) : null;
    if (debugFile) {
        await fs.mkdir(path.dirname(debugFile), {
            recursive: true,
            mode: 0o700,
        });
    }
    const debugStream = debugFile
        ? createWriteStream(debugFile, { flags: "a", mode: 0o600 })
        : null;
    const configPath = path.join(dataDir, "config.json");
    return {
        dataDir,
        configPath,
        clientOptions: {
            dbFolder: path.join(dataDir, "db"),
            deviceName: "vex-chat-cli",
            host,
            unsafeHttp,
            ...(flags["dev-key"] || process.env.DEV_API_KEY
                ? {
                      devApiKey: String(
                          flags["dev-key"] ?? process.env.DEV_API_KEY,
                      ),
                  }
                : {}),
        },
        username:
            flags.username || flags.user
                ? String(flags.username ?? flags.user).toLowerCase()
                : undefined,
        noHome: Boolean(flags["no-home"]),
        password: flags.password ? String(flags.password) : undefined,
        debug,
        debugFile,
        debugLevel: debug ? activeDebugLevel : "off",
        debugStream,
        sound: normalizeSound(
            flags.sound ?? process.env.VEX_CHAT_SOUND ?? "Glass",
        ),
    };
}

function resolveDebugFile(flags, dataDir) {
    const explicit = flags["debug-file"] ?? process.env.VEX_CHAT_DEBUG_FILE;
    if (explicit) {
        return path.resolve(String(explicit));
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    return path.join(dataDir, "logs", `vex-debug-${stamp}.log`);
}

async function closeDebugStream(ctx) {
    if (!ctx?.debugStream) return;
    await new Promise((resolve) => ctx.debugStream.end(resolve));
}

function normalizeDebugLevel(value) {
    const raw = String(value ?? "")
        .trim()
        .toLowerCase();
    if (!raw || ["0", "false", "off", "none"].includes(raw)) return "off";
    if (["1", "true", "debug", "verbose"].includes(raw)) return "debug";
    if (["2", "trace", "silly"].includes(raw)) return "trace";
    return "debug";
}

function isLocalHost(host) {
    const h = host.split(":")[0];
    return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

function normalizeSound(value) {
    const sound = String(value ?? "").trim();
    if (!sound || ["0", "false", "none", "off"].includes(sound.toLowerCase())) {
        return null;
    }
    return sound;
}

function hostFromApiUrl(raw) {
    if (!raw) return undefined;
    try {
        return new URL(raw).host;
    } catch {
        return raw;
    }
}

function httpFromApiUrl(raw) {
    if (!raw) return false;
    try {
        return new URL(raw).protocol === "http:";
    } catch {
        return true;
    }
}

async function register(ctx, args) {
    const username = (args[0] ?? ctx.username)?.toLowerCase();
    const password = args[1] ?? ctx.password;
    if (!username) {
        throw new Error("Usage: vex-chat register <username> [password]");
    }
    const config = await readConfig(ctx.configPath);
    if (config.accounts[username]) {
        throw new Error(
            `Local account already exists for ${username}. Use login or remove it from ${ctx.configPath}.`,
        );
    }
    const privateKey = Client.generateSecretKey();
    const client = await Client.create(privateKey, ctx.clientOptions);
    attachDebugClientEvents(ctx, client, `register:${username}`);
    try {
        const [, registerErr] = await client.register(username, password);
        if (registerErr) throw registerErr;
        await connectAndWait(client, ctx, `register:${username}`);
        config.accounts[username] = {
            deviceID: client.me.device().deviceID,
            privateKey,
            userID: client.me.user().userID,
            username,
        };
        config.lastUsername = username;
        await writeConfig(ctx.configPath, config);
        console.log(
            `${color("green", "registered")} ${color("green", username)}`,
        );
        printWhoami(client);
    } finally {
        await client.close().catch(() => {});
    }
}

async function login(ctx, args) {
    const username = (args[0] ?? ctx.username)?.toLowerCase();
    const password = args[1] ?? ctx.password;
    if (!username || !password) {
        throw new Error("Usage: vex-chat login <username> <password>");
    }
    const { client, config } = await makeClient(ctx, username);
    attachDebugClientEvents(ctx, client, `login:${username}`);
    try {
        const loginResult = await client.login(username, password);
        if (!loginResult.ok)
            throw new Error(loginResult.error ?? "Login failed.");
        await connectAndWait(client, ctx, `login:${username}`);
        config.accounts[username] = {
            deviceID: client.me.device().deviceID,
            privateKey: client.getKeys().private,
            userID: client.me.user().userID,
            username,
        };
        config.lastUsername = username;
        await writeConfig(ctx.configPath, config);
        console.log(
            `${color("green", "logged in")} ${color("green", username)}`,
        );
        printWhoami(client);
    } finally {
        await client.close().catch(() => {});
    }
}

async function authCommand(ctx, args) {
    const sub = args.shift() ?? "status";
    switch (sub) {
        case "register":
        case "signup":
            await register(ctx, args);
            return;
        case "login":
            if (args.length === 1 && !ctx.password) {
                await whoami(ctx, args);
                return;
            }
            await login(ctx, args);
            return;
        case "status":
        case "whoami":
            await whoami(ctx, args);
            return;
        case "accounts":
        case "list":
            await listAccounts(ctx);
            return;
        case "use":
            await useAccount(ctx, args);
            return;
        default:
            throw new Error(
                "Usage: vex auth register <username> | login <username> [password] | use <username> | accounts | status",
            );
    }
}

async function whoami(ctx, args) {
    const username = args[0];
    await withReadyClient(
        { ...ctx, username: username ?? ctx.username },
        [],
        async (client) => {
            printWhoami(client);
        },
    );
}

async function listAccounts(ctx) {
    const config = await readConfig(ctx.configPath);
    const names = Object.keys(config.accounts).sort();
    if (names.length === 0) {
        console.log(color("dim", "no local accounts"));
        return;
    }
    for (const name of names) {
        const marker = name === config.lastUsername ? "*" : " ";
        const account = config.accounts[name];
        console.log(
            `${color(marker === "*" ? "yellow" : "dim", marker)} ${color("green", name)} ${color("dim", `user=${account.userID}`)} ${color("dim", `device=${account.deviceID}`)}`,
        );
    }
}

async function useAccount(ctx, args) {
    const username = requireArg(args, 0, "username").toLowerCase();
    const config = await readConfig(ctx.configPath);
    if (!config.accounts[username]) {
        throw new Error(
            `No local account for ${username}. Run vex auth register ${username} first.`,
        );
    }
    config.lastUsername = username;
    await writeConfig(ctx.configPath, config);
    console.log(`${color("green", "using")} ${color("green", username)}`);
}

async function dmCommand(ctx, args) {
    const sub = args[0];
    if (sub === "send") {
        args.shift();
    }
    if (sub === "history") {
        args.shift();
        await withReadyClient(ctx, args, async (client, rest) => {
            const user = await resolveUser(client, requireArg(rest, 0, "user"));
            const history = await client.messages.retrieve(user.userID);
            printMessages(history);
        });
        return;
    }
    await withReadyClient(ctx, args, async (client, rest) => {
        const identifier = requireArg(rest, 0, "recipient");
        const message = rest.slice(1).join(" ").trim();
        if (!message) throw new Error("Message text is required.");
        const user = await resolveUser(client, identifier);
        await client.messages.send(user.userID, message);
        console.log(
            `${color("green", "sent dm to")} ${color("green", user.username)}`,
        );
    });
}

async function serverCommand(ctx, args) {
    const sub = args.shift() ?? "list";
    await withReadyClient(ctx, args, async (client, rest) => {
        if (sub === "list" || sub === "ls") {
            printServers(await client.servers.retrieve());
            return;
        }
        if (sub === "create") {
            const name = rest.join(" ").trim();
            if (!name) throw new Error("Usage: vex-chat server create <name>");
            const server = await client.servers.create(name);
            console.log(
                `${color("green", "created server")} ${color("blue", server.name)} ${color("dim", server.serverID)}`,
            );
            printChannels(await client.channels.retrieve(server.serverID));
            return;
        }
        if (sub === "delete") {
            await client.servers.delete(requireArg(rest, 0, "server id"));
            console.log(color("green", "server deleted"));
            return;
        }
        throw new Error(
            "Usage: vex server list | create <name> | delete <server-id>",
        );
    });
}

async function channelCommand(ctx, args) {
    const sub = args.shift() ?? "list";
    if (sub === "use") {
        await useChannel(ctx, args);
        return;
    }
    await withReadyClient(ctx, args, async (client, rest) => {
        if (sub === "list" || sub === "ls") {
            const serverID = requireArg(rest, 0, "server id");
            printChannels(await client.channels.retrieve(serverID));
            return;
        }
        if (sub === "history") {
            const channelID =
                rest[0] ?? (await readConfig(ctx.configPath)).lastChannel;
            if (!channelID)
                throw new Error(
                    "Missing channel id. Use vex channel use <channel-id> or pass one.",
                );
            printMessages(await client.messages.retrieveGroup(channelID));
            return;
        }
        if (sub === "create") {
            const serverID = requireArg(rest, 0, "server id");
            const name = rest.slice(1).join(" ").trim();
            if (!name) throw new Error("Channel name is required.");
            const channel = await client.channels.create(name, serverID);
            console.log(
                `${color("green", "created channel")} ${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)}`,
            );
            return;
        }
        throw new Error(
            "Usage: vex channel list <server-id> | create <server-id> <name> | use <channel-id> | history [channel-id]",
        );
    });
}

async function inviteCommand(ctx, args) {
    const sub = args.shift() ?? "list";
    await withReadyClient(ctx, args, async (client, rest) => {
        if (sub === "list" || sub === "ls") {
            const serverID = requireArg(rest, 0, "server id");
            const invites = await client.invites.retrieve(serverID);
            if (invites.length === 0) {
                console.log(color("dim", "no invites"));
                return;
            }
            for (const invite of invites) {
                console.log(
                    `${color("yellow", inviteLink(invite.inviteID))} ${color("dim", `server=${invite.serverID}`)} ${color("dim", `expires=${invite.expires}`)}`,
                );
            }
            return;
        }
        if (sub === "create") {
            const serverID = requireArg(rest, 0, "server id");
            const duration = rest[1] ?? "1h";
            const invite = await client.invites.create(serverID, duration);
            printInvite(invite);
            return;
        }
        if (sub === "redeem") {
            const inviteID = parseInviteID(requireArg(rest, 0, "invite id"));
            const permission = await client.invites.redeem(inviteID);
            console.log(
                `${color("green", "redeemed invite")} ${color("dim", `for ${permission.resourceType} ${permission.resourceID}`)}`,
            );
            return;
        }
        throw new Error(
            "Usage: vex invite list <server-id> | create <server-id> [duration] | redeem <invite-id>",
        );
    });
}

async function groupCommand(ctx, args) {
    const sub = args[0];
    if (sub === "send") {
        args.shift();
    }
    await sendCommand(ctx, args);
}

async function sendCommand(ctx, args) {
    await withReadyClient(ctx, args, async (client, rest) => {
        const config = await readConfig(ctx.configPath);
        let channelID = rest[0];
        let messageParts = rest.slice(1);
        if (messageParts.length === 0 && config.lastChannel) {
            channelID = config.lastChannel;
            messageParts = rest;
        }
        if (!channelID)
            throw new Error(
                "Missing channel id. Use vex channel use <channel-id> first, or pass one.",
            );
        const message = messageParts.join(" ").trim();
        if (!message) throw new Error("Message text is required.");
        await client.messages.group(channelID, message);
        console.log(
            `${color("green", "sent group message to")} ${color("cyan", channelID)}`,
        );
    });
}

async function useChannel(ctx, args) {
    const channelID = requireArg(args, 0, "channel id");
    await withReadyClient(ctx, [], async (client) => {
        const channel = await client.channels.retrieveByID(channelID);
        if (!channel) throw new Error(`Channel not found: ${channelID}`);
        const config = await readConfig(ctx.configPath);
        config.lastChannel = channel.channelID;
        config.lastServer = channel.serverID;
        await writeConfig(ctx.configPath, config);
        console.log(
            `${color("green", "using")} ${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)}`,
        );
    });
}

async function createServerInChat(ctx, client, state, name, rl) {
    const resolvedName = name || (rl ? await askText(rl, "server name") : "");
    if (!resolvedName) throw new Error("Server name is required.");
    debugLog(ctx, "server.create.start", { name: resolvedName });
    const server = await client.servers.create(resolvedName);
    const channels = await client.channels.retrieve(server.serverID);
    const channel = channels[0] ?? null;
    debugLog(ctx, "server.create.ok", {
        channelIDs: channels.map((item) => item.channelID),
        serverID: server.serverID,
        serverName: server.name,
    });
    const config = await readConfig(ctx.configPath);
    config.lastServer = server.serverID;
    await writeConfig(ctx.configPath, config);
    console.log(
        `${color("green", "created server")} ${color("blue", server.name)}`,
    );
    await refreshBuffers(client, state);
    if (channel) {
        await enterChannel(ctx, client, state, channel);
    }
}

async function createInviteInteractive(ctx, client, state, args, rl) {
    const config = await readConfig(ctx.configPath);
    let serverID =
        state.target?.type === "channel" && state.target.serverID
            ? state.target.serverID
            : config.lastServer;
    if (!serverID) {
        const server = await chooseServer(client, rl);
        if (!server) return;
        serverID = server.serverID;
    }
    const [first, second] = args;
    if (first && !looksLikeDuration(first)) {
        const user = await resolveUser(client, first);
        const duration = second ?? "1h";
        debugLog(ctx, "invite.dm.start", {
            duration,
            serverID,
            targetUserID: user.userID,
            targetUsername: user.username,
        });
        const invite = await client.invites.create(serverID, duration);
        await client.messages.send(
            user.userID,
            `Join ${state.target?.serverName ?? "my server"}: ${inviteLink(invite.inviteID)}`,
        );
        debugLog(ctx, "invite.dm.ok", {
            inviteID: invite.inviteID,
            targetUserID: user.userID,
        });
        console.log(
            `${color("green", "sent invite to")} ${color("magenta", user.username)}`,
        );
        return;
    }
    const duration = first ?? (await askText(rl, "duration", "1h"));
    debugLog(ctx, "invite.create.start", {
        duration: duration || "1h",
        serverID,
    });
    const invite = await client.invites.create(serverID, duration || "1h");
    debugLog(ctx, "invite.create.ok", { inviteID: invite.inviteID, serverID });
    printInvite(invite);
}

async function joinInviteInChat(ctx, client, state, rawInvite, rl) {
    const value = rawInvite || (await askText(rl, "invite code or link"));
    const inviteID = parseInviteID(value);
    debugLog(ctx, "invite.redeem.preview.start", { inviteID, raw: value });
    const preview = await fetchInvitePreview(client, inviteID);
    debugLog(ctx, "invite.redeem.preview.ok", {
        channelIDs: preview.channels.map((item) => item.channelID),
        inviteID,
        serverID: preview.server?.serverID,
        serverName: preview.server?.name,
    });
    printInvitePreview(preview);
    const answer = (await askText(rl, "join this server?", "Y"))
        .trim()
        .toLowerCase();
    if (answer && answer !== "y" && answer !== "yes") {
        console.log(color("dim", "cancelled"));
        return;
    }

    await redeemInviteInChat(ctx, client, state, inviteID, preview);
}

async function redeemInviteInChat(ctx, client, state, inviteID, preview) {
    debugLog(ctx, "invite.redeem.start", { inviteID });
    const permission = await client.invites.redeem(inviteID);
    const server =
        preview.server ??
        (await client.servers.retrieveByID(permission.resourceID));
    const channels =
        preview.channels.length > 0
            ? preview.channels
            : await client.channels
                  .retrieve(permission.resourceID)
                  .catch(() => []);
    console.log(
        `${color("green", "joined")} ${color("blue", server?.name ?? "server")}`,
    );
    debugLog(ctx, "invite.redeem.ok", {
        channelIDs: channels.map((item) => item.channelID),
        permissionResourceID: permission.resourceID,
        permissionResourceType: permission.resourceType,
        serverID: server?.serverID,
        serverName: server?.name,
    });
    await refreshBuffers(client, state);

    const channel =
        channels.find(
            (candidate) => candidate.name.toLowerCase() === "general",
        ) ??
        channels[0] ??
        null;
    if (channel) {
        await enterChannel(ctx, client, state, channel, server);
    } else {
        console.log(
            color(
                "dim",
                "No channels in this server yet. Use /nav when one is available.",
            ),
        );
    }
}

function queueInvitePrompt(ctx, client, state, rl, inviteID, preview) {
    if (!rl || state.pendingInvitePrompts?.has(inviteID)) return;
    if (!state.pendingInvitePrompts) state.pendingInvitePrompts = new Set();
    state.pendingInvitePrompts.add(inviteID);
    state.promptQueue = (state.promptQueue ?? Promise.resolve())
        .catch(() => {})
        .then(async () => {
            const serverName = preview.server?.name ?? "this server";
            renderChatLine(
                rl,
                state,
                `${color("yellow", "system")} ${formatInvitePreviewLine(preview)} ${color("dim", "- join? y/N")}`,
            );
            const answer = (await askText(rl, `join ${serverName}?`, "N"))
                .trim()
                .toLowerCase();
            clearSubmittedPrompt();
            if (answer !== "y" && answer !== "yes") {
                renderChatLine(
                    rl,
                    state,
                    `${color("yellow", "system")} ${color("dim", "invite dismissed")}`,
                );
                return;
            }
            await redeemInviteInChat(ctx, client, state, inviteID, preview);
        })
        .catch((err) => {
            debugLog(ctx, "invite.prompt.error", { error: err, inviteID });
            renderChatLine(
                rl,
                state,
                `${color("yellow", "system")} ${color("red", err instanceof Error ? err.message : String(err))}`,
            );
        })
        .finally(() => {
            state.pendingInvitePrompts.delete(inviteID);
            refreshPrompt(rl, state);
        });
}

async function fetchInvitePreview(client, inviteID) {
    try {
        const res = await client.http.get(
            `${client.getHost()}/invite/${inviteID}/preview`,
        );
        return unpack(new Uint8Array(res.data));
    } catch (err) {
        if (err?.response?.status !== 404) {
            throw err;
        }
        const res = await client.http.get(
            `${client.getHost()}/invite/${inviteID}`,
        );
        const invite = unpack(new Uint8Array(res.data));
        return { channels: [], invite, server: null };
    }
}

async function selectDmInChat(ctx, client, state, names, identifier, rl) {
    const resolvedIdentifier =
        identifier || (await askText(rl, "username or user id"));
    const user = await resolveUser(client, resolvedIdentifier);
    names.set(user.userID, user.username);
    markDmRead(state, user.userID);
    if (state.pendingDmJump?.userID === user.userID) {
        state.pendingDmJump = null;
    }
    state.target = { id: user.userID, label: user.username, type: "dm" };
    addWindow(state, state.target);
    await saveTarget(ctx, state.target);
    await enterDm(client, state, user);
    return user;
}

function bindKeypressShortcuts(ctx, client, state, names, rl) {
    if (!input.isTTY) return () => {};
    emitKeypressEvents(input, rl);
    const onKeypress = (_chunk, key = {}) => {
        if (key.name !== "tab" || !state.pendingDmJump) return;
        if ((rl.line ?? "").trim()) return;
        void jumpToPendingDm(ctx, client, state, names, rl);
    };
    input.on("keypress", onKeypress);
    return () => input.off("keypress", onKeypress);
}

async function jumpToPendingDm(ctx, client, state, names, rl) {
    const pending = state.pendingDmJump;
    if (!pending) return;
    rl.write(null, { ctrl: true, name: "u" });
    clearActivePrompt();
    try {
        await selectDmInChat(ctx, client, state, names, pending.userID, rl);
    } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
    } finally {
        safeSetPrompt(rl, promptFor(state));
        safePrompt(rl);
    }
}

async function enterDm(client, state, user) {
    clearScreen();
    renderHeader(state, client.me.user(), `@${user.username}`);
    console.log(
        color(
            "dim",
            "/user open DM  /inbox unread  /dm send  /join server  /channels open  /window switch  /help",
        ),
    );
    console.log("");
    const history = await client.messages.retrieve(user.userID);
    if (history.length === 0) {
        console.log(color("dim", "No local history yet."));
    } else {
        console.log(color("bold", "Recent history"));
        printMessages(history.slice(-30));
    }
    console.log("");
}

async function openInbox(ctx, client, state, names, rl) {
    const rows = await listDmRows(client, state, names);
    if (rows.length === 0) {
        console.log(
            color("dim", "Inbox empty. Use /user <username> to open a DM."),
        );
        return null;
    }
    const selected = await chooseItem(
        rl,
        "inbox",
        rows,
        (row) => renderDmChoice(row),
        {
            defaultIndex: defaultDmIndex(rows),
        },
    );
    if (!selected) return null;
    return selectDmInChat(ctx, client, state, names, selected.userID, rl);
}

async function listDmRows(client, state, names) {
    const byUser = new Map();
    for (const user of await client.users.familiars().catch(() => [])) {
        names.set(user.userID, user.username);
        byUser.set(user.userID, {
            userID: user.userID,
            username: user.username,
        });
    }
    for (const buffer of state.buffers ?? []) {
        if (buffer.type !== "dm") continue;
        byUser.set(buffer.id, {
            ...(byUser.get(buffer.id) ?? {}),
            userID: buffer.id,
            username: buffer.label,
        });
    }
    for (const [userID, activity] of state.dms ?? []) {
        byUser.set(userID, {
            ...(byUser.get(userID) ?? {}),
            ...activity,
            userID,
        });
    }
    const rows = [];
    for (const row of byUser.values()) {
        const username =
            row.username ?? (await cachedUsername(client, names, row.userID));
        rows.push({ ...row, username });
    }
    return rows.sort((a, b) => {
        const unreadDiff = (b.unread ?? 0) - (a.unread ?? 0);
        if (unreadDiff !== 0) return unreadDiff;
        return String(b.lastAt ?? "").localeCompare(String(a.lastAt ?? ""));
    });
}

function renderDmChoice(row) {
    const unread =
        row.unread > 0
            ? color("yellow", `${row.unread} unread`)
            : color("green", "read");
    const when = row.lastAt
        ? color("dim", formatMessageTime(row.lastAt))
        : color("dim", "no recent messages");
    const preview = row.lastMessage
        ? ` ${color("dim", truncateInline(row.lastMessage, 64))}`
        : "";
    return `${color("magenta", `@${row.username}`)} ${unread} ${when}${preview}`;
}

function defaultDmIndex(rows) {
    const unreadIndex = rows.findIndex((row) => row.unread > 0);
    return unreadIndex >= 0 ? unreadIndex : 0;
}

async function sendDmInChat(
    ctx,
    client,
    state,
    names,
    identifier,
    messageParts,
    rl,
) {
    const resolvedIdentifier =
        identifier || (await askText(rl, "username or user id"));
    const user = await resolveUser(client, resolvedIdentifier);
    names.set(user.userID, user.username);
    const message =
        messageParts.length > 0
            ? messageParts.join(" ")
            : await askText(rl, `message to ${user.username}`);
    if (!message) {
        console.log(color("dim", "cancelled"));
        return;
    }
    bumpActivity(state, "send");
    refreshPrompt(rl, state);
    debugLog(ctx, "message.send.dm.start", {
        message,
        targetUserID: user.userID,
        targetUsername: user.username,
    });
    await client.messages.send(user.userID, message);
    debugLog(ctx, "message.send.dm.ok", {
        message,
        targetUserID: user.userID,
        targetUsername: user.username,
    });
    markDmRead(state, user.userID);
    state.target = { id: user.userID, label: user.username, type: "dm" };
    addWindow(state, state.target);
    await saveTarget(ctx, state.target);
    await enterDm(client, state, user);
}

async function selectChannelInChat(ctx, client, state, rl) {
    const channel = await chooseChannel(client, rl);
    if (!channel) return null;
    await enterChannel(
        ctx,
        client,
        state,
        channel,
        channel.serverName ? { name: channel.serverName } : null,
    );
    return channel;
}

async function selectChannelByName(ctx, client, state, query, rl) {
    const channels = await listAllChannels(client);
    if (channels.length === 0) {
        console.log(
            color(
                "dim",
                "No channels. Use redeem <code> to accept an invite, or /create.",
            ),
        );
        return null;
    }
    const channel = query
        ? await chooseBestMatch(
              rl,
              "channel",
              channels,
              query,
              channelSearchText,
              renderChannelChoice,
          )
        : await chooseItem(rl, "channel", channels, renderChannelChoice);
    if (!channel) return null;
    await enterChannel(ctx, client, state, channel, {
        name: channel.serverName,
        serverID: channel.serverID,
    });
    return channel;
}

async function selectServerByName(ctx, client, state, query, rl) {
    const servers = await client.servers.retrieve();
    if (servers.length === 0) {
        console.log(
            color(
                "dim",
                "No servers. Use redeem <code> to accept an invite, or /create.",
            ),
        );
        return null;
    }
    const server = query
        ? await chooseBestMatch(
              rl,
              "server",
              servers,
              query,
              (item) => item.name,
              (item) => color("blue", item.name),
          )
        : await chooseItem(rl, "server", servers, (item) =>
              color("blue", item.name),
          );
    if (!server) return null;
    const channel = await defaultChannelFromServer(client, server);
    if (channel) {
        await enterChannel(ctx, client, state, channel, server);
    }
    return server;
}

async function navigateInChat(ctx, client, state, names, rl) {
    console.log(`${color("yellow", "1")}. ${color("cyan", "channel")}`);
    console.log(
        `${color("yellow", "2")}. ${color("magenta", "direct message")}`,
    );
    const answer = await askText(rl, "open");
    if (answer === "1" || answer.toLowerCase() === "channel") {
        await selectChannelInChat(ctx, client, state, rl);
    } else if (
        answer === "2" ||
        answer.toLowerCase() === "dm" ||
        answer.toLowerCase() === "direct message"
    ) {
        await selectDmInChat(ctx, client, state, names, "", rl);
    } else {
        console.log(color("dim", "cancelled"));
    }
}

async function chooseServer(client, rl) {
    const servers = await client.servers.retrieve();
    if (servers.length === 0) {
        console.log(
            color(
                "dim",
                "No servers yet. Use redeem <code> to accept an invite, or /create to make one.",
            ),
        );
        return null;
    }
    return chooseItem(rl, "server", servers, (server) =>
        color("blue", server.name),
    );
}

async function chooseChannel(client, rl) {
    const server = await chooseServer(client, rl);
    if (!server) return null;
    return chooseChannelFromServer(client, server, rl);
}

async function defaultChannelFromServer(client, server) {
    const channels = await client.channels.retrieve(server.serverID);
    if (channels.length === 0) {
        console.log(color("dim", "no channels"));
        return null;
    }
    return {
        ...channels[defaultChannelIndex(channels)],
        serverName: server.name,
    };
}

async function chooseChannelFromServer(client, server, rl) {
    const channels = await client.channels.retrieve(server.serverID);
    if (channels.length === 0) {
        console.log(color("dim", "no channels"));
        return null;
    }
    const detailRows = await Promise.all(
        channels.map(async (channel) => {
            try {
                const users = await client.channels.userList(channel.channelID);
                return { channel, members: users.length };
            } catch {
                return { channel, members: null };
            }
        }),
    );
    const row = await chooseItem(
        rl,
        "channel",
        detailRows,
        ({ channel, members }) => {
            const memberText =
                members === null
                    ? ""
                    : color(
                          "dim",
                          ` - ${members} member${members === 1 ? "" : "s"}`,
                      );
            return `${color("cyan", `#${channel.name}`)}${memberText}`;
        },
        {
            defaultIndex: defaultChannelIndex(
                detailRows.map((row) => row.channel),
            ),
        },
    );
    return row ? { ...row.channel, serverName: server.name } : null;
}

async function listAllChannels(client) {
    const channels = [];
    const servers = await client.servers.retrieve();
    for (const server of servers) {
        const serverChannels = await client.channels
            .retrieve(server.serverID)
            .catch(() => []);
        for (const channel of serverChannels) {
            channels.push({ ...channel, serverName: server.name });
        }
    }
    return channels;
}

async function chooseBestMatch(rl, label, items, query, searchText, render) {
    const needle = normalizeSearch(query);
    const matches = items.filter((item) =>
        normalizeSearch(searchText(item)).includes(needle),
    );
    if (matches.length === 1) {
        return matches[0];
    }
    if (matches.length > 1) {
        console.log(color("dim", `Multiple ${label}s matched "${query}".`));
        return chooseItem(rl, label, matches, render, {
            defaultIndex: defaultMatchIndex(label, matches),
        });
    }
    console.log(color("dim", `No ${label} matched "${query}".`));
    return chooseItem(rl, label, items, render, {
        defaultIndex: defaultMatchIndex(label, items),
    });
}

function channelSearchText(channel) {
    return `${channel.serverName ?? ""} ${channel.name} ${channel.serverName ?? ""}/${channel.name}`;
}

function renderChannelChoice(channel) {
    const server = channel.serverName ? `${channel.serverName}/` : "";
    return color("cyan", `${server}#${channel.name}`);
}

function normalizeSearch(value) {
    return String(value).trim().toLowerCase().replace(/^#/, "");
}

async function chooseItem(rl, label, items, render, options = {}) {
    const defaultIndex = Number.isInteger(options.defaultIndex)
        ? options.defaultIndex
        : 0;
    for (let i = 0; i < items.length; i++) {
        const marker = i === defaultIndex ? "*" : " ";
        console.log(
            `${color(marker === "*" ? "yellow" : "dim", marker)} ${color("yellow", i + 1)}. ${render(items[i])}`,
        );
    }
    const answer = await askText(
        rl,
        `${label} number`,
        String(defaultIndex + 1),
    );
    const index = answer ? Number.parseInt(answer, 10) - 1 : defaultIndex;
    const item = items[index];
    if (!item) {
        console.log(color("dim", "cancelled"));
        return null;
    }
    return item;
}

function defaultMatchIndex(label, items) {
    if (label !== "channel") return 0;
    return defaultChannelIndex(items);
}

function defaultChannelIndex(channels) {
    const index = channels.findIndex(
        (channel) => channel.name?.toLowerCase() === "general",
    );
    return index >= 0 ? index : 0;
}

async function refreshBuffers(client, state) {
    const existingDms = Array.isArray(state.buffers)
        ? state.buffers.filter((buffer) => buffer.type === "dm")
        : [];
    const buffers = [...existingDms];
    const servers = await client.servers.retrieve();
    for (const server of servers) {
        const channels = await client.channels.retrieve(server.serverID);
        for (const channel of channels) {
            buffers.push({
                id: channel.channelID,
                label: `#${channel.name}`,
                serverID: server.serverID,
                serverName: server.name,
                type: "channel",
            });
        }
    }
    state.buffers = buffers;
}

function addWindow(state, target) {
    if (!Array.isArray(state.buffers)) {
        state.buffers = [];
    }
    const index = state.buffers.findIndex((buffer) => buffer.id === target.id);
    if (index >= 0) {
        state.buffers[index] = { ...state.buffers[index], ...target };
        return;
    }
    state.buffers.unshift({ ...target });
}

function printWindows(state) {
    if (!state.buffers || state.buffers.length === 0) {
        console.log(
            color("dim", "No open chats. Use /join, /channels, or /user."),
        );
        return;
    }
    console.log(color("bold", "Windows"));
    for (let i = 0; i < state.buffers.length; i++) {
        const buffer = state.buffers[i];
        const marker = buffer.id === state.target?.id ? "*" : " ";
        console.log(
            `${color(marker === "*" ? "yellow" : "dim", marker)} ${color("yellow", i + 1)}. ${color(buffer.type === "dm" ? "magenta" : "cyan", targetLabel(buffer))}`,
        );
    }
}

async function switchBuffer(ctx, client, state, number) {
    if (!Number.isFinite(number)) {
        printWindows(state);
        return;
    }
    if (!state.buffers || state.buffers.length === 0) {
        await refreshBuffers(client, state);
    }
    const buffer = state.buffers[number - 1];
    if (!buffer) {
        console.log(color("red", `No window ${number}.`));
        printWindows(state);
        return;
    }
    if (buffer.type === "dm") {
        const user = await resolveUser(client, buffer.id);
        await selectDmInChat(
            ctx,
            client,
            state,
            new Map([[user.userID, user.username]]),
            user.username,
            null,
        );
    } else if (buffer.type === "channel") {
        const channel = await client.channels.retrieveByID(buffer.id);
        if (!channel) throw new Error(`Channel not found: ${buffer.id}`);
        await enterChannel(ctx, client, state, channel, {
            name: buffer.serverName,
            serverID: buffer.serverID,
        });
    }
}

async function printMembers(client, state) {
    if (state.target?.type !== "channel") {
        console.log(color("dim", "/members is available in channels."));
        return;
    }
    const users = await client.channels.userList(state.target.id);
    if (users.length === 0) {
        console.log(color("dim", "No visible members."));
        return;
    }
    console.log(
        `${color("bold", "Members in")} ${color("cyan", targetLabel(state.target))}`,
    );
    for (const user of users) {
        console.log(
            `  ${color("green", user.username)} ${color("dim", `(${shortID(user.userID)})`)}`,
        );
    }
}

async function openServerSelector(ctx, client, state, rl) {
    const servers = await client.servers.retrieve();
    if (servers.length === 0) {
        console.log(
            color(
                "dim",
                "No servers. Use redeem <code> to accept an invite, or /create.",
            ),
        );
        return;
    }
    const rows = await Promise.all(
        servers.map(async (server) => ({
            channels: await client.channels
                .retrieve(server.serverID)
                .catch(() => []),
            server,
        })),
    );
    const selected = await chooseItem(
        rl,
        "server",
        rows,
        ({ channels, server }) => {
            const marker =
                server.serverID === state.target?.serverID ? "* " : "";
            const channelText =
                channels.length === 1
                    ? "1 channel"
                    : `${channels.length} channels`;
            return `${color(server.serverID === state.target?.serverID ? "yellow" : "blue", `${marker}${server.name}`)} ${color("dim", channelText)}`;
        },
    );
    if (!selected) return;
    const channel = await defaultChannelFromServer(client, selected.server);
    if (channel) {
        await enterChannel(ctx, client, state, channel, selected.server);
    }
}

async function enterChannel(ctx, client, state, channel, server = null) {
    state.target = {
        id: channel.channelID,
        label: `#${channel.name}`,
        serverID: channel.serverID,
        serverName: server?.name,
        type: "channel",
    };
    await saveTarget(ctx, state.target);
    debugLog(ctx, "channel.enter", {
        channelID: channel.channelID,
        channelName: channel.name,
        serverID: channel.serverID,
        serverName: server?.name,
    });
    clearScreen();
    renderHeader(state, client.me.user(), state.target.label);
    console.log(
        color(
            "dim",
            "/join server  /servers browse  /channels open  /window switch  /user open DM  /inbox unread",
        ),
    );
    console.log("");
    const history = await client.messages.retrieveGroup(channel.channelID);
    if (history.length === 0) {
        console.log(color("dim", "No local history yet."));
    } else {
        console.log(color("bold", "Recent history"));
        printMessages(history.slice(-30));
    }
    console.log("");
}

async function chat(ctx, args) {
    const username =
        (args[0] ?? ctx.username)
            ? String(args[0] ?? ctx.username).toLowerCase()
            : undefined;
    const { account, client, config } = await authenticateOrRegister(
        ctx,
        username,
    );
    attachDebugClientEvents(ctx, client, `chat:${account.username}`);
    const state = {
        account,
        buffers: [],
        dms: new Map(),
        host: ctx.clientOptions.host,
        pendingDmJump: null,
        pendingInvitePrompts: new Set(),
        promptQueue: Promise.resolve(),
        renderedMessageKeys: new Map(),
        serverMemberCache: new Map(),
        status: {
            activity: "starting",
            lastActivityAt: Date.now(),
            network: "connecting",
        },
        target: config.lastTarget ?? null,
    };
    if (state.target?.type === "dm") {
        addWindow(state, state.target);
    }
    const names = new Map([[account.userID, account.username]]);
    let rl = null;

    client.on("message", async (message) => {
        bumpActivity(state, message.direction === "incoming" ? "recv" : "send");
        debugLog(ctx, "message.event", messageDebugPayload(message));
        if (shouldSkipRenderedMessage(state, message)) {
            debugLog(
                ctx,
                "message.event.skip.rendered",
                messageDebugPayload(message),
            );
            refreshPrompt(rl, state);
            return;
        }
        const route = await messageRoute(client, state, message);
        if (!message.group) {
            await recordDmActivity(client, state, names, message, route);
        }
        debugLog(ctx, "message.route", {
            ...messageDebugPayload(message),
            activeTarget: state.target,
            route,
        });
        if (!route.render) {
            if (message.direction === "incoming" && route.isDm) {
                playIncomingSound(ctx.sound);
                notifyIncomingDm(
                    await cachedUsername(client, names, message.authorID),
                );
            }
            refreshPrompt(rl, state);
            return;
        }
        if (!message.decrypted) {
            debugLog(
                ctx,
                "message.render.undecrypted",
                messageDebugPayload(message),
            );
            renderChatLine(rl, state, `[undecrypted] ${message.mailID}`);
            return;
        }
        const author = await cachedUsername(client, names, message.authorID);
        debugLog(ctx, "message.render", {
            ...messageDebugPayload(message),
            author,
            route,
        });
        if (
            message.direction === "incoming" &&
            route.isDm &&
            !route.isActiveDm
        ) {
            playIncomingSound(ctx.sound);
            notifyIncomingDm(author);
            renderDmReceiptLine(rl, state, author);
            refreshPrompt(rl, state);
            return;
        }
        const inviteID =
            message.direction === "incoming" && message.decrypted
                ? extractInviteID(message.message)
                : null;
        let renderedMessage = message.message;
        let invitePreview = null;
        if (inviteID) {
            try {
                invitePreview = await fetchInvitePreview(client, inviteID);
                renderedMessage = replaceInviteLinkWithPreview(
                    message.message,
                    inviteID,
                    invitePreview,
                );
            } catch (err) {
                debugLog(ctx, "invite.preview.error", {
                    error: err,
                    inviteID,
                });
            }
        }
        renderChatLine(
            rl,
            state,
            formatMessageLine({
                direction: message.direction,
                isDm: route.isDm,
                message: renderedMessage,
                target: route.target,
                timestamp: message.timestamp,
                who: author,
            }),
        );
        if (message.direction === "incoming") {
            playIncomingSound(ctx.sound);
        }
        if (inviteID && invitePreview) {
            queueInvitePrompt(ctx, client, state, rl, inviteID, invitePreview);
        } else if (inviteID) {
            renderChatLine(
                rl,
                state,
                `${color("yellow", "system")} ${color("dim", `invite detected, type redeem ${inviteID} to inspect it`)}`,
            );
        }
        refreshPrompt(rl, state);
    });
    for (const [event, activity] of [
        ["connected", "online"],
        ["decryptingMail", "mail"],
        ["ready", "ready"],
        ["disconnect", "offline"],
    ]) {
        client.on(event, () => {
            bumpActivity(state, activity);
            refreshPrompt(rl, state);
        });
    }

    await connectAndWait(client, ctx, `chat:${account.username}`);
    await refreshBuffers(client, state);

    rl = createInterface({ input, output, prompt: promptFor(state) });
    const keypressCleanup = bindKeypressShortcuts(
        ctx,
        client,
        state,
        names,
        rl,
    );
    renderHeader(
        state,
        account,
        state.target ? targetLabel(state.target) : "Chat",
    );
    if (ctx.debugFile) {
        console.log(color("dim", `debug log ${ctx.debugFile}`));
    }
    if (state.target) {
        console.log(
            `${color("dim", state.target.type === "dm" ? "current DM" : "current channel")} ${color(state.target.type === "dm" ? "magenta" : "cyan", targetLabel(state.target))}`,
        );
    } else {
        console.log(
            color(
                "yellow",
                "No chat open yet. Use /join, /channels, /user, or /nav.",
            ),
        );
    }
    safeSetPrompt(rl, promptFor(state));
    safePrompt(rl);
    for await (const line of rl) {
        clearSubmittedPrompt();
        const trimmed = line.trim();
        try {
            if (!trimmed) {
                clearActivePrompt();
                safePrompt(rl);
                continue;
            }
            if (trimmed === "/quit" || trimmed === "/exit") break;
            if (trimmed === "/help") {
                printInteractiveHelp();
            } else if (trimmed === "/whoami") {
                printWhoami(client);
            } else if (trimmed === "/accounts") {
                await listAccounts(ctx);
            } else if (trimmed === "/servers") {
                await openServerSelector(ctx, client, state, rl);
            } else if (trimmed === "/server" || trimmed === "/join") {
                await selectServerByName(ctx, client, state, "", rl);
            } else if (trimmed.startsWith("/server ")) {
                await selectServerByName(
                    ctx,
                    client,
                    state,
                    trimmed.slice(8).trim(),
                    rl,
                );
            } else if (trimmed.startsWith("/join ")) {
                await selectServerByName(
                    ctx,
                    client,
                    state,
                    trimmed.slice(6).trim(),
                    rl,
                );
            } else if (trimmed === "/channels") {
                if (state.target?.type === "channel" && state.target.serverID) {
                    const server = {
                        name: state.target.serverName ?? "server",
                        serverID: state.target.serverID,
                    };
                    const channel = await chooseChannelFromServer(
                        client,
                        server,
                        rl,
                    );
                    if (channel)
                        await enterChannel(ctx, client, state, channel, server);
                } else {
                    await selectChannelByName(ctx, client, state, "", rl);
                }
            } else if (trimmed.startsWith("/channels ")) {
                console.log(
                    color(
                        "dim",
                        "Use /channels, then choose a channel by number.",
                    ),
                );
            } else if (trimmed === "/window") {
                await refreshBuffers(client, state);
                printWindows(state);
            } else if (trimmed.startsWith("/window ")) {
                const number = Number.parseInt(
                    splitWords(trimmed)[1] ?? "",
                    10,
                );
                await switchBuffer(ctx, client, state, number);
            } else if (
                trimmed === "/channel" ||
                trimmed.startsWith("/channel ")
            ) {
                console.log(color("dim", "Use /channels to choose a channel."));
            } else if (trimmed === "/create" || trimmed === "/create server") {
                await createServerInChat(ctx, client, state, "", rl);
            } else if (trimmed.startsWith("/create server ")) {
                const name = trimmed.slice(15).trim();
                await createServerInChat(ctx, client, state, name, rl);
            } else if (trimmed === "/dm") {
                await openInbox(ctx, client, state, names, rl);
            } else if (trimmed.startsWith("/dm ")) {
                const [identifier, ...messageParts] = splitWords(
                    trimmed.slice(4),
                );
                if (messageParts.length === 0) {
                    await selectDmInChat(
                        ctx,
                        client,
                        state,
                        names,
                        identifier,
                        rl,
                    );
                } else {
                    await sendDmInChat(
                        ctx,
                        client,
                        state,
                        names,
                        identifier,
                        messageParts,
                        rl,
                    );
                }
            } else if (trimmed.startsWith("dm ")) {
                const [identifier, ...messageParts] = splitWords(
                    trimmed.slice(3),
                );
                if (messageParts.length === 0) {
                    await selectDmInChat(
                        ctx,
                        client,
                        state,
                        names,
                        identifier,
                        rl,
                    );
                } else {
                    await sendDmInChat(
                        ctx,
                        client,
                        state,
                        names,
                        identifier,
                        messageParts,
                        rl,
                    );
                }
            } else if (trimmed === "/to") {
                await selectDmInChat(ctx, client, state, names, "", rl);
            } else if (trimmed.startsWith("/to ")) {
                await selectDmInChat(
                    ctx,
                    client,
                    state,
                    names,
                    trimmed.slice(4).trim(),
                    rl,
                );
            } else if (trimmed === "/user") {
                await selectDmInChat(ctx, client, state, names, "", rl);
            } else if (trimmed.startsWith("/user ")) {
                await selectDmInChat(
                    ctx,
                    client,
                    state,
                    names,
                    trimmed.slice(6).trim(),
                    rl,
                );
            } else if (trimmed === "/nav") {
                await navigateInChat(ctx, client, state, names, rl);
            } else if (trimmed.startsWith("/nav ")) {
                console.log(
                    color("dim", "Use /nav, then choose a channel or DM."),
                );
            } else if (trimmed === "/inbox" || trimmed === "/dms") {
                await openInbox(ctx, client, state, names, rl);
            } else if (trimmed === "redeem" || trimmed === "/redeem") {
                await joinInviteInChat(ctx, client, state, "", rl);
            } else if (trimmed.startsWith("redeem ")) {
                await joinInviteInChat(
                    ctx,
                    client,
                    state,
                    trimmed.slice(7).trim(),
                    rl,
                );
            } else if (trimmed.startsWith("/redeem ")) {
                await joinInviteInChat(
                    ctx,
                    client,
                    state,
                    trimmed.slice(8).trim(),
                    rl,
                );
            } else if (
                trimmed === "/invite redeem" ||
                trimmed.startsWith("/invite redeem ")
            ) {
                console.log(
                    color(
                        "dim",
                        "Use redeem <invite-code-or-link> to accept a server invite.",
                    ),
                );
            } else if (
                trimmed === "/invite" ||
                trimmed.startsWith("/invite ")
            ) {
                const rest = splitWords(trimmed.slice(7));
                await createInviteInteractive(ctx, client, state, rest, rl);
            } else if (trimmed === "/members") {
                await printMembers(client, state);
            } else if (trimmed === "/names") {
                console.log(
                    color(
                        "dim",
                        "Use /members to list people in the current channel.",
                    ),
                );
            } else if (trimmed === "/history") {
                console.log(
                    color(
                        "dim",
                        "Recent history is shown when you open a chat.",
                    ),
                );
            } else if (state.target?.type === "dm") {
                bumpActivity(state, "send");
                refreshPrompt(rl, state);
                debugLog(ctx, "message.send.dm.current.start", {
                    message: trimmed,
                    targetUserID: state.target.id,
                    target: targetLabel(state.target),
                });
                await client.messages.send(state.target.id, trimmed);
                debugLog(ctx, "message.send.dm.current.ok", {
                    message: trimmed,
                    targetUserID: state.target.id,
                    target: targetLabel(state.target),
                });
            } else if (state.target?.type === "channel") {
                bumpActivity(state, "send");
                refreshPrompt(rl, state);
                debugLog(ctx, "message.send.group.start", {
                    channelID: state.target.id,
                    message: trimmed,
                    serverID: state.target.serverID,
                    target: targetLabel(state.target),
                });
                await client.messages.group(state.target.id, trimmed);
                debugLog(ctx, "message.send.group.ok", {
                    channelID: state.target.id,
                    message: trimmed,
                    serverID: state.target.serverID,
                    target: targetLabel(state.target),
                });
            } else {
                console.log(
                    color(
                        "yellow",
                        "No chat open. Use /join, /channels, /user, or /nav.",
                    ),
                );
            }
        } catch (err) {
            debugLog(ctx, "command.error", {
                error: err,
                input: trimmed,
                target: state.target,
            });
            console.error(err instanceof Error ? err.message : String(err));
        }
        clearActivePrompt();
        safeSetPrompt(rl, promptFor(state));
        safePrompt(rl);
    }
    rl.close();
    keypressCleanup();
    await client.close().catch(() => {});
}

async function withReadyClient(ctx, args, fn) {
    const username = (ctx.username ?? undefined) || undefined;
    const { client } = await authenticate(ctx, username);
    try {
        await connectAndWait(client, ctx, `command:${username ?? "current"}`);
        await fn(client, args);
    } finally {
        await client.close().catch(() => {});
    }
}

async function authenticate(ctx, explicitUsername) {
    const config = await readConfig(ctx.configPath);
    const username = (explicitUsername ?? config.lastUsername)?.toLowerCase();
    if (!username) {
        throw new Error(
            "No local account selected. Use --username or run register/login first.",
        );
    }
    const account = config.accounts[username];
    if (!account) {
        throw new Error(
            `No local account for ${username}. Run register/login first.`,
        );
    }
    const client = await Client.create(account.privateKey, ctx.clientOptions);
    attachDebugClientEvents(ctx, client, `auth:${username}`);
    const deviceErr = account.deviceID
        ? await client.loginWithDeviceKey(account.deviceID)
        : new Error("missing device id");
    if (deviceErr && ctx.password) {
        const loginResult = await client.login(username, ctx.password);
        if (!loginResult.ok)
            throw new Error(loginResult.error ?? "Login failed.");
    } else if (deviceErr) {
        throw new Error(
            `Device-key login failed for ${username}: ${deviceErr.message}. Retry with --password.`,
        );
    }
    return { account, client, config };
}

async function authenticateOrRegister(ctx, explicitUsername) {
    const config = await readConfig(ctx.configPath);
    const username = (explicitUsername ?? config.lastUsername)?.toLowerCase();
    if (username && config.accounts[username]) {
        return authenticate(ctx, username);
    }

    const rl = createInterface({ input, output });
    try {
        console.log("Welcome to vex.");
        const entered = (username ?? (await rl.question("username: ")))
            .trim()
            .toLowerCase();
        if (!entered) throw new Error("username is required");
        if (config.accounts[entered]) {
            return authenticate(ctx, entered);
        }
        const answer = (await rl.question(`register ${entered}? [Y/n] `))
            .trim()
            .toLowerCase();
        if (answer && answer !== "y" && answer !== "yes") {
            throw new Error("No local account selected.");
        }
        const privateKey = Client.generateSecretKey();
        const client = await Client.create(privateKey, ctx.clientOptions);
        attachDebugClientEvents(ctx, client, `register:${entered}`);
        const [, registerErr] = await client.register(entered);
        if (registerErr) throw registerErr;
        await connectAndWait(client, ctx, `register:${entered}`);
        const account = {
            deviceID: client.me.device().deviceID,
            privateKey,
            userID: client.me.user().userID,
            username: entered,
        };
        config.accounts[entered] = account;
        config.lastUsername = entered;
        await writeConfig(ctx.configPath, config);
        return { account, client, config };
    } finally {
        rl.close();
    }
}

async function makeClient(ctx, username) {
    const config = await readConfig(ctx.configPath);
    const account = config.accounts[username];
    const privateKey = account?.privateKey ?? Client.generateSecretKey();
    const client = await Client.create(privateKey, ctx.clientOptions);
    return { client, config };
}

async function connectAndWait(client, ctx = null, label = "client") {
    debugLog(ctx, "client.connect.start", { label });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            debugLog(ctx, "client.connect.timeout", { label });
            reject(new Error("Timed out waiting for client connection."));
        }, 20_000);
        client.once("connected", () => {
            clearTimeout(timer);
            debugLog(ctx, "client.connect.ok", { label });
            resolve();
        });
        client.connect().catch((err) => {
            clearTimeout(timer);
            debugLog(ctx, "client.connect.error", { error: err, label });
            reject(err);
        });
    });
}

function attachDebugClientEvents(ctx, client, label) {
    if (!ctx.debug || client.__vexCliDebugAttached) return;
    client.__vexCliDebugAttached = true;
    const base = () => {
        try {
            return {
                deviceID: client.me.device().deviceID,
                label,
                userID: client.me.user().userID,
                username: client.me.user().username,
            };
        } catch {
            return { label };
        }
    };
    for (const event of [
        "connected",
        "disconnect",
        "decryptingMail",
        "ready",
    ]) {
        client.on(event, () => debugLog(ctx, `client.${event}`, base()));
    }
    client.on("session", (session, user) =>
        debugLog(ctx, "client.session", {
            ...base(),
            peerDeviceID: session.deviceID,
            peerUserID: session.userID,
            peerUsername: user?.username,
            sessionID: session.sessionID,
        }),
    );
    client.on("retryRequest", (request) =>
        debugLog(ctx, "client.retryRequest", {
            ...base(),
            mailID: request?.mailID,
            source: request?.source,
        }),
    );
}

function debugLog(ctx, event, data = {}, level = "debug") {
    if (!ctx?.debug) return;
    if (!shouldDebugAtLevel(ctx.debugLevel, level)) return;
    if (
        isHeartbeatDebugEvent(event, data) &&
        !shouldDebugAtLevel(ctx.debugLevel, "trace")
    )
        return;
    const payload = {
        data,
        event,
        time: new Date().toISOString(),
    };
    const line = `[vex-cli:debug] ${JSON.stringify(payload, jsonReplacer)}\n`;
    if (ctx.debugStream) {
        ctx.debugStream.write(line);
        return;
    }
    process.stderr.write(line);
}

function shouldDebugAtLevel(current, needed) {
    const levels = { off: 0, debug: 1, trace: 2 };
    return (levels[current] ?? 0) >= (levels[needed] ?? 1);
}

function isHeartbeatDebugEvent(event, data) {
    if (/\b(?:ping|pong)\b/i.test(event)) return true;
    const type = typeof data?.type === "string" ? data.type : "";
    const messageType =
        typeof data?.message?.type === "string" ? data.message.type : "";
    return (
        type === "ping" ||
        type === "pong" ||
        messageType === "ping" ||
        messageType === "pong"
    );
}

function jsonReplacer(_key, value) {
    if (value instanceof Uint8Array) {
        return { bytes: value.length, hex: Buffer.from(value).toString("hex") };
    }
    if (value instanceof Error) {
        return { message: value.message, name: value.name, stack: value.stack };
    }
    return value;
}

function messageDebugPayload(message) {
    return {
        authorID: message.authorID,
        decrypted: message.decrypted,
        direction: message.direction,
        forward: message.forward,
        group: message.group,
        mailID: message.mailID,
        message: message.message,
        readerID: message.readerID,
        recipient: message.recipient,
        sender: message.sender,
        timestamp: message.timestamp,
    };
}

async function resolveUser(client, identifier) {
    if (!identifier) throw new Error("User identifier is required.");
    const [user, err] = await client.users.retrieve(identifier);
    if (!user) throw new Error(err?.message ?? `User not found: ${identifier}`);
    return user;
}

async function cachedUsername(client, cache, userID) {
    if (cache.has(userID)) return cache.get(userID);
    const [user] = await client.users.retrieve(userID);
    const name = user?.username ?? userID;
    cache.set(userID, name);
    return name;
}

async function readConfig(configPath) {
    try {
        const raw = await fs.readFile(configPath, "utf8");
        const parsed = JSON.parse(raw);
        return {
            ...parsed,
            accounts:
                parsed.accounts && typeof parsed.accounts === "object"
                    ? parsed.accounts
                    : {},
            lastChannel:
                typeof parsed.lastChannel === "string"
                    ? parsed.lastChannel
                    : undefined,
            lastServer:
                typeof parsed.lastServer === "string"
                    ? parsed.lastServer
                    : undefined,
            lastTarget: isTarget(parsed.lastTarget) ? parsed.lastTarget : null,
            lastUsername:
                typeof parsed.lastUsername === "string"
                    ? parsed.lastUsername
                    : undefined,
        };
    } catch {
        return { accounts: {}, lastTarget: null };
    }
}

async function writeConfig(configPath, config) {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", {
        mode: 0o600,
    });
}

function requireArg(args, index, name) {
    const value = args[index];
    if (!value) throw new Error(`Missing ${name}.`);
    return value;
}

function splitWords(value) {
    return value.trim().split(/\s+/).filter(Boolean);
}

async function askText(rl, label, fallback = "") {
    const suffix = fallback ? ` [${fallback}]` : "";
    let answer = "";
    try {
        answer = await rl.question(`${label}${suffix}: `);
    } catch (err) {
        if (
            !(err instanceof Error) ||
            !err.message.includes("readline was closed")
        ) {
            throw err;
        }
        return fallback;
    }
    return answer.trim() || fallback;
}

function looksLikeUUID(value) {
    return (
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            value,
        )
    );
}

function looksLikeDuration(value) {
    return (
        typeof value === "string" && /^\d+(?:ms|s|m|h|d|w|mo|y)?$/i.test(value)
    );
}

function parseInviteID(value) {
    const trimmed = value.trim();
    if (looksLikeUUID(trimmed)) return trimmed;
    const match = trimmed.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    if (!match) throw new Error(`Invalid invite: ${value}`);
    return match[0];
}

function extractInviteID(value) {
    const match = value.match(
        /vex:\/\/invite\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    );
    return match?.[1] ?? null;
}

function replaceInviteLinkWithPreview(message, inviteID, preview) {
    return message.replace(
        new RegExp(`vex://invite/${escapeRegExp(inviteID)}`, "i"),
        formatInvitePreviewLine(preview),
    );
}

function formatInvitePreviewLine(preview) {
    return `${color("yellow", "invite")} ${color("blue", preview.server?.name ?? "server")} ${formatInviteChannelSummary(preview.channels)} ${color("dim", `expires ${formatMessageTime(preview.invite.expiration)}`)}`;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function inviteLink(inviteID) {
    return `vex://invite/${inviteID}`;
}

function clearScreen() {
    output.write("\x1b[2J\x1b[3J\x1b[H");
}

function clearActivePrompt() {
    if (output.isTTY) {
        output.write("\r\x1b[2K");
    }
}

function clearSubmittedPrompt() {
    if (input.isTTY && output.isTTY) {
        output.write("\r\x1b[2K\x1b[1A\r\x1b[2K");
    }
}

async function messageRoute(client, state, message) {
    const isDm = !message.group;
    if (!isDm) {
        const isActiveChannel =
            state.target?.type === "channel" &&
            state.target.id === message.group;
        return {
            isActiveDm: false,
            isDm: false,
            reason: isActiveChannel ? "active-channel" : "other-channel",
            render: isActiveChannel,
            target: isActiveChannel
                ? targetLabel(state.target)
                : `#${shortID(message.group)}`,
        };
    }

    const peerID = dmPeerID(state, message);
    const isActiveDm =
        state.target?.type === "dm" && state.target.id === peerID;
    if (isActiveDm) {
        return {
            isActiveDm: true,
            isDm: true,
            reason: "active-dm",
            render: true,
            target: targetLabel(state.target),
        };
    }

    const canInlineInServer =
        state.target?.type === "channel" &&
        state.target.serverID &&
        peerID &&
        (await userSharesServer(client, state, state.target.serverID, peerID));

    return {
        isActiveDm: false,
        isDm: true,
        reason: canInlineInServer ? "server-scoped-dm" : "offscreen-dm",
        render: Boolean(canInlineInServer),
        target: "DM",
    };
}

function dmPeerID(state, message) {
    if (message.direction === "outgoing") {
        return message.readerID === state.account?.userID
            ? message.authorID
            : message.readerID;
    }
    return message.authorID;
}

async function recordDmActivity(client, state, names, message, route = null) {
    const userID = dmPeerID(state, message);
    if (!userID || userID === state.account?.userID) return;
    const username = await cachedUsername(client, names, userID);
    const existing = state.dms.get(userID) ?? {
        unread: 0,
        userID,
        username,
    };
    const isUnread =
        message.direction === "incoming" &&
        !(route?.isActiveDm ?? isActiveDm(state, userID));
    state.dms.set(userID, {
        ...existing,
        direction: message.direction,
        lastAt: message.timestamp ?? new Date().toISOString(),
        lastMessage: message.message,
        unread: isUnread ? (existing.unread ?? 0) + 1 : (existing.unread ?? 0),
        userID,
        username,
    });
    if (isUnread) {
        state.pendingDmJump = {
            lastAt: message.timestamp ?? new Date().toISOString(),
            userID,
            username,
        };
    }
}

function markDmRead(state, userID) {
    const existing = state.dms?.get(userID);
    if (!existing) return;
    state.dms.set(userID, { ...existing, unread: 0 });
    if (state.pendingDmJump?.userID === userID) {
        const next = nextUnreadDm(state);
        state.pendingDmJump = next
            ? {
                  lastAt: next.lastAt,
                  userID: next.userID,
                  username: next.username,
              }
            : null;
    }
}

function nextUnreadDm(state) {
    const rows = [...(state.dms?.values() ?? [])].filter(
        (row) => (row.unread ?? 0) > 0,
    );
    rows.sort((a, b) => new Date(b.lastAt ?? 0) - new Date(a.lastAt ?? 0));
    return rows[0] ?? null;
}

function isActiveDm(state, userID) {
    return state.target?.type === "dm" && state.target.id === userID;
}

async function userSharesServer(client, state, serverID, userID) {
    const key = `${serverID}:${userID}`;
    const cached = state.serverMemberCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.value;
    }
    const value = await serverHasUser(client, serverID, userID).catch(
        () => false,
    );
    state.serverMemberCache.set(key, { expiresAt: Date.now() + 30_000, value });
    return value;
}

async function serverHasUser(client, serverID, userID) {
    const channels = await client.channels.retrieve(serverID);
    for (const channel of channels) {
        const users = await client.channels
            .userList(channel.channelID)
            .catch(() => []);
        if (users.some((user) => user.userID === userID)) {
            return true;
        }
    }
    return false;
}

function color(name, value) {
    if (!COLOR) return String(value);
    return `${ANSI[name] ?? ""}${String(value)}${ANSI.reset}`;
}

async function saveTarget(ctx, target) {
    const config = await readConfig(ctx.configPath);
    config.lastTarget = target;
    if (target.type === "channel") {
        config.lastChannel = target.id;
        if (target.serverID) config.lastServer = target.serverID;
    }
    await writeConfig(ctx.configPath, config);
}

function isTarget(value) {
    return (
        typeof value === "object" &&
        value !== null &&
        (value.type === "dm" || value.type === "channel") &&
        typeof value.id === "string" &&
        typeof value.label === "string"
    );
}

function renderChatLine(rl, state, line) {
    const activeLine = rl?.line ?? "";
    const activeCursor = rl?.cursor ?? activeLine.length;
    clearActivePrompt();
    output.write(`${line}\n`);
    restoreActivePrompt(rl, state, activeLine, activeCursor);
}

function renderDmReceiptLine(rl, state, author) {
    const jump =
        state.pendingDmJump?.username === author
            ? color("dim", " - press Tab to open")
            : "";
    renderChatLine(
        rl,
        state,
        `${color("yellow", "system")} DM message received from ${color("magenta", `@${author}`)}${jump}`,
    );
}

function restoreActivePrompt(rl, state, line, cursor) {
    if (!rl || !input.isTTY || !output.isTTY) return;
    output.write(`${promptFor(state)}${line}`);
    const offset = line.length - cursor;
    if (offset > 0) {
        output.write(`\x1b[${offset}D`);
    }
}

function shouldSkipRenderedMessage(state, message) {
    const key = renderMessageKey(message);
    const now = Date.now();
    for (const [cachedKey, expiresAt] of state.renderedMessageKeys) {
        if (expiresAt <= now) {
            state.renderedMessageKeys.delete(cachedKey);
        }
    }
    if (state.renderedMessageKeys.has(key)) {
        return true;
    }
    state.renderedMessageKeys.set(key, now + 1_000);
    return false;
}

function renderMessageKey(message) {
    if (message.direction === "outgoing") {
        const target = message.group ?? message.readerID ?? "unknown";
        return `out:${message.authorID}:${target}:${message.message}`;
    }
    if (message.mailID) {
        return `mail:${message.mailID}`;
    }
    const target = message.group ?? message.readerID ?? "unknown";
    return `in:${message.authorID}:${target}:${message.timestamp}:${message.message}`;
}

function safePrompt(rl, preserveCursor = false) {
    try {
        rl.prompt(preserveCursor);
    } catch (err) {
        if (
            !(err instanceof Error) ||
            !err.message.includes("readline was closed")
        ) {
            throw err;
        }
    }
}

function safeSetPrompt(rl, prompt) {
    try {
        rl.setPrompt(prompt);
    } catch (err) {
        if (
            !(err instanceof Error) ||
            !err.message.includes("readline was closed")
        ) {
            throw err;
        }
    }
}

function refreshPrompt(rl, state) {
    if (!rl || !input.isTTY || !output.isTTY) return;
    safeSetPrompt(rl, promptFor(state));
    const activeLine = rl.line ?? "";
    const activeCursor = rl.cursor ?? activeLine.length;
    clearActivePrompt();
    restoreActivePrompt(rl, state, activeLine, activeCursor);
}

function promptFor(state) {
    const user = state.account?.username ?? "vex";
    const target = state.target ? targetLabel(state.target) : "no-channel";
    return `${statusBar(state)} ${color("green", user)} ${color(state.target?.type === "dm" ? "magenta" : "cyan", target)}${color("dim", " >")} `;
}

function statusBar(state) {
    const status = state.status ?? {};
    const recent =
        Date.now() - (status.lastActivityAt ?? 0) < STATUS_ACTIVITY_TTL_MS;
    const unread = totalUnreadDms(state);
    const network = status.network ?? "online";
    const activity = recent ? (status.activity ?? "idle") : "idle";
    const content = `${networkLabel(network)} ${formatUnreadCount(unread)} ${activityLabel(activity)}`;
    const tone = network === "offline" ? "red" : unread > 0 ? "yellow" : "dim";
    return color(tone, `[${content}]`);
}

function bumpActivity(state, activity = "net") {
    if (!state.status) {
        state.status = {
            activity: "",
            lastActivityAt: 0,
            network: "online",
        };
    }
    const mapped = statusActivity(activity);
    state.status.activity = mapped.activity;
    if (mapped.network) {
        state.status.network = mapped.network;
    }
    state.status.lastActivityAt = Date.now();
}

function statusActivity(activity) {
    switch (activity) {
        case "connect":
            return { activity: "connecting", network: "connecting" };
        case "online":
        case "ready":
            return { activity: "online", network: "online" };
        case "offline":
            return { activity: "offline", network: "offline" };
        case "mail":
            return { activity: "checking mail", network: "syncing" };
        case "recv":
            return { activity: "received", network: "online" };
        case "send":
            return { activity: "sending", network: "online" };
        default:
            return { activity, network: null };
    }
}

function networkLabel(network) {
    switch (network) {
        case "connecting":
            return "net";
        case "syncing":
            return "sync";
        case "offline":
            return "off";
        default:
            return "on";
    }
}

function activityLabel(activity) {
    switch (activity) {
        case "checking mail":
            return "mail";
        case "connecting":
            return "conn";
        case "received":
            return "recv";
        case "sending":
            return "send";
        case "offline":
            return "off";
        case "online":
            return "on";
        default:
            return "idle";
    }
}

function formatUnreadCount(unread) {
    if (unread <= 0) return "dm00";
    if (unread > 99) return "dm99+";
    return `dm${String(unread).padStart(2, "0")}`;
}

function totalUnreadDms(state) {
    let total = 0;
    for (const item of state.dms?.values() ?? []) {
        total += item.unread ?? 0;
    }
    return total;
}

function targetLabel(target) {
    if (target.type === "channel") {
        return target.serverName
            ? `${target.serverName}/${target.label}`
            : target.label;
    }
    return `@${target.label}`;
}

function shortID(id) {
    return id.slice(0, 8);
}

function renderHeader(state, user, title) {
    const username = user?.username ?? state.account?.username ?? "unknown";
    const host = state.host ?? "unknown-host";
    const target = state.target
        ? targetLabel(state.target)
        : "no chat selected";
    console.log(color("reverse", " vex chat "));
    console.log(
        `${color("bold", title)} ${color("dim", "|")} ${color("green", username)} ${color("dim", "on")} ${color("blue", host)} ${color("dim", "|")} ${color(state.target?.type === "dm" ? "magenta" : "cyan", target)}`,
    );
    console.log(
        color(
            "dim",
            "/nav /join /servers /channels /window /user /inbox /dm /invite redeem /members /help",
        ),
    );
}

function printWhoami(client) {
    const user = client.me.user();
    const device = client.me.device();
    console.log(`${color("green", "username")} ${user.username}`);
    console.log(`${color("green", "user    ")} ${user.userID}`);
    console.log(`${color("green", "device  ")} ${device.deviceID}`);
    console.log(`${color("green", "name    ")} ${device.name}`);
    console.log(`${color("green", "login   ")} ${device.lastLogin}`);
}

function printUser(user) {
    console.log(
        `${color("green", user.username)} ${color("dim", "user=")}${user.userID} ${color("dim", "signKey=")}${user.signKey}`,
    );
}

function printServers(servers) {
    if (servers.length === 0) {
        console.log(color("dim", "no servers"));
        return;
    }
    for (const server of servers) {
        console.log(color("blue", server.name));
    }
}

function printChannels(channels) {
    if (channels.length === 0) {
        console.log(color("dim", "no channels"));
        return;
    }
    for (const channel of channels) {
        console.log(
            `${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)} ${color("dim", `server=${channel.serverID}`)}`,
        );
    }
}

function printInvite(invite) {
    const link = inviteLink(invite.inviteID);
    console.log(`${color("green", "invite")} ${color("yellow", link)}`);
    console.log(
        `${color("dim", "expires")} ${invite.expiration ?? invite.expires}`,
    );
    console.log(
        `${color("dim", "share this link to invite someone to the server")}`,
    );
}

function printInvitePreview(preview) {
    console.log(color("bold", "Server invite"));
    const serverName =
        preview.server?.name ??
        "Server details unavailable until Spire is updated";
    console.log(
        `${color("blue", serverName)} ${formatInviteChannelSummary(preview.channels)}`,
    );
    console.log(
        `${color("dim", "expires")} ${formatMessageTime(preview.invite.expiration)}`,
    );
}

function formatInviteChannelSummary(channels) {
    if (!channels || channels.length === 0) {
        return color("dim", "- no channels");
    }
    const names = channels
        .slice(0, 3)
        .map((channel) => `#${channel.name}`)
        .join(", ");
    const extra = channels.length > 3 ? ` +${channels.length - 3} more` : "";
    return color("cyan", `- ${names}${extra}`);
}

function playIncomingSound(sound) {
    if (!sound) return;
    if (output.isTTY) {
        output.write("\x07");
    }
    const audioFile = resolveSoundFile(sound);
    if (!audioFile) return;
    const player = process.platform === "darwin" ? "afplay" : "paplay";
    execFile(player, [audioFile], { timeout: 2_000 }, () => {});
}

function resolveSoundFile(sound) {
    if (sound.includes("/") || sound.includes(".")) {
        return path.resolve(sound.replace(/^~/, os.homedir()));
    }
    if (process.platform === "darwin") {
        return `/System/Library/Sounds/${sound}.aiff`;
    }
    return null;
}

function notifyIncomingDm(author) {
    if (process.platform !== "darwin") {
        return;
    }
    const title = `DM from ${author}`;
    const body = "Press Tab in vex to open.";
    execFile(
        "osascript",
        [
            "-e",
            `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`,
        ],
        { timeout: 1_000 },
        () => {},
    );
}

function truncateInline(value, maxLength) {
    const clean = String(value).replace(/\s+/g, " ").trim();
    return clean.length > maxLength
        ? `${clean.slice(0, Math.max(0, maxLength - 3))}...`
        : clean;
}

function appleScriptString(value) {
    return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function printMessages(messages) {
    if (messages.length === 0) {
        console.log(color("dim", "no messages"));
        return;
    }
    for (const message of messages) {
        const target = message.group ? `#${shortID(message.group)}` : "DM";
        const who =
            message.direction === "outgoing"
                ? "you"
                : shortID(message.authorID);
        console.log(
            formatMessageLine({
                direction: message.direction,
                isDm: !message.group,
                message: message.message,
                target,
                timestamp: message.timestamp,
                who,
            }),
        );
    }
}

function formatMessageLine({
    direction,
    isDm = false,
    message,
    target,
    timestamp,
    who,
}) {
    const whoColor = direction === "outgoing" ? "green" : "yellow";
    const targetColor = isDm ? "magenta" : "cyan";
    return `${color("dim", formatMessageTime(timestamp))} ${color(targetColor, target)} ${color(whoColor, who)}${color("dim", ":")} ${message}`;
}

function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function printHelp() {
    console.log(`vex

Commands:
  vex                         open the live terminal chat app
  vex <username>              open as a specific local user
  vex chat [username]          open the live terminal chat app
  vex auth register <username>
  vex auth accounts
  vex auth use <username>
  vex whoami

Flags:
  --username <name>      local account to use
  --user <name>          alias for --username
  --password <password>  fallback password for login
  --host <host:port>     API host, default api.vex.wtf
  --local                connect to local Spire at 127.0.0.1:16777 over http/ws
  --http                 use http/ws
  --dev-key <key>        send x-dev-api-key
  --debug                write send/receive/connect diagnostics to a log file
  --debug-file <path>    debug log path, default under the CLI data dir
  --debug-level <level>  debug or trace; trace includes libvex mail details
  --data-dir <dir>       local CLI account and sqlite storage
  --sound <name-or-path> incoming message sound, default Glass; use off to disable

Once chat is open, type /help for chat commands.
`);
}

function printInteractiveHelp() {
    console.log(`${color("bold", "Chat commands")}

${color("cyan", "/nav")}                   open a channel or DM
${color("cyan", "Tab")}                    open the newest unread DM
${color("cyan", "/join [server]")}         choose a server, then a channel
${color("cyan", "/servers")}               browse your servers and open a channel
${color("cyan", "/channels")}              choose a channel
${color("cyan", "/window")}                list open chats
${color("cyan", "/window <number>")}       switch to an open chat
${color("cyan", "/user <user>")}           open a DM conversation
${color("cyan", "/inbox")}                 show DMs, unread counts, and recent senders
${color("cyan", "/dm")}                    alias for /inbox
${color("cyan", "/dm <user>")}             open a DM conversation
${color("cyan", "/dm <user> <message>")}   send a DM and open that conversation
${color("cyan", "/to <user>")}             open a DM conversation
${color("cyan", "/invite")}                create an invite for the current server
${color("cyan", "/invite <user>")}         send an invite link by DM
${color("cyan", "vex://invite/...")}       previews in chat and asks whether to join
${color("cyan", "redeem <code>")}          preview and accept a server invite
${color("cyan", "/create")}                create a server and enter #general
${color("cyan", "/members")}               list people in the current channel
${color("cyan", "/accounts")}              list local users
${color("cyan", "/whoami")}                show your login
${color("cyan", "/quit")}                  leave chat

Plain text sends to the current channel or DM.`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(
            color("red", err instanceof Error ? err.message : String(err)),
        );
        process.exit(1);
    });
