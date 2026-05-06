#!/usr/bin/env node

import { Client } from "@vex-chat/libvex";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const DEFAULT_HOST = "127.0.0.1:16777";
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

async function main() {
    const { flags, positionals } = parseArgs(process.argv.slice(2));
    let command = positionals.shift() ?? "chat";
    const ctx = await createContext(flags);
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
            await withReadyClient(ctx, positionals, async (client, args) => {
                const identifier = requireArg(args, 0, "user identifier");
                const [user, err] = await client.users.retrieve(identifier);
                if (!user) {
                    throw new Error(err?.message ?? `User not found: ${identifier}`);
                }
                printUser(user);
            });
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
            await withReadyClient(ctx, positionals, async (client, args) => {
                const serverID = requireArg(args, 0, "server id");
                printChannels(await client.channels.retrieve(serverID));
            });
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
        if (["http", "help", "no-home"].includes(key)) {
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
    const host = String(flags.host ?? process.env.API_HOST ?? hostFromApiUrl(process.env.API_URL) ?? DEFAULT_HOST);
    const unsafeHttp =
        Boolean(flags.http) ||
        process.env.VEX_CHAT_HTTP === "1" ||
        httpFromApiUrl(process.env.API_URL) ||
        isLocalHost(host);
    if (unsafeHttp && !process.env.NODE_ENV) {
        process.env.NODE_ENV = "development";
    }
    const dataDir = path.resolve(
        String(flags["data-dir"] ?? process.env.VEX_CHAT_DATA_DIR ?? path.join(os.homedir(), ".vex-chat-cli")),
    );
    await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(dataDir, "db"), { recursive: true, mode: 0o700 });
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
                ? { devApiKey: String(flags["dev-key"] ?? process.env.DEV_API_KEY) }
                : {}),
        },
        username: flags.username || flags.user ? String(flags.username ?? flags.user).toLowerCase() : undefined,
        noHome: Boolean(flags["no-home"]),
        password: flags.password ? String(flags.password) : undefined,
    };
}

function isLocalHost(host) {
    const h = host.split(":")[0];
    return h === "127.0.0.1" || h === "localhost" || h === "::1";
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
        throw new Error(`Local account already exists for ${username}. Use login or remove it from ${ctx.configPath}.`);
    }
    const privateKey = Client.generateSecretKey();
    const client = await Client.create(privateKey, ctx.clientOptions);
    try {
        const [, registerErr] = await client.register(username, password);
        if (registerErr) throw registerErr;
        await connectAndWait(client);
        config.accounts[username] = {
            deviceID: client.me.device().deviceID,
            privateKey,
            userID: client.me.user().userID,
            username,
        };
        config.lastUsername = username;
        await writeConfig(ctx.configPath, config);
        console.log(`${color("green", "registered")} ${color("green", username)}`);
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
    try {
        const loginResult = await client.login(username, password);
        if (!loginResult.ok) throw new Error(loginResult.error ?? "Login failed.");
        await connectAndWait(client);
        config.accounts[username] = {
            deviceID: client.me.device().deviceID,
            privateKey: client.getKeys().private,
            userID: client.me.user().userID,
            username,
        };
        config.lastUsername = username;
        await writeConfig(ctx.configPath, config);
        console.log(`${color("green", "logged in")} ${color("green", username)}`);
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
            throw new Error("Usage: vex auth register <username> | login <username> [password] | use <username> | accounts | status");
    }
}

async function whoami(ctx, args) {
    const username = args[0];
    await withReadyClient({ ...ctx, username: username ?? ctx.username }, [], async (client) => {
        printWhoami(client);
    });
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
        console.log(`${color(marker === "*" ? "yellow" : "dim", marker)} ${color("green", name)} ${color("dim", `user=${account.userID}`)} ${color("dim", `device=${account.deviceID}`)}`);
    }
}

