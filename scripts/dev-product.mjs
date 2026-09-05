#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";
const apiPort = String(process.env.SKILLPASS_API_PORT || "8787");
const webPort = String(process.env.SKILLPASS_WEB_PORT || "5173");
const apiOrigin = process.env.SKILLPASS_API_ORIGIN || `http://127.0.0.1:${apiPort}`;
const children = new Set();
let shuttingDown = false;

function start(label, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, ...extraEnv },
  });
  child.__label = label;
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    console.error(`\n[SkillPass] ${label} stopped (${reason}). Stopping the paired dev process.`);
    shutdown(code || 1);
  });
  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(`\n[SkillPass] Could not start ${label}: ${error.message}`);
    shutdown(1);
  });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try { child.kill("SIGTERM"); } catch {}
  }
  const timer = setTimeout(() => {
    for (const child of children) {
      try { child.kill("SIGKILL"); } catch {}
    }
    process.exit(code);
  }, 1_500);
  timer.unref();
  if (children.size === 0) process.exit(code);
  Promise.all([...children].map((child) => new Promise((resolvePromise) => child.once("exit", resolvePromise))))
    .finally(() => process.exit(code));
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("\n[SkillPass] Starting product development stack");
console.log(`[SkillPass] Live API: ${apiOrigin}`);
console.log(`[SkillPass] Frontend: http://127.0.0.1:${webPort}`);
console.log("[SkillPass] This path requires valid live/testnet configuration and installed npm dependencies.\n");

start("live API", "node", ["apps/live-service/server.mjs"], { PORT: apiPort });
start(
  "Vite frontend",
  "npm",
  ["run", "dev", "--prefix", "apps/web", "--", "--host", "0.0.0.0", "--port", webPort],
  { SKILLPASS_API_ORIGIN: apiOrigin },
);
