#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const cliRoot = path.resolve(path.dirname(scriptPath), "..");
const repoRoot = path.resolve(cliRoot, "../..");
const cliEntry = path.join(cliRoot, "src/vex-chat.js");
const watchTargets = [
    path.join(cliRoot, "src"),
    path.join(cliRoot, "theme.yaml"),
    path.join(cliRoot, "package.json"),
    path.join(cliRoot, "scripts"),
    path.join(repoRoot, "packages/libvex/src"),
    path.join(repoRoot, "packages/types/src"),
];

let child = null;
let restarting = false;
let restartTimer = null;
let queuedRestartPath = null;
const watchers = [];

if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
}

start();
await watchAll(watchTargets);

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
    queuedRestartPath = changedPath;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => restart(), 75);
}

function restart() {
    if (!child || restarting) return;
    restarting = true;
    const changedPath = queuedRestartPath;
    queuedRestartPath = null;
    const oldChild = child;
    let exited = false;
    const relativePath = changedPath
        ? path.relative(repoRoot, changedPath)
        : "watched file";
    process.stdout.write(
        `\n\x1b[2J\x1b[3J\x1b[H[vex-cli] restart after ${relativePath} changed\n`,
    );
    oldChild.once("exit", () => {
        exited = true;
        restarting = false;
        start();
    });
    oldChild.kill("SIGINT");
    setTimeout(() => {
        if (!exited) oldChild.kill("SIGTERM");
    }, 200).unref();
    setTimeout(() => {
        if (!exited) oldChild.kill("SIGKILL");
    }, 500).unref();
}

async function watchAll(targets) {
    for (const target of targets) {
        await watchPath(target);
    }
}

async function watchPath(target) {
    const details = await stat(target).catch(() => null);
    if (!details) return;
    if (details.isDirectory()) {
        await watchDirectory(target);
        return;
    }
    watchFile(target);
}

function watchFile(file) {
    const watcher = watch(file, () => {
        if (shouldIgnore(file)) return;
        scheduleRestart(file);
    });
    watchers.push(watcher);
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
    const ext = path.extname(base);
    return (
        base.startsWith(".") ||
        base.endsWith("~") ||
        base.endsWith(".swp") ||
        base.endsWith(".tmp") ||
        (ext && ![".js", ".json", ".mjs", ".ts", ".yaml", ".yml"].includes(ext))
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

function printHelp() {
    process.stdout.write(`vex-cli dev watcher

Usage:
  pnpm vex:dev [username] [vex chat flags]

Restarts the whole CLI process when watched source files change. This is a
process-level reload, which plays much nicer with readline than in-process hot
patching.
`);
}