async function useAccount(ctx, args) {
    const username = requireArg(args, 0, "username").toLowerCase();
    const config = await readConfig(ctx.configPath);
    if (!config.accounts[username]) {
        throw new Error(`No local account for ${username}. Run vex auth register ${username} first.`);
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
        console.log(`${color("green", "sent dm to")} ${color("green", user.username)}`);
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
            console.log(`${color("green", "created server")} ${color("blue", server.name)} ${color("dim", server.serverID)}`);
            printChannels(await client.channels.retrieve(server.serverID));
            return;
        }
        if (sub === "delete") {
            await client.servers.delete(requireArg(rest, 0, "server id"));
            console.log(color("green", "server deleted"));
            return;
        }
        throw new Error("Usage: vex server list | create <name> | delete <server-id>");
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
            const channelID = rest[0] ?? (await readConfig(ctx.configPath)).lastChannel;
            if (!channelID) throw new Error("Missing channel id. Use vex channel use <channel-id> or pass one.");
            printMessages(await client.messages.retrieveGroup(channelID));
            return;
        }
        if (sub === "create") {
            const serverID = requireArg(rest, 0, "server id");
            const name = rest.slice(1).join(" ").trim();
            if (!name) throw new Error("Channel name is required.");
            const channel = await client.channels.create(name, serverID);
            console.log(`${color("green", "created channel")} ${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)}`);
            return;
        }
        throw new Error("Usage: vex channel list <server-id> | create <server-id> <name> | use <channel-id> | history [channel-id]");
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
                console.log(`${color("yellow", inviteLink(invite.inviteID))} ${color("dim", `server=${invite.serverID}`)} ${color("dim", `expires=${invite.expires}`)}`);
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
            console.log(`${color("green", "redeemed invite")} ${color("dim", `for ${permission.resourceType} ${permission.resourceID}`)}`);
            return;
        }
        throw new Error("Usage: vex invite list <server-id> | create <server-id> [duration] | redeem <invite-id>");
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
        if (!channelID) throw new Error("Missing channel id. Use vex channel use <channel-id> first, or pass one.");
        const message = messageParts.join(" ").trim();
        if (!message) throw new Error("Message text is required.");
        await client.messages.group(channelID, message);
        console.log(`${color("green", "sent group message to")} ${color("cyan", channelID)}`);
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
        console.log(`${color("green", "using")} ${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)}`);
    });
}

async function createServerInChat(ctx, client, state, name, rl) {
    const resolvedName = name || (rl ? await askText(rl, "server name") : "");
    if (!resolvedName) throw new Error("Server name is required.");
    const server = await client.servers.create(resolvedName);
    const channels = await client.channels.retrieve(server.serverID);
    const channel = channels[0] ?? null;
    const config = await readConfig(ctx.configPath);
    config.lastServer = server.serverID;
    await writeConfig(ctx.configPath, config);
    console.log(`${color("green", "created server")} ${color("blue", server.name)}`);
    console.log(`${color("dim", "server")} ${server.serverID}`);
    await refreshBuffers(client, state);
    if (channel) {
        await enterChannel(ctx, client, state, channel);
    }
}

async function createInviteInChat(ctx, client, state, args) {
    const config = await readConfig(ctx.configPath);
    const first = args[0];
    const serverID =
        first && looksLikeUUID(first)
            ? first
            : state.target?.type === "channel" && state.target.serverID
              ? state.target.serverID
              : config.lastServer;
    const duration = first && looksLikeUUID(first) ? (args[1] ?? "1h") : (args[0] ?? "1h");
    if (!serverID) {
        throw new Error("No server selected. Use /create server <name> first, or /invite <server-id> [duration].");
    }
    const invite = await client.invites.create(serverID, duration);
    printInvite(invite);
}

async function createInviteInteractive(ctx, client, state, args, rl) {
    const config = await readConfig(ctx.configPath);
    let serverID = args.find((arg) => looksLikeUUID(arg));
    if (!serverID) {
        serverID =
            state.target?.type === "channel" && state.target.serverID
                ? state.target.serverID
                : config.lastServer;
    }
    if (!serverID) {
        const server = await chooseServer(client, rl);
        if (!server) return;
        serverID = server.serverID;
    }
    const durationArg = args.find((arg) => !looksLikeUUID(arg));
    const duration = durationArg ?? (await askText(rl, "duration", "1h"));
    const invite = await client.invites.create(serverID, duration || "1h");
    printInvite(invite);
}

async function selectDmInChat(ctx, client, state, names, identifier, rl) {
    const resolvedIdentifier = identifier || (await askText(rl, "username or user id"));
    const user = await resolveUser(client, resolvedIdentifier);
    names.set(user.userID, user.username);
    state.target = { id: user.userID, label: user.username, type: "dm" };
    await saveTarget(ctx, state.target);
    console.log(`${color("magenta", "dm")} ${color("green", user.username)}`);
    return user;
}

async function selectChannelInChat(ctx, client, state, channelID, rl) {
    let channel = null;
    if (channelID) {
        channel = await client.channels.retrieveByID(channelID);
        if (!channel) throw new Error(`Channel not found: ${channelID}`);
        const server = await client.servers.retrieveByID(channel.serverID).catch(() => null);
        if (server) {
            channel = { ...channel, serverName: server.name };
        }
    } else {
        channel = await chooseChannel(client, rl);
        if (!channel) return null;
    }
    await enterChannel(
        ctx,
        client,
        state,
        channel,
        channel.serverName ? { name: channel.serverName } : null,
    );
    return channel;
}

