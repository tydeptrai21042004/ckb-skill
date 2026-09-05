import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";

function readJson(path, fallback = null) {
  try { return JSON.parse(requireText(path)); } catch { return fallback; }
}
function requireText(path) {
  return readFileSync(path, "utf8");
}
function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const raw of requireText(path).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}
function command(name, args = ["--version"]) {
  const r = spawnSync(name, args, { encoding: "utf8", shell: process.platform === "win32" });
  return r.status === 0 ? (r.stdout || r.stderr).trim().split("\n")[0] : null;
}
function isHex32(value) { return /^0x[0-9a-fA-F]{64}$/.test(String(value || "")); }

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const env = parseEnv(".env.testnet");
let deployment = null;
if (existsSync("deployments/testnet.json")) {
  try { deployment = JSON.parse(await readFile("deployments/testnet.json", "utf8")); } catch {}
}

const bundle = {
  generatedAt: new Date().toISOString(),
  project: { name: pkg.name, version: pkg.version },
  runtime: {
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    node: process.version,
    npm: command("npm"),
    docker: command("docker", ["--version"]),
    compose: command("docker", ["compose", "version"]),
    cargo: command("cargo"),
  },
  files: {
    envTestnet: existsSync(".env.testnet"),
    deploymentTestnet: existsSync("deployments/testnet.json"),
    webDependenciesInstalled: existsSync("apps/web/node_modules"),
    ckbClientDependenciesInstalled: existsSync("packages/ckb-client/node_modules"),
    liveDependenciesInstalled: existsSync("apps/live-service/node_modules"),
  },
  deployment: deployment ? {
    network: deployment.network || "testnet",
    codeHash: isHex32(deployment.codeHash) ? deployment.codeHash : "not-populated",
    hashType: deployment.hashType || null,
    depTxHash: isHex32(deployment.depTxHash) ? deployment.depTxHash : "not-populated",
    depIndex: deployment.depIndex ?? null,
  } : null,
  config: {
    paymentsRequired: env.PAYMENTS_REQUIRED || null,
    fiberBackend: env.FIBER_BACKEND || null,
    fiberNetwork: env.FIBER_NETWORK || null,
    fiberPaymentProof: env.FIBER_PAYMENT_PROOF || null,
    publicBaseUrlConfigured: Boolean(env.PUBLIC_BASE_URL),
    ckbRpcConfigured: Boolean(env.CKB_RPC_URL),
    facilitatorAuthConfigured: Boolean(env.FACILITATOR_AUTH_TOKEN && !env.FACILITATOR_AUTH_TOKEN.startsWith("REPLACE")),
    fiberRpcConfigured: Boolean(env.FIBER_RPC_URL),
    fiberRpcTokenConfigured: Boolean(env.FIBER_RPC_TOKEN),
  },
  privacy: {
    secretsIncluded: false,
    note: "Secret values, private keys, RPC tokens, and .env contents are intentionally excluded.",
  },
};

await mkdir(".runtime", { recursive: true });
const out = ".runtime/support-bundle.json";
await writeFile(out, JSON.stringify(bundle, null, 2) + "\n", "utf8");
console.log(`Created ${out}`);
console.log("This support bundle intentionally excludes secrets and private keys.");
