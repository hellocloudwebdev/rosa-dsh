#!/usr/bin/env node
/**
 * Run the ROSA API server locally from TypeScript sources.
 *
 * `tsc -p tsconfig.server.json` emits ESM to `dist-server/`, where the `.js`
 * import specifiers used throughout the source become real `.js` files. Running
 * the compiled output means the same code the production entry points execute
 * is what executes here — no separate loader, no source-mapping surprises.
 *
 * Usage:  node scripts/dev-api.mjs [--watch]
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const PORT = Number(process.env.ROSA_API_PORT ?? 8787);

function log(message) {
  process.stdout.write(`[dev:api] ${message}\n`);
}

function build() {
  log("type-checking and emitting to dist-server/ …");
  const result = spawnSync(
    process.execPath,
    [path.join(root, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.server.json"],
    { cwd: root, stdio: "inherit" },
  );
  if (result.status !== 0) {
    log("build failed — see the TypeScript errors above.");
    process.exit(result.status ?? 1);
  }
}

build();

const entry = path.join(root, "dist-server", "server", "local", "localServer.js");
if (!fs.existsSync(entry)) {
  log(`expected entry not found: ${entry}`);
  process.exit(1);
}

let child = null;
let stopping = false;

function start() {
  const args = [];
  const envFile = path.join(root, ".env");
  if (fs.existsSync(envFile)) {
    args.push(`--env-file=${envFile}`);
  }
  args.push(entry);
  child = spawn(process.execPath, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (stopping) return;
    log(`api server exited (code=${code ?? "null"} signal=${signal ?? "none"})`);
    process.exit(code ?? 1);
  });
}

start();

function shutdown() {
  stopping = true;
  if (child && child.exitCode === null) child.kill("SIGTERM");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// A tiny readiness probe so `npm run dev:api` prints a usable line.
const probe = createServer();
probe.once("listening", () => {
  probe.close(() => {
    log(`API server starting on http://127.0.0.1:${PORT} (compiled from server/)`);
  });
});
probe.listen(0, "127.0.0.1");
