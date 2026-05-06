import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "vex-cli-smoke-"));
const devKey = process.env.DEV_API_KEY ?? "vex-cli-smoke";
const common = [
    "--host",
    process.env.VEX_CHAT_HOST ?? "127.0.0.1:16777",
    "--http",
    "--no-home",
    "--dev-key",
    devKey,
    "--data-dir",
    dataDir,
];

function run(args, opts = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn("pnpm", ["--filter", "@vex-chat/cli", "start", "--", ...common, ...args], {
            cwd: root,
            env: { ...process.env, DEV_API_KEY: devKey, NODE_ENV: process.env.NODE_ENV ?? "test" },
            stdio: opts.stdio ?? ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk) => {
            stdout += chunk;
            opts.onStdout?.(String(chunk));
        });
        child.stderr?.on("data", (chunk) => {
            stderr += chunk;
            opts.onStderr?.(String(chunk));
        });
        child.on("exit", (code) => {
            if (code === 0) resolve({ stdout, stderr });
            else if (opts.allowTerminate && child.signalCode === "SIGTERM") resolve({ stdout, stderr });
            else reject(new Error(`command failed ${args.join(" ")}\n${stdout}\n${stderr}`));
        });
        opts.onChild?.(child);
    });
}

const suffix = Date.now().toString(36);
const users = [`alice${suffix}`, `bob${suffix}`, `cara${suffix}`];
for (const user of users) {
    await run(["register", user]);
}

let aliceChild;
let bobChild;
let caraChild;
const aliceSeen = [];
const bobSeen = [];
const caraSeen = [];

const aliceReady = waitFor((resolve) => {
    void run(["chat", users[0]], {
        allowTerminate: true,
        onChild: (child) => {
            aliceChild = child;
        },
        onStdout: (chunk) => {
            aliceSeen.push(chunk);
            if (chunk.toLowerCase().includes("/menu")) resolve();
        },
    }).catch((err) => {
        throw err;
    });
});
const bobReady = waitFor((resolve) => {
    void run(["chat", users[1]], {
        allowTerminate: true,
        onChild: (child) => {
            bobChild = child;
        },
        onStdout: (chunk) => {
            bobSeen.push(chunk);
            if (chunk.toLowerCase().includes("/menu")) resolve();
        },
    }).catch((err) => {
        throw err;
    });
});
const caraReady = waitFor((resolve) => {
    void run(["chat", users[2]], {
        allowTerminate: true,
        onChild: (child) => {
            caraChild = child;
        },
        onStdout: (chunk) => {
            caraSeen.push(chunk);
            if (chunk.toLowerCase().includes("/menu")) resolve();
        },
    }).catch((err) => {
        throw err;
    });
});
await Promise.all([aliceReady, bobReady, caraReady]);

aliceChild.stdin.write(`/to ${users[1]}\n`);
aliceChild.stdin.write("hello-bob\n");
await waitUntil(() => bobSeen.join("").includes("hello-bob"), "bob dm");

aliceChild.stdin.write("/create server smoke\n");
await waitUntil(() => aliceSeen.join("").includes("created server smoke"), "server create");
const createdOutput = aliceSeen.join("");
const serverID = createdOutput.match(/server ([0-9a-f-]{36})/)?.[1];
const channelID =
    createdOutput.match(/joined #\S+ ([0-9a-f-]{36})/)?.[1] ??
    createdOutput.match(/channel ([0-9a-f-]{36})/)?.[1];
if (!serverID || !channelID) throw new Error(`Could not parse server/channel:\n${createdOutput}`);

aliceChild.stdin.write("/invite 1h\n");
await waitUntil(() => aliceSeen.join("").includes("vex://invite/"), "invite create");
const inviteID = aliceSeen.join("").match(/vex:\/\/invite\/([0-9a-f-]{36})/)?.[1];
if (!inviteID) throw new Error(`Could not parse invite:\n${aliceSeen.join("")}`);

bobChild.stdin.write(`/invite redeem vex://invite/${inviteID}\n`);
caraChild.stdin.write(`/invite redeem vex://invite/${inviteID}\n`);
await waitUntil(() => bobSeen.join("").includes("redeemed invite"), "bob redeem");
await waitUntil(() => caraSeen.join("").includes("redeemed invite"), "cara redeem");

aliceChild.stdin.write(`/join ${channelID}\n`);
aliceChild.stdin.write("hello-channel\n");
await waitUntil(() => bobSeen.join("").includes("hello-channel"), "bob group");
await waitUntil(() => caraSeen.join("").includes("hello-channel"), "cara group");

aliceChild?.stdin?.write("/quit\n");
bobChild?.stdin?.write("/quit\n");
caraChild?.stdin?.write("/quit\n");
aliceChild?.kill("SIGTERM");
bobChild?.kill("SIGTERM");
caraChild?.kill("SIGTERM");
console.log(`smoke ok dataDir=${dataDir}`);

function waitFor(setup) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timed out")), 20_000);
        setup(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}

async function waitUntil(predicate, label) {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Timed out waiting for ${label}`);
}
