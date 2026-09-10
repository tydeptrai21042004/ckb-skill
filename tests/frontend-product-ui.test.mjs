import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const demoHtml = readFileSync("apps/demo-service/public/index.html", "utf8");
const demoCss = readFileSync("apps/demo-service/public/styles.css", "utf8");
const demoJs = readFileSync("apps/demo-service/public/app.js", "utf8");
const liveApp = readFileSync("apps/web/src/App.tsx", "utf8");
const liveMain = readFileSync("apps/web/src/main.tsx", "utf8");
const liveCss = readFileSync("apps/web/src/styles.css", "utf8");
const home = readFileSync("apps/web/src/DisconnectedHome.tsx", "utf8");
const empty = readFileSync("apps/web/src/ConnectedNoPass.tsx", "utf8");
const demoWorkspace = readFileSync("apps/web/src/DemoWorkspace.tsx", "utf8");
const demoState = readFileSync("apps/web/src/demo/demoState.ts", "utf8");
const demoServices = readFileSync("apps/web/src/demo/demoServices.ts", "utf8");

test("legacy local demo remains available as a development fixture", () => {
  assert.match(demoHtml, /class="workspace"/);
  assert.match(demoHtml, /id="run"/);
  assert.match(demoHtml, /data-identity="alice"/);
  assert.match(demoJs, /const to = from === "alice" \? "bob" : "alice"/);
  assert.doesNotMatch(demoCss, /radial-gradient|linear-gradient/);
});

test("live CCC frontend keeps the real protected-service workspace", () => {
  assert.equal((liveApp.match(/<textarea/g) || []).length, 1);
  assert.match(liveApp, /Manage this pass/);
  assert.match(liveApp, /discoverOwnedCapabilities/);
  assert.match(liveApp, /trustedIssuerIds/);
  assert.doesNotMatch(liveApp, /Paper Analyzer|Research Insights/);
  assert.doesNotMatch(liveCss, /radial-gradient|linear-gradient/);
});

test("live payment UX keeps private-key safety explicit and uses a modal secondary flow", () => {
  assert.match(liveApp, /Pay to continue/);
  assert.match(liveApp, /never asks for your private key or seed phrase/i);
  assert.match(liveApp, /className="modal-backdrop"/);
});

test("live wallet connector is constrained to the supported CKB Testnet signer type", () => {
  assert.match(liveMain, /new ccc\.ClientPublicTestnet\(\)/);
  assert.match(liveMain, /clientOptions=\{\[\{ name: "CKB Testnet"/);
  assert.match(liveMain, /ccc\.SignerType\.CKB/);
});

test("product frontend dev command starts the live API alongside Vite", () => {
  const devCli = readFileSync("scripts/dev-cli.mjs", "utf8");
  const devProduct = readFileSync("scripts/dev-product.mjs", "utf8");
  const viteConfig = readFileSync("apps/web/vite.config.ts", "utf8");
  assert.match(devCli, /scripts\/dev-product\.mjs/);
  assert.match(devProduct, /apps\/live-service\/server\.mjs/);
  assert.match(devProduct, /SKILLPASS_API_ORIGIN/);
  assert.match(viteConfig, /process\.env\.SKILLPASS_API_ORIGIN/);
});

test("landing page makes the no-wallet demo the primary evaluation path", () => {
  assert.match(liveApp, /experienceMode/);
  assert.match(liveApp, /<DemoWorkspace/);
  assert.match(home, /Own the service right, not another account\./);
  assert.match(home, /Try interactive demo/);
  assert.match(home, /Connect JoyID · Live Testnet/);
  assert.match(home, /No wallet required for demo/);
  assert.match(home, /Live issuance stays provider-controlled/);
  assert.match(home, /Service Bundle Pass/);
  assert.match(home, /Model API/);
  assert.match(home, /Private Data API/);
  assert.match(home, /Compute API/);
});

test("connected no-pass state is recoverable instead of a dead end", () => {
  assert.match(liveApp, /<ConnectedNoPass/);
  assert.match(empty, /No live SkillPass yet\./);
  assert.match(empty, /Try interactive demo/);
  assert.match(empty, /Refresh ownership/);
  assert.match(empty, /Copy wallet address/);
  assert.match(empty, /provider-issued Capability Cell/i);
  assert.match(empty, /no public “mint my pass” button/i);
  assert.doesNotMatch(empty, /Alice → Bob, across several providers/);
});

test("integrated demo clearly separates simulated state from live Testnet", () => {
  assert.match(demoWorkspace, /Demo mode/i);
  assert.match(demoWorkspace, /Simulated capability lifecycle/);
  assert.match(demoWorkspace, /No wallet, funds, or blockchain transaction/);
  assert.match(demoWorkspace, /Open Live Testnet/);
  assert.match(liveApp, /experienceMode === "demo"/);
});

test("integrated demo proves Alice to Bob ownership invalidation and supports three providers", () => {
  assert.match(demoState, /requester === owner/);
  assert.match(demoState, /is not the current owner/);
  assert.match(demoWorkspace, /Transfer pass to/);
  assert.match(demoWorkspace, /Test .*'s access/);
  assert.match(demoWorkspace, /Access granted/);
  assert.match(demoWorkspace, /Access denied/);
  assert.match(demoServices, /Model API/);
  assert.match(demoServices, /Private Data API/);
  assert.match(demoServices, /Compute API/);
  assert.match(demoServices, /Provider A/);
  assert.match(demoServices, /Provider B/);
  assert.match(demoServices, /Provider C/);
});

test("automatic capability discovery does not duplicate the empty-state warning", () => {
  assert.match(liveApp, /refresh\(false\)/);
  assert.match(liveApp, /if \(found\.length \|\| announce\)/);
  assert.match(liveApp, /No new SkillPass was found for this wallet\./);
});
