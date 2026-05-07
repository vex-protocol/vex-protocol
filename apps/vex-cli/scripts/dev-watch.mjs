#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const cliRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(cliRoot, "../..");
const cliEntry = path.join(cliRoot, "src/vex-chat.js");
const watchRoots = [
    path.join(cliRoot, "src"),
    path.join(repoRoot, "packages/libvex/src"),
];

let child = null;
let restarting = false;
let restartTimer = null;
const watchers = [];

start();
await watchAll(watchRoots);

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("exit", () => closeWatchers());

function start() {
    const args = process.argv.slice(2);
    child = spawn(process.execPath, [cliEntry, ...args], {
        cwd: repoRoot,
        env: { ...process.env, VEX_HOT_RELOAD: "1" },
        stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
        if (restarting) return;
        if (signal) {
            process.kill(process.pid, signal);
            return;
        }
        process.exitCode = code ?? 0;
        closeWatchers();
    });
}

function scheduleRestart(changedPath) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => restart(changedPath), 100);
}

function restart(changedPath) {
    if (!child || restarting) return;
    restarting = true;
    const oldChild = child;
    let exited = false;
    process.stdout.write(
        `\n[vex-cli] reloading after ${path.relative(repoRoot, changedPath)} changed\n`,
    );
    oldChild.once("exit", () => {
        exited = true;
        restarting = false;
        start();
    });
    oldChild.kill("SIGTERM");
    setTimeout(() => {
        if (!exited) oldChild.kill("SIGKILL");
    }, 1_000).unref();
}

async function watchAll(roots) {
    for (const root of roots) {
        await watchDirectory(root);
    }
}

async function watchDirectory(dir) {
    const watcher = watch(dir, (event, filename) => {
        if (!filename) return scheduleRestart(dir);
        const changedPath = path.join(dir, filename.toString());
        if (shouldIgnore(changedPath)) return;
        scheduleRestart(changedPath);
    });
    watchers.push(watcher);

    const entries = await readdir(dir, { withFileTypes: true });
    await Promise.all(
        entries
            .filter((entry) => entry.isDirectory())
            .map((entry) => watchDirectory(path.join(dir, entry.name))),
    );
}

function shouldIgnore(changedPath) {
    const base = path.basename(changedPath);
    return (
        base.startsWith(".") ||
        base.endsWith("~") ||
        base.endsWith(".swp") ||
        base.endsWith(".tmp")
    );
}

function closeWatchers() {
    for (const watcher of watchers.splice(0)) {
        watcher.close();
    }
}

function shutdown(signal) {
    closeWatchers();
    if (!child || child.killed) {
        process.exit(0);
    }
    child.once("exit", () => process.exit(0));
    child.kill(signal);
}
