import { existsSync, readFileSync } from "node:fs";

if (!existsSync(".env.live")) {
  console.error("[FAIL] .env.live is missing. Run `npm run bootstrap:live`.");
  process.exit(1);
}

const values = {};
for (const raw of readFileSync(".env.live", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i > 0) values[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const checks = [
  ["CAPABILITY_CODE_HASH", /^0x[0-9a-fA-F]{64}$/],
  ["CAPABILITY_DEP_TX_HASH", /^0x[0-9a-fA-F]{64}$/],
  ["CAPABILITY_HASH_TYPE", /^(data|data1|data2|type)$/],
  ["CAPABILITY_DEP_INDEX", /^\d+$/],
];
let ok = true;
for (const [name, pattern] of checks) {
  const value = values[name] || "";
  const pass = pattern.test(value) && !value.includes("REPLACE");
  console.log(`${pass ? "[OK]  " : "[FAIL]"} ${name}`);
  ok &&= pass;
}
if ((values.ENABLE_PUBLIC_ISSUE || "false") === "true") {
  console.log("[WARN] ENABLE_PUBLIC_ISSUE=true: every connected testnet user will see an issue button.");
} else {
  console.log("[OK]   Public issue UI disabled");
}
console.log("[INFO] Live service stores one-time nonces in process memory; deploy one instance for the MVP.");
if (!ok) process.exit(1);
console.log("Live configuration looks deployable.");
