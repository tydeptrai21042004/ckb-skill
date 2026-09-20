import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const profile = JSON.parse(read("reference-apps/skillpass-care.json"));

test("SkillPass Care profile preserves a rich application domain instead of flattening Care into the base protocol", () => {
  assert.equal(profile.role, "reference-product");
  assert.ok(profile.skillPassOwns.includes("current-owner source of truth from the live Capability Cell"));
  assert.ok(profile.applicationOwns.includes("coverage plan and remaining service quota"));
  assert.ok(profile.applicationOwns.includes("service-event history"));
  assert.ok(profile.applicationOwns.includes("issuer suspension/revocation workflow"));
  assert.ok(profile.requiredInvariants.some((item) => /stale ownership evidence/i.test(item)));
  assert.equal(profile.toolingPackages["@skillpass/provider-conformance"], "1.0.0");
});

test("funding docs explicitly keep the generic three-service SkillPass demo and the richer Care reference product", () => {
  const refs = read("docs/REFERENCE_APPLICATIONS.md");
  const boundary = read("docs/SKILLPASS_CARE_BOUNDARY.md");
  assert.match(refs, /Model API/);
  assert.match(refs, /Private Data API/);
  assert.match(refs, /Compute API/);
  assert.match(refs, /coverage quota/i);
  assert.match(refs, /issuer suspension\/revocation/i);
  assert.match(boundary, /two different state machines/i);
  assert.match(boundary, /reject as stale ownership state/i);
});
