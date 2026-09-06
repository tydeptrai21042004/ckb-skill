import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

test("GUI env collector never invokes Vercel CLI and generates only manual env inputs", async () => {
  const script = await readFile(join(ROOT, "collect-vercel-env.sh"), "utf8");
  assert.match(script, /extract-offckb-deployment\.mjs/);
  assert.match(script, /\.env\.vercel\.gui/);
  assert.match(script, /offckb deploy/);
  assert.doesNotMatch(script, /\bvercel\s+link\b/);
  assert.doesNotMatch(script, /\bvercel\s+env\b/);
  assert.doesNotMatch(script, /\bvercel\s+integration\b/);
  assert.doesNotMatch(script, /\bvercel\s+--prod\b/);
  assert.match(script, /DATABASE_URL is intentionally NOT generated/);
  assert.match(script, /FACILITATOR_URL is also NOT generated/);
});

test("GUI-only deployment guide covers batch env, Neon, redeploy, secrets, and cost controls", async () => {
  const guide = await readFile(join(ROOT, "HUONG_DAN_VERCEL_GUI_VI.md"), "utf8");
  assert.match(guide, /Project\s*→\s*Settings\s*→\s*Environment Variables/);
  assert.match(guide, /DATABASE_URL/);
  assert.match(guide, /FACILITATOR_URL/);
  assert.match(guide, /Sensitive/);
  assert.match(guide, /Redeploy/);
  assert.match(guide, /Neon/);
  assert.match(guide, /Firewall|WAF/);
  assert.match(guide, /Spend Management/);
});
