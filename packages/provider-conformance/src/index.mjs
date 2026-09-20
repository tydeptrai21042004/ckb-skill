/**
 * SkillPass provider conformance helpers.
 *
 * This package intentionally does not know how a provider talks to CKB. The
 * provider supplies an `authorize` callback backed by its own RPC/indexer,
 * policy configuration and runtime. The suite checks observable portable-
 * ownership behaviour across a transfer boundary.
 */

export const OWNERSHIP_CONFORMANCE_VERSION = 1;

export const OWNERSHIP_SCENARIOS = Object.freeze([
  Object.freeze({ id: "before-alice-allow", phase: "before-transfer", actor: "alice", expected: "allow" }),
  Object.freeze({ id: "before-bob-deny", phase: "before-transfer", actor: "bob", expected: "deny" }),
  Object.freeze({ id: "after-alice-deny", phase: "after-transfer", actor: "alice", expected: "deny" }),
  Object.freeze({ id: "after-bob-allow", phase: "after-transfer", actor: "bob", expected: "allow" }),
]);

function normalizeDecision(value) {
  if (value === true) return { allowed: true, code: "ALLOW" };
  if (value === false) return { allowed: false, code: "DENY" };
  if (value && typeof value === "object") {
    const allowed = value.allowed ?? value.authorized;
    if (typeof allowed === "boolean") {
      return { allowed, code: String(value.code || value.reason || (allowed ? "ALLOW" : "DENY")) };
    }
  }
  throw new TypeError("authorize() must return boolean or {allowed|authorized:boolean}");
}

function actorAddress(actor, aliceLockHash, bobLockHash) {
  return actor === "alice" ? aliceLockHash : bobLockHash;
}

/**
 * Execute the minimum lifecycle that every independent SkillPass provider must
 * satisfy. A denial may be returned or thrown; thrown errors are captured as a
 * denial with their public error code.
 */
export async function runPortableOwnershipConformance({
  authorize,
  aliceLockHash,
  bobLockHash,
  metadata = {},
} = {}) {
  if (typeof authorize !== "function") throw new TypeError("authorize callback is required");
  if (!String(aliceLockHash || "").trim()) throw new TypeError("aliceLockHash is required");
  if (!String(bobLockHash || "").trim()) throw new TypeError("bobLockHash is required");

  const results = [];
  for (const scenario of OWNERSHIP_SCENARIOS) {
    let decision;
    try {
      decision = normalizeDecision(await authorize({
        scenarioId: scenario.id,
        phase: scenario.phase,
        actor: scenario.actor,
        requesterLockHash: actorAddress(scenario.actor, aliceLockHash, bobLockHash),
      }));
    } catch (error) {
      decision = { allowed: false, code: String(error?.code || error?.name || "ERROR") };
    }
    const expectedAllowed = scenario.expected === "allow";
    results.push(Object.freeze({
      ...scenario,
      expectedAllowed,
      actualAllowed: decision.allowed,
      code: decision.code,
      passed: decision.allowed === expectedAllowed,
    }));
  }

  const passed = results.every((item) => item.passed);
  return Object.freeze({
    schemaVersion: 1,
    conformanceVersion: OWNERSHIP_CONFORMANCE_VERSION,
    kind: "skillpass-portable-ownership",
    passed,
    metadata: Object.freeze({ ...metadata }),
    results: Object.freeze(results),
  });
}

export function assertPortableOwnershipConformance(report) {
  if (!report || report.kind !== "skillpass-portable-ownership") {
    throw new TypeError("portable ownership conformance report is required");
  }
  const failed = (report.results || []).filter((item) => !item.passed);
  if (!report.passed || failed.length) {
    const details = failed.map((item) => `${item.id}: expected=${item.expected} actual=${item.actualAllowed ? "allow" : "deny"} code=${item.code}`).join("; ");
    const error = new Error(`SkillPass provider conformance failed${details ? `: ${details}` : ""}`);
    error.code = "SKILLPASS_PROVIDER_CONFORMANCE_FAILED";
    error.report = report;
    throw error;
  }
  return report;
}