async function chooseServer(client, rl) {
    const servers = await client.servers.retrieve();
    if (servers.length === 0) {
        console.log(color("dim", "no servers yet"));
        return null;
    }
    return chooseItem(
        rl,
        "server",
        servers,
        (server) => `${server.name} (${shortID(server.serverID)})`,
    );
}

async function chooseChannel(client, rl) {
    const server = await chooseServer(client, rl);
    if (!server) return null;
    const channels = await client.channels.retrieve(server.serverID);
    if (channels.length === 0) {
        console.log(color("dim", "no channels"));
        return null;
    }
    const channel = await chooseItem(
        rl,
        "channel",
        channels,
        (channel) => `#${channel.name} (${shortID(channel.channelID)})`,
    );
    return channel ? { ...channel, serverName: server.name } : null;
}

async function chooseItem(rl, label, items, render) {
    for (let i = 0; i < items.length; i++) {
        console.log(`${color("yellow", i + 1)}. ${render(items[i])}`);
    }
    const answer = await askText(rl, `${label} number`);
    const index = Number.parseInt(answer, 10) - 1;
    const item = items[index];
    if (!item) {
        console.log(color("dim", "cancelled"));
        return null;
    }
    return item;
}

async function interactiveMenu(ctx, client, state, names, rl) {
    console.log(`1. DM someone
2. Join a channel
3. Create server
4. Create invite link
5. Redeem invite link
6. List servers
7. History
8. Who am I`);
    const choice = await askText(rl, "choose");
    switch (choice) {
        case "1":
            await selectDmInChat(ctx, client, state, names, "", rl);
            return;
        case "2":
            await selectChannelInChat(ctx, client, state, "", rl);
            return;
        case "3":
            await createServerInChat(ctx, client, state, "", rl);
            return;
        case "4":
            await createInviteInteractive(ctx, client, state, [], rl);
            return;
        case "5": {
            const invite = await askText(rl, "invite link or id");
            const permission = await client.invites.redeem(parseInviteID(invite));
            console.log(`${color("green", "redeemed invite")} ${color("dim", `for ${permission.resourceType} ${permission.resourceID}`)}`);
            return;
        }
        case "6":
            printServers(await client.servers.retrieve());
            return;
        case "7":
            await printCurrentHistory(client, state);
            return;
        case "8":
            printWhoami(client);
            return;
        default:
            console.log(color("dim", "cancelled"));
    }
}

async function printCurrentHistory(client, state) {
    if (!state.target) {
        console.log(color("yellow", "no target selected"));
    } else if (state.target.type === "dm") {
        printMessages(await client.messages.retrieve(state.target.id));
    } else {
        printMessages(await client.messages.retrieveGroup(state.target.id));
    }
}

