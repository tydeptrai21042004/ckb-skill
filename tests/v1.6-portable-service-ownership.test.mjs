import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { executeComputeReference, executeModelReference, executePrivateDataReference } from "../apps/live-service/reference-services.mjs";
import { buildDiscovery, buildOpenApi } from "../apps/live-service/discovery.mjs";

const read = (path) => readFileSync(path, "utf8");

test("v1.6 release contains the hidden deployment assets that clean ZIPs need", () => {
  for (const file of [
    ".env.example", ".env.testnet.example", ".env.live.example",
    ".env.production.example", ".env.vercel.example", ".dockerignore", ".gitignore",
    ".github/workflows/security-readiness.yml",
  ]) assert.equal(existsSync(file), true, `missing ${file}`);
});

test("the default developer path is the current Service Bundle product, not the legacy Paper demo", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.dev, "node scripts/dev-cli.mjs web");
  assert.equal(pkg.scripts["dev:demo"], "node scripts/dev-cli.mjs demo");
  assert.doesNotMatch(read("Dockerfile.live"), /paper-analyzer|research-insights/i);
});

test("multi-provider pilot isolates three provider identities and three services", () => {
  const compose = read("deploy/compose.multi-provider-pilot.yaml");
  for (const id of ["provider-model-a", "provider-data-b", "provider-compute-c"]) assert.match(compose, new RegExp(id));
  for (const service of ["model-api-v1", "private-data-api-v1", "compute-api-v1"]) assert.match(compose, new RegExp(`SKILLPASS_ENABLED_SERVICES: ${service}`));
  assert.match(compose, /STATE_BACKEND: local/);
  assert.doesNotMatch(compose, /postgres:|redis:/);
  assert.match(read("scripts/pilot-check.mjs"), /providers disagree on current CKB owner/);
});

test("reference service trio performs concrete protected work", async () => {
  const provider = { providerId: "provider-test", providerName: "Provider Test" };
  const model = executeModelReference("portable service ownership", provider);
  assert.equal(model.embedding.length, 8);
  assert.equal(model.inputTokensApprox, 3);

  const data = executePrivateDataReference({ region: "apac", limit: 2 }, provider);
  assert.equal(data.rows.length, 2);
  assert.ok(data.rows.every((row) => row.region === "apac"));

  const compute = executeComputeReference({ values: [3, 4] }, provider);
  assert.equal(compute.state, "succeeded");
  assert.equal(compute.result.l2, 5);
  assert.equal(compute.result.mean, 3.5);
});

test("one provider deployment can expose exactly one service and identity", () => {
  const source = read("apps/live-service/services.mjs");
  assert.match(source, /SKILLPASS_PROVIDER_ID/);
  assert.match(source, /SKILLPASS_PROVIDER_NAME/);
  assert.match(source, /SKILLPASS_ENABLED_SERVICES/);
  assert.match(source, /selected = enabled\.length \? services\.filter/);
  assert.match(source, /contains unknown service\(s\)/);
});

test("discovery and OpenAPI advertise provider metadata and manifest", () => {
  const services = [{
    id: `0x${"11".repeat(32)}`, slug: "model-api-v1", name: "Model API", endpoint: "/api/invoke/model-api-v1",
    inputKind: "text", maxInputChars: 20000, kind: "builtin-reference", operationMode: "read",
    providerId: "skillpass-reference-provider", providerName: "SkillPass reference provider",
  }, {
    id: `0x${"22".repeat(32)}`, slug: "compute-api-v1", name: "Compute API", endpoint: "/api/invoke/compute-api-v1",
    inputKind: "json", maxInputChars: 20000, kind: "builtin-reference", operationMode: "idempotent-action", idempotencyMode: "invocation-key",
    providerId: "skillpass-reference-provider", providerName: "SkillPass reference provider",
  }];
  const discovery = buildDiscovery({ services });
  assert.equal(discovery.api.providerManifest, "/api/provider-manifest");
  assert.equal(discovery.services[0].providerId, "skillpass-reference-provider");
  assert.equal(discovery.services.find((item) => item.slug === "compute-api-v1").operationMode, "idempotent-action");
  const openapi = buildOpenApi({ services });
  assert.ok(openapi.paths["/api/provider-manifest"]);
});

test("delegation quota uses reserve then commit and releases on protected execution failure", () => {
  const server = read("apps/live-service/server.mjs");
  const reserve = server.indexOf("reserveDelegationBudget(verified, requestBody, service, payment)");
  const execute = server.indexOf("await service.execute(requestBody.input");
  const commit = server.indexOf("commitDelegationBudget(delegationReservation)");
  const release = server.indexOf("releaseDelegationBudget(delegationReservation)");
  assert.ok(reserve >= 0 && execute > reserve && commit > execute, "expected reserve -> execute -> commit ordering");
  assert.ok(release > execute, "failure path must release a reservation");
});


test("idempotent action operation IDs survive fresh challenges and stay payment/delegation bound", () => {
  const server = read("apps/live-service/server.mjs");
  const web = read("apps/web/src/App.tsx");
  assert.match(server, /operation_id=\$\{normalizeOperationId/);
  assert.match(server, /operationId: service\.operationMode === "idempotent-action"/);
  assert.match(server, /actionInvocationKey\(body, service\)/);
  assert.match(server, /operationId: service\.operationMode === "idempotent-action" \? normalizeOperationId\(body\.operationId/);
  assert.match(web, /operationIdOverride \|\| crypto\.randomUUID\(\)/);
  assert.match(web, /pendingPayment\.operationId/);
});
