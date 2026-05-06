import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vex-cli-diagnose-"));
const logDir = path.join(dataDir, "logs");
await fs.mkdir(logDir, { recursive: true });

const devKey = process.env.DEV_API_KEY ?? "vex-cli-diagnose";
const host = process.env.VEX_CHAT_HOST ?? "127.0.0.1:16777";
const count = Number.parseInt(process.env.VEX_DIAG_COUNT ?? "8", 10);
const common = [
    "--host",
    host,
    "--http",
    "--no-home",
    "--dev-key",
    devKey,
    "--data-dir",
    dataDir,
    "--sound",
    "off",
];

const suffix = Date.now().toString(36);
const users = [`alice${suffix}`, `bob${suffix}`, `cara${suffix}`];
const logs = new Map();
const children = new Map();

function append(name, stream, chunk) {
    const text = String(chunk);
    logs.set(name, `${logs.get(name) ?? ""}${text}`);
    void fs.appendFile(path.join(logDir, `${name}.${stream}.log`), text);
}

function run(args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("pnpm", ["--filter", "@vex-chat/cli", "start", "--", ...common, ...args], {
            cwd: root,
            env: {
                ...process.env,
                DEV_API_KEY: devKey,
                LIBVEX_DEBUG_DM: process.env.LIBVEX_DEBUG_DM ?? "1",
                NODE_ENV: process.env.NODE_ENV ?? "test",
            },
            stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const name = opts.name ?? args.join("-");
        child.stdout.on("data", (chunk) => {
            stdout += String(chunk);
            append(name, "stdout", chunk);
            opts.onStdout?.(String(chunk));
        });
        child.stderr.on("data", (chunk) => {
            stderr += String(chunk);
            append(name, "stderr", chunk);
            opts.onStderr?.(String(chunk));
        });
        child.on("exit", (code, signal) => {
            if (code === 0) resolve({ stdout, stderr });
            else if (opts.allowTerminate && signal === "SIGTERM") resolve({ stdout, stderr });
            else reject(new Error(`command failed ${args.join(" ")}\n${stdout}\n${stderr}`));
        });
        opts.onChild?.(child);
    });
}

for (const user of users) {
    await run(["register", user], { name: `register-${user}` });
}

for (const user of users) {
    const ready = waitFor((resolve) => {
        void run(["chat", user], {
            allowTerminate: true,
            name: user,
            onChild: (child) => {
                children.set(user, child);
            },
            onStdout: (chunk) => {
                if (chunk.toLowerCase().includes("/nav")) resolve();
            },
        }).catch((err) => {
            throw err;
        });
    }, `ready ${user}`);
    await ready;
}

const [alice, bob, cara] = users;
children.get(alice).stdin.write("/create server diag\n");
await waitUntil(() => seen(alice).includes("created server diag"), "server create");
children.get(alice).stdin.write("/invite 1h\n");
await waitUntil(() => seen(alice).includes("vex://invite/"), "invite create");
const inviteID = seen(alice).match(/vex:\/\/invite\/([0-9a-f-]{36})/)?.[1];
if (!inviteID) throw new Error(`Could not parse invite from ${path.join(logDir, `${alice}.stdout.log`)}`);

for (const user of [bob, cara]) {
    children.get(user).stdin.write(`redeem vex://invite/${inviteID}\n`);
}
for (const user of [bob, cara]) {
    await waitUntil(() => seen(user).includes("join this server"), `${user} join prompt`);
    children.get(user).stdin.write("y\n");
    await waitUntil(() => seen(user).includes("joined diag"), `${user} joined`);
}

for (const user of users) {
    children.get(user).stdin.write("/join diag\n");
    await waitUntil(() => seen(user).includes("channel number"), `${user} channel picker`);
    children.get(user).stdin.write("\n");
    await sleep(250);
}

const expected = [];
for (let i = 0; i < count; i++) {
    for (const user of users) {
        const token = `diag-${i}-${user}`;
        expected.push({ token, user });
        children.get(user).stdin.write(`${token}\n`);
        await sleep(75);
    }
}

await sleep(Number.parseInt(process.env.VEX_DIAG_SETTLE_MS ?? "12000", 10));

const missing = [];
for (const receiver of users) {
    const text = seen(receiver);
    for (const { token } of expected) {
        if (!text.includes(token)) {
            missing.push({ receiver, token });
        }
    }
}

for (const child of children.values()) {
    child.stdin.write("/quit\n");
    child.kill("SIGTERM");
}

const summary = {
    count,
    dataDir,
    expected: expected.length,
    logDir,
    missing,
    users,
};
console.log(JSON.stringify(summary, null, 2));
if (missing.length > 0) {
    process.exitCode = 1;
}

function seen(user) {
    return logs.get(user) ?? "";
}

function waitFor(setup, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out: ${label}`)), 30_000);
        setup(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

async function waitUntil(predicate, label) {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
