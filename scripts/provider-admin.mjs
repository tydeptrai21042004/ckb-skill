#!/usr/bin/env node
import { readFileSync } from "node:fs";

function readSecret(name, env = process.env) {
  const file = String(env[`${name}_FILE`] || "").trim();
  if (file) return readFileSync(file, "utf8").trim();
  return String(env[name] || "").trim();
}

function argMap(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      i += 1;
    } else result[key] = true;
  }
  return result;
}

function usage() {
  console.log(`SkillPass provider administration\n\nUsage:\n  npm run provider:admin -- list --service private-data-api-v1 [--limit 100]\n  npm run provider:admin -- revoke --service private-data-api-v1 --tx-hash 0x... --index 0x0 --reason "abuse investigation"\n  npm run provider:admin -- restore --service private-data-api-v1 --capability-id 0x...\n\nEnvironment:\n  SKILLPASS_BASE_URL=http://127.0.0.1:8787\n  SKILLPASS_ADMIN_TOKEN=<32+ random characters>\n  # or SKILLPASS_ADMIN_TOKEN_FILE=/run/secrets/skillpass_admin_token\n\nThe token is read locally and is never printed.`);
}

function requireValue(args, name) {
  const value = String(args[name] || "").trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function normalizeBaseUrl(value) {
  const url = new URL(String(value || "http://127.0.0.1:8787"));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("SKILLPASS_BASE_URL must use http or https");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

async function callAdmin({ method, path, body, baseUrl, token }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    redirect: "error",
  });
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { payload = { message: "server returned a non-JSON response" }; }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = payload?.error || "ADMIN_REQUEST_FAILED";
    throw error;
  }
  return payload;
}

export async function runProviderAdmin(argv = process.argv.slice(2), env = process.env) {
  const command = String(argv[0] || "help").trim().toLowerCase();
  if (["help", "-h", "--help"].includes(command)) {
    usage();
    return null;
  }
  if (!["list", "revoke", "restore"].includes(command)) throw new Error(`unknown command: ${command}`);

  const args = argMap(argv.slice(1));
  const service = requireValue(args, "service");
  const token = readSecret("SKILLPASS_ADMIN_TOKEN", env);
  if (token.length < 32) throw new Error("SKILLPASS_ADMIN_TOKEN must contain at least 32 characters");
  const baseUrl = normalizeBaseUrl(env.SKILLPASS_BASE_URL || "http://127.0.0.1:8787");

  if (command === "list") {
    const rawLimit = Number(args.limit || 100);
    const limit = Number.isSafeInteger(rawLimit) ? Math.max(1, Math.min(500, rawLimit)) : 100;
    return callAdmin({ method: "GET", path: `/api/admin/revocations?service=${encodeURIComponent(service)}&limit=${limit}`, baseUrl, token });
  }
  if (command === "revoke") {
    const txHash = requireValue(args, "tx-hash");
    const index = requireValue(args, "index");
    const reason = String(args.reason || "provider policy revocation").trim();
    return callAdmin({
      method: "POST",
      path: "/api/admin/revocations",
      baseUrl,
      token,
      body: { action: "revoke", service, outPoint: { txHash, index }, reason },
    });
  }
  return callAdmin({
    method: "POST",
    path: "/api/admin/revocations",
    baseUrl,
    token,
    body: { action: "restore", service, capabilityId: requireValue(args, "capability-id") },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProviderAdmin()
    .then((result) => { if (result) console.log(JSON.stringify(result, null, 2)); })
    .catch((error) => {
      console.error(`[provider-admin] ${error.code ? `${error.code}: ` : ""}${error.message}`);
      process.exitCode = 1;
    });
}
