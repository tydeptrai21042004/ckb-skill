import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const services = readFileSync("apps/live-service/services.mjs", "utf8");
const server = readFileSync("apps/live-service/server.mjs", "utf8");
const ids = readFileSync("packages/capability-codec/src/service-ids.mjs", "utf8");
const app = readFileSync("apps/web/src/App.tsx", "utf8");
const connected = readFileSync("apps/web/src/ConnectedNoPass.tsx", "utf8");

test("live product catalog uses the Service Bundle service trio", () => {
  for (const value of ["model-api-v1", "private-data-api-v1", "compute-api-v1"]) {
    assert.match(services, new RegExp(value));
  }
  for (const value of ["Model API", "Private Data API", "Compute API"]) {
    assert.match(services, new RegExp(value));
    assert.match(connected, new RegExp(value));
  }
  assert.doesNotMatch(services, /Paper Analyzer|Research Insights/);
  assert.doesNotMatch(app, /Paper Analyzer|Research Insights/);
});

test("default built-in services share one Service Bundle entitlement", () => {
  assert.match(ids, /SERVICE_BUNDLE_V1_ENTITLEMENT_ID/);
  assert.match(server, /isDefaultBundleService/);
  assert.match(server, /defaultEntitlementIds = isDefaultBundleService \? \[SERVICE_BUNDLE_V1_ENTITLEMENT_ID\]/);
  assert.match(server, /service-bundle-v1/);
  assert.match(server, /getBySlug\("model-api-v1"\)/);
});
