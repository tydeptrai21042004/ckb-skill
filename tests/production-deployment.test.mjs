import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const read = (path) => readFileSync(path, "utf8");

test("production multi-user deployment assets are included", () => {
  for (const path of [
    ".env.production.example",
    ".gitignore",
    ".dockerignore",
    "deploy-production.sh",
    "deploy/Caddyfile",
    "deploy/compose.production.yaml",
    "HUONG_DAN_DEPLOY_MULTI_USER_VI.md",
    "packages/production-store/src/postgres.mjs",
    "packages/production-store/src/redis.mjs",
    "packages/production-store/src/stores.mjs",
    "tests/production-store.test.mjs",
  ]) assert.equal(existsSync(path), true, `missing ${path}`);
});

test("production containers include shared security and shared-state packages", () => {
  for (const path of ["Dockerfile", "Dockerfile.live", "Dockerfile.facilitator"]) {
    assert.match(read(path), /COPY packages\/http-security \.\/packages\/http-security/, `${path} must include http-security`);
  }
  for (const path of ["Dockerfile", "Dockerfile.live"]) {
    assert.match(read(path), /COPY packages\/service-rights \.\/packages\/service-rights/, `${path} must include service-rights`);
  }
  assert.match(read("Dockerfile.live"), /COPY packages\/service-gateway \.\/packages\/service-gateway/, "Dockerfile.live must include service-gateway");
  assert.match(read("Dockerfile.live"), /COPY packages\/delegation \.\/packages\/delegation/, "Dockerfile.live must include delegation");
  assert.doesNotMatch(read("Dockerfile.live"), /paper-analyzer\.mjs|research-insights\.mjs/, "Dockerfile.live must not ship legacy demo services");
  for (const path of ["Dockerfile.live", "Dockerfile.facilitator"]) {
    assert.match(read(path), /COPY packages\/production-store \.\/packages\/production-store/, `${path} must include production-store`);
  }
});

test("production stack keeps application/data services private and uses shared state", () => {
  const compose = read("deploy/compose.production.yaml");
  const postgres = compose.match(/\n  postgres:\n([\s\S]*?)\n  redis:/)?.[1] || "";
  const redis = compose.match(/\n  redis:\n([\s\S]*?)\n  facilitator:/)?.[1] || "";
  const facilitator = compose.match(/\n  facilitator:\n([\s\S]*?)\n  skillpass:/)?.[1] || "";
  const skillpass = compose.match(/\n  skillpass:\n([\s\S]*?)\nsecrets:/)?.[1] || "";

  assert.match(compose, /caddy:2\.11\.4-alpine/);
  assert.match(compose, /postgres:17\.11-alpine3\.24/);
  assert.match(compose, /redis:8\.10\.1-alpine3\.23/);
  for (const block of [postgres, redis, facilitator, skillpass]) assert.doesNotMatch(block, /\n    ports:/);
  assert.match(facilitator, /STATE_BACKEND: postgres-redis/);
  assert.match(skillpass, /STATE_BACKEND: postgres-redis/);
  assert.match(facilitator, /POSTGRES_PASSWORD_FILE: \/run\/secrets\/postgres_password/);
  assert.match(skillpass, /REDIS_PASSWORD_FILE: \/run\/secrets\/redis_password/);
  assert.match(compose, /ALLOW_DEV_PAYMENT: "false"/);
  assert.match(compose, /backend:\n    internal: true/);
  assert.match(compose, /postgres_data:/);
  assert.doesNotMatch(compose, /skillpass_state|facilitator_state/);
});

