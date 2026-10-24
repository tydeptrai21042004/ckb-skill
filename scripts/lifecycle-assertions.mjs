/** Explicitly distinguish an expected authorization denial from an RPC or protocol failure. */
const NEGATIVE_CODES = Object.freeze({
  "before-bob-deny": "NOT_OWNER",
  "after-alice-deny": "CELL_NOT_LIVE",
});

export function assessProviderDecision({id, expected, authorized, code}) {
  const observed = authorized === true;
  const normalized = String(code || (observed ? "ALLOW" : "UNKNOWN_ERROR"));
  const expectedCode = expected ? "ALLOW" : NEGATIVE_CODES[id];
  if (!expectedCode) throw new Error(`Unknown provider acceptance check: ${id}`);
  return Object.freeze({
    id, expected, actual: observed, code: normalized, expectedCode,
    passed: observed === expected && normalized === expectedCode,
  });
}