async function refreshBuffers(client, state) {
    const buffers = [];
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

function printBuffers(state) {
    if (!state.buffers || state.buffers.length === 0) {
        console.log(color("dim", "No channel buffers. Use /create or /invite redeem."));
        return;
    }
    console.log(color("bold", "Buffers"));
    for (let i = 0; i < state.buffers.length; i++) {
        const buffer = state.buffers[i];
        const marker = buffer.id === state.target?.id ? "*" : " ";
        console.log(`${color(marker === "*" ? "yellow" : "dim", marker)} ${color("yellow", i + 1)}. ${color("cyan", targetLabel(buffer))} ${color("dim", `(${shortID(buffer.id)})`)}`);
    }
}

async function switchBuffer(ctx, client, state, number) {
    if (!Number.isFinite(number)) {
        printBuffers(state);
        return;
    }
    if (!state.buffers || state.buffers.length === 0) {
        await refreshBuffers(client, state);
    }
    const buffer = state.buffers[number - 1];
    if (!buffer) {
        console.log(color("red", `No buffer ${number}.`));
        printBuffers(state);
        return;
    }
    if (buffer.type === "channel") {
        const channel = await client.channels.retrieveByID(buffer.id);
        if (!channel) throw new Error(`Channel not found: ${buffer.id}`);
        await enterChannel(ctx, client, state, channel, {
            name: buffer.serverName,
            serverID: buffer.serverID,
        });
    }
}

async function printNames(client, state) {
    if (state.target?.type !== "channel") {
        console.log(color("dim", "/names is available in channel buffers."));
        return;
    }
    const users = await client.channels.userList(state.target.id);
    if (users.length === 0) {
        console.log(color("dim", "No visible members."));
        return;
    }
    console.log(`${color("bold", "Members in")} ${color("cyan", targetLabel(state.target))}`);
    for (const user of users) {
        console.log(`  ${color("green", user.username)} ${color("dim", `(${shortID(user.userID)})`)}`);
    }
}

async function showHome(ctx, client, state, account, rl) {
    clearScreen();
    renderHeader(state, account, "Home");
    console.log("");

    const servers = await client.servers.retrieve();
    if (servers.length === 0) {
        console.log(color("yellow", "No servers yet"));
        console.log("");
        console.log(color("bold", "Start here:"));
        console.log(`  ${color("cyan", "/create")}          create a server`);
        console.log(`  ${color("cyan", "/invite redeem")}   join a server from an invite link`);
        console.log(`  ${color("cyan", "/dm")}              start a direct message`);
        return;
    }

    console.log(color("bold", "Servers"));
    for (let i = 0; i < servers.length; i++) {
        const server = servers[i];
        const marker = server.serverID === state.target?.serverID ? "*" : " ";
        console.log(`${color(marker === "*" ? "yellow" : "dim", marker)} ${color("yellow", i + 1)}. ${color("blue", server.name)} ${color("dim", `(${shortID(server.serverID)})`)}`);
    }
    console.log("");
    console.log(color("dim", "Tip: /dm starts a direct message, /create makes a server, /quit exits."));
    const answer = await askText(rl, "select server number, or Enter to stay here", "");
    if (!answer) {
        return;
    }
    const index = Number.parseInt(answer, 10) - 1;
    const server = servers[index];
    if (!server) {
        console.log(color("dim", "No server selected."));
        return;
    }
    await showServer(ctx, client, state, server, rl);
}

async function showServer(ctx, client, state, server, rl) {
    clearScreen();
    const channels = await client.channels.retrieve(server.serverID);
    renderHeader(state, client.me.user(), server.name);
    console.log(`${color("dim", "server")} ${server.serverID}`);
    console.log("");

    if (channels.length === 0) {
        console.log(color("dim", "No channels."));
        return;
    }

    console.log(color("bold", "Channels"));
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
    for (let i = 0; i < detailRows.length; i++) {
        const { channel, members } = detailRows[i];
        const marker = channel.channelID === state.target?.id ? "*" : " ";
        const memberText = members === null ? "" : ` - ${members} member${members === 1 ? "" : "s"}`;
        console.log(`${color(marker === "*" ? "yellow" : "dim", marker)} ${color("yellow", i + 1)}. ${color("cyan", `#${channel.name}`)} ${color("dim", `(${shortID(channel.channelID)})`)}${color("dim", memberText)}`);
    }
    console.log("");
    console.log(color("dim", "Tip: choose a channel to enter chat, b goes back."));
    const answer = await askText(rl, "select channel number, b for back, or Enter to stay here", "");
    if (!answer) {
        return;
    }
    if (answer.toLowerCase() === "b") {
        await showHome(ctx, client, state, client.me.user(), rl);
        return;
    }
    const index = Number.parseInt(answer, 10) - 1;
    const row = detailRows[index];
    if (!row) {
        console.log(color("dim", "No channel selected."));
        return;
    }
    await enterChannel(ctx, client, state, row.channel, server);
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
    clearScreen();
    renderHeader(state, client.me.user(), state.target.label);
    console.log(`${color("dim", "channel")} ${channel.channelID}`);
    console.log(color("green", "You are in chat. Type a message and press Enter."));
    console.log(color("dim", "Commands: /home switch channel  /dm direct message  /invite invite link  /menu actions  /quit exit"));
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
    const username = (args[0] ?? ctx.username) ? String(args[0] ?? ctx.username).toLowerCase() : undefined;
    const { account, client, config } = await authenticateOrRegister(ctx, username);
    const state = {
        account,
        buffers: [],
        host: ctx.clientOptions.host,
        renderedMessageKeys: new Map(),
        target: config.lastTarget ?? null,
    };
    const names = new Map([[account.userID, account.username]]);
    let rl = null;

    client.on("message", async (message) => {
        if (shouldSkipRenderedMessage(state, message)) {
            return;
        }
        if (!message.decrypted) {
            renderChatLine(rl, state, `[undecrypted] ${message.mailID}`);
            return;
        }
        const author = await cachedUsername(client, names, message.authorID);
        const target =
            message.group && message.group === state.target?.id
                ? targetLabel(state.target)
                : message.group
                  ? `#${shortID(message.group)}`
                  : "dm";
        renderChatLine(
            rl,
            state,
            formatMessageLine({
                direction: message.direction,
                message: message.message,
                target,
                timestamp: message.timestamp,
                who: author,
            }),
        );
    });

    await connectAndWait(client);
    await refreshBuffers(client, state);

    rl = createInterface({ input, output, prompt: promptFor(state) });
    if (!ctx.noHome) {
        await showHome(ctx, client, state, account, rl);
    } else {
        renderHeader(state, account, "Chat");
        console.log(color("dim", "Type /home to pick a server/channel, /dm for DMs, /menu for actions."));
        if (state.target) {
            console.log(`${color("dim", "current target")} ${color(state.target.type === "dm" ? "magenta" : "cyan", targetLabel(state.target))}`);
        } else {
            console.log(color("yellow", "no target selected yet"));
        }
    }
    safeSetPrompt(rl, promptFor(state));
    safePrompt(rl);
    for await (const line of rl) {
        clearSubmittedPrompt();
        const trimmed = line.trim();
        try {
            if (!trimmed) {
                safePrompt(rl);
                continue;
            }
            if (trimmed === "/quit" || trimmed === "/exit") break;
            if (trimmed === "/help") {
                printInteractiveHelp();
            } else if (trimmed === "/home" || trimmed === "/servers") {
                await showHome(ctx, client, state, account, rl);
            } else if (trimmed === "/menu") {
                await interactiveMenu(ctx, client, state, names, rl);
            } else if (trimmed === "/whoami") {
                printWhoami(client);
            } else if (trimmed === "/me") {
                printWhoami(client);
            } else if (trimmed === "/clear") {
                clearScreen();
                renderHeader(state, account, state.target ? targetLabel(state.target) : "Chat");
            } else if (trimmed === "/accounts" || trimmed === "/users") {
                await listAccounts(ctx);
            } else if (trimmed === "/target") {
                console.log(state.target ? color(state.target.type === "dm" ? "magenta" : "cyan", targetLabel(state.target)) : color("yellow", "no target selected"));
            } else if (trimmed === "/buffers" || trimmed === "/windows" || trimmed === "/window") {
                await refreshBuffers(client, state);
                printBuffers(state);
            } else if (trimmed.startsWith("/buffer ") || trimmed.startsWith("/window ")) {
                const number = Number.parseInt(splitWords(trimmed)[1] ?? "", 10);
                await switchBuffer(ctx, client, state, number);
            } else if (trimmed === "/server list") {
                printServers(await client.servers.retrieve());
            } else if (trimmed === "/channels") {
                const server = await chooseServer(client, rl);
                if (server) printChannels(await client.channels.retrieve(server.serverID));
            } else if (trimmed.startsWith("/channels ")) {
                printChannels(await client.channels.retrieve(trimmed.slice(10).trim()));
            } else if (trimmed === "/create" || trimmed === "/new" || trimmed === "/create server") {
                await createServerInChat(ctx, client, state, "", rl);
            } else if (trimmed.startsWith("/create server ")) {
                const name = trimmed.slice(15).trim();
                await createServerInChat(ctx, client, state, name, rl);
            } else if (trimmed.startsWith("/create invite")) {
                const rest = splitWords(trimmed.slice(14));
                await createInviteInteractive(ctx, client, state, rest, rl);
            } else if (trimmed === "/to" || trimmed === "/dm") {
                await selectDmInChat(ctx, client, state, names, "", rl);
            } else if (trimmed.startsWith("/to ")) {
                const [identifier, ...messageParts] = splitWords(trimmed.slice(4));
                const user = await selectDmInChat(ctx, client, state, names, identifier, rl);
                if (messageParts.length > 0) {
                    const message = messageParts.join(" ");
                    await client.messages.send(user.userID, message);
                    console.log(color("green", `[sent] ${message}`));
                }
            } else if (trimmed.startsWith("/query ")) {
                const identifier = trimmed.slice(7).trim();
                await selectDmInChat(ctx, client, state, names, identifier, rl);
            } else if (trimmed.startsWith("/msg ")) {
                const [identifier, ...messageParts] = splitWords(trimmed.slice(5));
                const user = await resolveUser(client, identifier);
                names.set(user.userID, user.username);
                const message = messageParts.join(" ").trim();
                if (!message) {
                    state.target = { id: user.userID, label: user.username, type: "dm" };
                    await saveTarget(ctx, state.target);
                    console.log(`${color("magenta", "query")} ${color("green", user.username)}`);
                } else {
                    await client.messages.send(user.userID, message);
                    console.log(`${color("green", `[msg -> ${user.username}]`)} ${message}`);
                }
            } else if (trimmed === "/join" || trimmed === "/channel" || trimmed === "/channel use") {
                await selectChannelInChat(ctx, client, state, "", rl);
            } else if (trimmed.startsWith("/join ")) {
                const channelID = trimmed.slice(6).trim();
                await selectChannelInChat(ctx, client, state, channelID, rl);
            } else if (trimmed === "/channel create") {
                const server = await chooseServer(client, rl);
                if (server) {
                    const name = await askText(rl, "channel name");
                    if (!name) throw new Error("Channel name is required.");
                    const channel = await client.channels.create(name, server.serverID);
                    await refreshBuffers(client, state);
                    console.log(`${color("green", "created channel")} ${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)}`);
                }
            } else if (trimmed.startsWith("/channel create ")) {
                const [serverID, ...nameParts] = splitWords(trimmed.slice(16));
                const channel = await client.channels.create(nameParts.join(" "), serverID);
                await refreshBuffers(client, state);
                console.log(`${color("green", "created channel")} ${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)}`);
            } else if (trimmed.startsWith("/channel use ")) {
                const channelID = trimmed.slice(13).trim();
                await selectChannelInChat(ctx, client, state, channelID, rl);
            } else if (trimmed === "/server" || trimmed === "/server create") {
                await createServerInChat(ctx, client, state, "", rl);
            } else if (trimmed.startsWith("/server create ")) {
                const name = trimmed.slice(15).trim();
                await createServerInChat(ctx, client, state, name, rl);
            } else if (trimmed === "/invite redeem") {
                const invite = await askText(rl, "invite link or id");
                const permission = await client.invites.redeem(parseInviteID(invite));
                console.log(`${color("green", "redeemed invite")} ${color("dim", `for ${permission.resourceType} ${permission.resourceID}`)}`);
            } else if (trimmed.startsWith("/invite create ")) {
                const [serverID, duration = "1h"] = splitWords(trimmed.slice(15));
                const invite = await client.invites.create(serverID, duration);
                printInvite(invite);
            } else if (trimmed.startsWith("/invite redeem ")) {
                const permission = await client.invites.redeem(parseInviteID(trimmed.slice(15).trim()));
                console.log(`${color("green", "redeemed invite")} ${color("dim", `for ${permission.resourceType} ${permission.resourceID}`)}`);
            } else if (trimmed === "/invite" || trimmed.startsWith("/invite ")) {
                const rest = splitWords(trimmed.slice(7));
                await createInviteInteractive(ctx, client, state, rest, rl);
            } else if (trimmed.startsWith("/dm ")) {
                const [identifier, ...messageParts] = splitWords(trimmed.slice(4));
                const user = await selectDmInChat(ctx, client, state, names, identifier, rl);
                if (messageParts.length > 0) {
                    const message = messageParts.join(" ");
                    await client.messages.send(user.userID, message);
                    console.log(color("green", `[sent] ${message}`));
                } else {
                    console.log(`${color("magenta", "dm")} ${color("green", user.username)}`);
                }
            } else if (trimmed.startsWith("/group ")) {
                const [channelID, ...messageParts] = splitWords(trimmed.slice(7));
                const channel = await client.channels.retrieveByID(channelID);
                state.target = {
                    id: channelID,
                    label: channel ? `#${channel.name}` : `#${shortID(channelID)}`,
                    serverID: channel?.serverID,
                    type: "channel",
                };
                await saveTarget(ctx, state.target);
                if (messageParts.length > 0) {
                    const message = messageParts.join(" ");
                    await client.messages.group(channelID, message);
                    console.log(color("green", `[sent] ${message}`));
                } else {
                    console.log(`${color("green", "joined")} ${color("cyan", state.target.label)}`);
                }
            } else if (trimmed === "/names") {
                await printNames(client, state);
            } else if (trimmed === "/history") {
                await printCurrentHistory(client, state);
            } else if (state.target?.type === "dm") {
                await client.messages.send(state.target.id, trimmed);
            } else if (state.target?.type === "channel") {
                await client.messages.group(state.target.id, trimmed);
            } else {
                console.log(color("yellow", "No buffer selected. Use /home, /window, /join, or /query <user>."));
            }
        } catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
        }
        safeSetPrompt(rl, promptFor(state));
        safePrompt(rl);
    }
    rl.close();
    await client.close().catch(() => {});
}

async function withReadyClient(ctx, args, fn) {
    const username = (ctx.username ?? undefined) || undefined;
    const { client } = await authenticate(ctx, username);
    try {
        await connectAndWait(client);
        await fn(client, args);
    } finally {
        await client.close().catch(() => {});
    }
}

async function authenticate(ctx, explicitUsername) {
    const config = await readConfig(ctx.configPath);
    const username = (explicitUsername ?? config.lastUsername)?.toLowerCase();
    if (!username) {
        throw new Error("No local account selected. Use --username or run register/login first.");
    }
    const account = config.accounts[username];
    if (!account) {
        throw new Error(`No local account for ${username}. Run register/login first.`);
    }
    const client = await Client.create(account.privateKey, ctx.clientOptions);
    const deviceErr = account.deviceID ? await client.loginWithDeviceKey(account.deviceID) : new Error("missing device id");
    if (deviceErr && ctx.password) {
        const loginResult = await client.login(username, ctx.password);
        if (!loginResult.ok) throw new Error(loginResult.error ?? "Login failed.");
    } else if (deviceErr) {
        throw new Error(`Device-key login failed for ${username}: ${deviceErr.message}. Retry with --password.`);
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
        const entered = (username ?? (await rl.question("username: "))).trim().toLowerCase();
        if (!entered) throw new Error("username is required");
        if (config.accounts[entered]) {
            return authenticate(ctx, entered);
        }
        const answer = (await rl.question(`register ${entered}? [Y/n] `)).trim().toLowerCase();
        if (answer && answer !== "y" && answer !== "yes") {
            throw new Error("No local account selected.");
        }
        const privateKey = Client.generateSecretKey();
        const client = await Client.create(privateKey, ctx.clientOptions);
        const [, registerErr] = await client.register(entered);
        if (registerErr) throw registerErr;
        await connectAndWait(client);
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

async function connectAndWait(client) {
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for client connection.")), 20_000);
        client.once("connected", () => {
            clearTimeout(timer);
            resolve();
        });
        client.connect().catch((err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
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
            accounts: parsed.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {},
            lastChannel: typeof parsed.lastChannel === "string" ? parsed.lastChannel : undefined,
            lastServer: typeof parsed.lastServer === "string" ? parsed.lastServer : undefined,
            lastTarget: isTarget(parsed.lastTarget) ? parsed.lastTarget : null,
            lastUsername: typeof parsed.lastUsername === "string" ? parsed.lastUsername : undefined,
        };
    } catch {
        return { accounts: {}, lastTarget: null };
    }
}

async function writeConfig(configPath, config) {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
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
        if (!(err instanceof Error) || !err.message.includes("readline was closed")) {
            throw err;
        }
        return fallback;
    }
    return answer.trim() || fallback;
}

function looksLikeUUID(value) {
    return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function parseInviteID(value) {
    const trimmed = value.trim();
    if (looksLikeUUID(trimmed)) return trimmed;
    const match = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (!match) throw new Error(`Invalid invite: ${value}`);
    return match[0];
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
        output.write("\x1b[1A\r\x1b[2K");
    }
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

function renderChatLine(rl, line) {
    clearActivePrompt();
    output.write(`${line}\n`);
}

function safePrompt(rl, preserveCursor = false) {
    try {
        rl.prompt(preserveCursor);
    } catch (err) {
        if (!(err instanceof Error) || !err.message.includes("readline was closed")) {
            throw err;
        }
    }
}

function safeSetPrompt(rl, prompt) {
    try {
        rl.setPrompt(prompt);
    } catch (err) {
        if (!(err instanceof Error) || !err.message.includes("readline was closed")) {
            throw err;
        }
    }
}

function promptFor(state) {
    const user = state.account?.username ?? "vex";
    const bufferNumber = bufferIndex(state);
    const buffer = state.target ? targetLabel(state.target) : "no-buffer";
    return `${color("green", user)}${color("dim", "[")}${color("yellow", bufferNumber ?? "-")}${color("dim", ":")}${color(state.target?.type === "dm" ? "magenta" : "cyan", buffer)}${color("dim", "]")}> `;
}

function bufferIndex(state) {
    if (!state.target || !Array.isArray(state.buffers)) return null;
    const index = state.buffers.findIndex((buffer) => buffer.id === state.target.id);
    return index >= 0 ? index + 1 : null;
}

function targetLabel(target) {
    if (target.type === "channel") {
        return target.serverName ? `${target.serverName}/${target.label}` : target.label;
    }
    return `@${target.label}`;
}

function timeNow() {
    return new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function shortID(id) {
    return id.slice(0, 8);
}

function renderHeader(state, user, title) {
    const username = user?.username ?? state.account?.username ?? "unknown";
    const host = state.host ?? "unknown-host";
    const target = state.target ? targetLabel(state.target) : "no chat selected";
    console.log(color("reverse", " vex chat "));
    console.log(color("dim", "=".repeat(72)));
    const bufferNumber = bufferIndex(state);
    const bufferText = bufferNumber ? `buffer ${bufferNumber}` : "no buffer";
    console.log(`${color("bold", title)}  ${color("yellow", `(${bufferText})`)}`);
    console.log(`signed in as ${color("green", username)}  ${color("dim", "|")}  server ${color("blue", host)}  ${color("dim", "|")}  target ${color(state.target?.type === "dm" ? "magenta" : "cyan", target)}`);
    console.log(color("dim", "commands /window /join /query /msg /names /history /clear /help"));
    console.log(color("dim", "=".repeat(72)));
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
    console.log(`${color("green", user.username)} ${color("dim", "user=")}${user.userID} ${color("dim", "signKey=")}${user.signKey}`);
}

function printServers(servers) {
    if (servers.length === 0) {
        console.log(color("dim", "no servers"));
        return;
    }
    for (const server of servers) {
        console.log(`${color("blue", server.name)} ${color("dim", server.serverID)}`);
    }
}

function printChannels(channels) {
    if (channels.length === 0) {
        console.log(color("dim", "no channels"));
        return;
    }
    for (const channel of channels) {
        console.log(`${color("cyan", `#${channel.name}`)} ${color("dim", channel.channelID)} ${color("dim", `server=${channel.serverID}`)}`);
    }
}

function printInvite(invite) {
    const link = inviteLink(invite.inviteID);
    console.log(`${color("green", "invite")} ${color("yellow", link)}`);
    console.log(`${color("dim", "id")} ${invite.inviteID}`);
    console.log(`${color("dim", "server")} ${invite.serverID}`);
    console.log(`${color("dim", "expires")} ${invite.expires}`);
    console.log(`${color("dim", "redeem:")} /invite redeem ${link}`);
}

function printMessages(messages) {
    if (messages.length === 0) {
        console.log(color("dim", "no messages"));
        return;
    }
    for (const message of messages) {
        const target = message.group ? `#${shortID(message.group)}` : "dm";
        const who = message.direction === "outgoing" ? "you" : shortID(message.authorID);
        console.log(formatMessageLine({
            direction: message.direction,
            message: message.message,
            target,
            timestamp: message.timestamp,
            who,
        }));
    }
}

function formatMessageLine({ direction, message, target, timestamp, who }) {
    const dirColor = direction === "outgoing" ? "green" : "magenta";
    const targetColor = target === "dm" ? "magenta" : "cyan";
    return `${color("dim", `[${formatMessageTime(timestamp)}]`)} ${color(dirColor, direction.padEnd(8))} ${color(targetColor, target)} ${color("yellow", who)}${color("dim", ":")} ${message}`;
}

function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return date.toLocaleString([], {
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
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
  vex dm send <user> <message>
  vex server list
  vex server create <name>
  vex channel list <server-id>
  vex channel use <channel-id>
  vex send [channel-id] <message>
  vex invite create <server-id> [duration]
  vex invite redeem <invite-id-or-link>

Flags:
  --username <name>      local account to use
  --user <name>          alias for --username
  --password <password>  fallback password for login
  --host <host:port>     API host, default 127.0.0.1:16777
  --http                 use http/ws
  --dev-key <key>        send x-dev-api-key
  --data-dir <dir>       local CLI account and sqlite storage
  --no-home              skip startup server picker
`);
}

function printInteractiveHelp() {
    console.log(`IRC-ish basics

/window                      list channel buffers
/window <n>                  switch to buffer n
/buffer <n>                  same as /window <n>
/join                        choose a channel
/join <channel-id>           join channel by id
/query <user>                open a DM buffer
/msg <user> <message>        send a DM without switching
/names                       list visible members in current channel
/clear                       redraw current header
/home                        server and channel picker
/history                     recent local history

Plain text sends to the selected buffer.

/menu                         guided menu
/home                         server and channel picker
/accounts                     list local users
/dm                           choose a DM
/to                           choose a DM
/join                         choose a channel
/channels                     choose a server, then list channels
/create                       create a server and join #general
/invite                       create invite link for current server
/invite redeem                paste an invite link

/to <user> [message]          select a DM, optionally send
/join <channel-id>            select a channel by id
/create server <name>         create a server and join #general
/invite <server-id> [duration] create invite link for server
/servers
/channels <server-id>
/server create <name>
/channel create <server-id> <name>
/channel use <channel-id>
/invite create <server-id> [duration]
/invite redeem <invite-id-or-link>
/history
/target
/me
/whoami
/quit`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((err) => {
        console.error(color("red", err instanceof Error ? err.message : String(err)));
        process.exit(1);
    });