test("PostgreSQL replay consumption is atomic and Redis challenge consumption is one-time", () => {
  const migration = read("packages/production-store/src/postgres.mjs");
  const stores = read("packages/production-store/src/stores.mjs");
  assert.match(migration, /payment_hash TEXT PRIMARY KEY/);
  assert.match(migration, /skillpass_delegation_usage/);
  assert.match(migration, /skillpass_delegation_invocations/);
  assert.match(stores, /PostgresDelegationUsageLedger/);
  assert.match(stores, /FOR UPDATE/);
  assert.match(stores, /DELEGATION_USE_LIMIT_EXHAUSTED/);
  assert.match(stores, /ON CONFLICT \(payment_hash\) DO NOTHING/);
  assert.match(stores, /GETDEL/);
  assert.match(stores, /INCR/);
  assert.match(stores, /PEXPIRE/);
});

test("Caddy discovers scaled SkillPass replicas without sticky process state", () => {
  const caddy = read("deploy/Caddyfile");
  assert.match(caddy, /dynamic a skillpass 8787/);
  assert.match(caddy, /lb_policy least_conn/);
  assert.match(caddy, /fail_duration 15s/);
  assert.match(caddy, /request>headers>Payment-Signature delete/);
});

test("production helper supports scale, database backup, restore and preflight", () => {
  const script = read("deploy-production.sh");
  assert.match(script, /--scale "skillpass=\$replicas"/);
  assert.match(script, /pg_dump/);
  assert.match(script, /psql -v ON_ERROR_STOP=1/);
  assert.match(script, /STATE_BACKEND=postgres-redis/);
  assert.match(script, /community public RPC/);
});

test("production config defaults to shared state and multiple replicas", () => {
  const env = read(".env.production.example");
  assert.match(env, /^SKILLPASS_REPLICAS=2$/m);
  assert.match(env, /^STATE_BACKEND=postgres-redis$/m);
  assert.match(env, /^PAYMENTS_REQUIRED=true$/m);
  assert.match(env, /^FIBER_BACKEND=fnn$/m);
  assert.match(env, /^PAYMENT_DECIMALS=8$/m);
  assert.match(env, /^PAYMENT_ATOMIC_UNIT=shannon$/m);
  assert.match(env, /^SKILLPASS_GATEWAY_ALLOWED_HOSTS=$/m);
  assert.match(env, /^SKILLPASS_UPSTREAM_SERVICES_JSON=\[\]$/m);
});

test("public status/logging does not expose raw upstream errors or configured RPC URLs", () => {
  const live = read("apps/live-service/server.mjs");
  assert.doesNotMatch(live, /CKB network: testnet; RPC: \$\{client\.url\}/);
  assert.match(live, /error: "CKB RPC unavailable"/);
  assert.match(live, /error: "facilitator unavailable"/);
  assert.match(live, /error: "state backend unavailable"/);
});

test("container health checks process liveness without coupling restarts to external RPC readiness", () => {
  assert.match(read("Dockerfile.live"), /8787\/livez/);
  assert.doesNotMatch(read("Dockerfile.live"), /8787\/readyz/);
  assert.match(read("Dockerfile.facilitator"), /8790\/livez/);
  assert.doesNotMatch(read("Dockerfile.facilitator"), /8790\/readyz/);
  assert.match(read("deploy-production.sh"), /\/readyz/);
});

test("Docker build context excludes local secrets and runtime state", () => {
  const ignore = read(".dockerignore");
  for (const token of [".env.production", ".secrets", ".runtime", "backups"]) assert.match(ignore, new RegExp(token.replace(".", "\\.")));
});

test("production deployment helper and modified runtime files have valid syntax", () => {
  const bash = spawnSync("bash", ["-n", "deploy-production.sh"], { encoding: "utf8" });
  assert.equal(bash.status, 0, bash.stderr);
  for (const file of ["apps/live-service/server.mjs", "apps/live-service/runtime-state.mjs", "apps/fiber-facilitator/server.mjs", "packages/production-store/src/postgres.mjs", "packages/production-store/src/redis.mjs", "packages/production-store/src/stores.mjs"]) {
    const checked = spawnSync("node", ["--check", file], { encoding: "utf8" });
    assert.equal(checked.status, 0, `${file}: ${checked.stderr}`);
  }
});
