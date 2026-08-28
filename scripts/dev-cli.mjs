#!/usr/bin/env node
import { copyFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

function major(version = process.versions.node) {
  return Number(String(version).replace(/^v/, "").split(".")[0]);
}

function fail(message) {
  console.error(`\n[SkillPass] ERROR: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`\n[SkillPass] ${message}`);
}

function run(command, args = [], options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: isWin,
      env: { ...process.env, ...options.env },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`));
      else if (code === 0) resolvePromise();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function copyIfMissing(source, destination) {
  const src = resolve(ROOT, source);
  const dst = resolve(ROOT, destination);
  if (existsSync(dst)) return false;
  if (!existsSync(src)) fail(`required template ${source} is missing`);
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
  return true;
}

async function bootstrapConfig() {
  const created = [];
  for (const [source, destination] of [
    [".env.example", ".env"],
    ["deployments/devnet.example.json", "deployments/devnet.json"],
    ["deployments/testnet.example.json", "deployments/testnet.json"],
  ]) {
    if (await copyIfMissing(source, destination)) created.push(destination);
  }
  console.log(created.length ? `Created: ${created.join(", ")}` : "Config already exists; nothing overwritten.");
}

async function install() {
  const dirs = ["packages/ckb-client", "apps/web", "apps/live-service"];
  for (const dir of dirs) {
    log(`Installing ${dir}`);
    const hasLock = existsSync(resolve(ROOT, dir, "package-lock.json"));
    await run("npm", [hasLock ? "ci" : "install", "--prefix", dir, "--no-audit", "--no-fund"]);
  }
}

async function setup() {
  if (major() < 22) fail(`Node.js 22+ is required; found ${process.version}. Use Docker if you do not want to install Node.`);
  log(`Using Node ${process.version}`);
  await bootstrapConfig();
  await install();
  log("Setup complete. Run `npm run dev` for the deterministic demo or `npm run dev:web` for the React/CCC frontend.");
}

async function check() {
  log("Environment doctor");
  await run("node", ["scripts/doctor.mjs"]);
  log("Node tests");
  await run("node", ["--test"]);
  if (!existsSync(resolve(ROOT, "packages/ckb-client/node_modules")) || !existsSync(resolve(ROOT, "apps/web/node_modules"))) {
    fail("JavaScript dependencies are missing. Run `npm run setup` once, then rerun `npm run check`.");
  }
  log("CKB client typecheck");
  await run("npm", ["run", "typecheck", "--prefix", "packages/ckb-client"]);
  log("Web build");
  await run("npm", ["run", "build", "--prefix", "apps/web"]);
}

async function clean() {
  const targets = [
    "apps/web/node_modules",
    "apps/web/dist",
    "apps/live-service/node_modules",
    "packages/ckb-client/node_modules",
  ];
  for (const target of targets) await rm(resolve(ROOT, target), { recursive: true, force: true });
  log("Removed generated dependencies/build output. Local .env and runtime state were preserved.");
}

async function dockerDemo() {
  log("Starting reproducible Docker demo on http://127.0.0.1:8787");
  await run("docker", ["compose", "-f", "deploy/compose.demo.yaml", "up", "--build"]);
}

function help() {
  console.log(`SkillPass developer CLI\n\nUsage:\n  node scripts/dev-cli.mjs <command>\n\nCommands:\n  setup        create safe local config + install JS dependencies\n  demo         run deterministic local demo on http://127.0.0.1:8787\n  web          run React/CCC Vite frontend on http://127.0.0.1:5173\n  facilitator  run local Fiber/x402 facilitator\n  live         run live CKB service (requires valid env/deployment metadata)\n  doctor       print environment/readiness report\n  test         run Node tests\n  check        doctor + tests + typecheck + web production build\n  docker-demo  reproducible demo using Docker only\n  clean        remove JS dependencies/build output; preserve config/state\n  help         show this message\n\nRecommended first run:\n  npm run setup\n  npm run dev\n\nDocker-only first run:\n  docker compose -f deploy/compose.demo.yaml up --build\n`);
}

const command = process.argv[2] || "help";
try {
  switch (command) {
    case "setup": await setup(); break;
    case "demo": await run("node", ["apps/demo-service/server.mjs"]); break;
    case "web": await run("npm", ["run", "dev", "--prefix", "apps/web"]); break;
    case "facilitator": await run("node", ["apps/fiber-facilitator/server.mjs"]); break;
    case "live": await run("node", ["apps/live-service/server.mjs"]); break;
    case "doctor": await run("node", ["scripts/doctor.mjs"]); break;
    case "test": await run("node", ["--test"]); break;
    case "check": await check(); break;
    case "docker-demo": await dockerDemo(); break;
    case "clean": await clean(); break;
    case "help": case "-h": case "--help": help(); break;
    default: fail(`unknown command: ${command}. Run \`npm run help\`.`);
  }
} catch (error) {
  fail(error?.message || String(error));
}
