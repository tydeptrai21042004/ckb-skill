import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildOpenApi } from "../apps/live-service/discovery.mjs";
import { buildProviderScaffold, writeProviderScaffold } from "../scripts/provider-scaffold.mjs";

const HEX = (byte) => `0x${byte.repeat(64)}`;

test("OpenAPI advertises batch capability status and token-protected evidence retrieval", () => {
  const api = buildOpenApi({ services: [{
    slug: "model-api-v1", id: HEX("1"), name: "Model API", endpoint: "/api/invoke/model-api-v1",
    inputKind: "text", maxInputChars: 20000, operationMode: "read",
  }] });
  assert.ok(api.paths["/api/capability/status/batch"]);
  assert.ok(api.paths["/api/evidence/{requestId}"]);
  assert.equal(api.info.version, "1.4.0");
});

test("provider scaffold creates a clean-room verifier kit", async () => {
  const options = {
    providerId: "provider-a", providerName: "Provider A", serviceSlug: "model-api-v1", serviceName: "Model API",
    serviceId: HEX("1"), issuerId: HEX("2"), codeHash: HEX("3"), hashType: "data2", minConfirmations: 2,
  };
  const built = buildProviderScaffold(options);
  assert.equal(built.config.provider.id, "provider-a");
  assert.equal(built.config.minConfirmations, 2);
  assert.match(built.verifier, /verifySkillPassAuthorization/);
  assert.match(built.readme, /No provider entitlement database synchronization is required/);

  const dir = await mkdtemp(join(tmpdir(), "skillpass-provider-kit-"));
  const target = await writeProviderScaffold({ ...options, outDir: join(dir, "provider") });
  const config = JSON.parse(await readFile(join(target, "skillpass-provider.config.json"), "utf8"));
  assert.equal(config.service.id, HEX("1"));
  assert.match(await readFile(join(target, "verify-request.mjs"), "utf8"), /minConfirmations/);
  assert.match(await readFile(join(target, ".env.example"), "utf8"), /CKB_RPC_URL/);
});

test("live service exposes signed evidence and multi-provider portfolio feature surfaces", async () => {
  const source = await readFile(new URL("../apps/live-service/server.mjs", import.meta.url), "utf8");
  assert.match(source, /signAuthorizationEvidence/);
  assert.match(source, /\/api\/evidence\//);
  assert.match(source, /accessTokenHash/);
  assert.match(source, /\/api\/capability\/status\/batch/);
  assert.match(source, /acceptedBy:/);
  assert.match(source, /authorizationEvidence: EVIDENCE_SIGNING_PRIVATE_KEY/);
});

test("web UI exposes portable audit proof, provider acceptance matrix, and expiry warning", async () => {
  const source = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  assert.match(source, /Load signed evidence/);
  assert.match(source, /Portable audit proof/);
  assert.match(source, /Cross-provider portability/);
  assert.match(source, /Expires soon/);
  assert.match(source, /CKB transfer receipt/);
  assert.match(source, /postTransferProof/);
});
