import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const demoHtml = readFileSync("apps/demo-service/public/index.html", "utf8");
const demoCss = readFileSync("apps/demo-service/public/styles.css", "utf8");
const demoJs = readFileSync("apps/demo-service/public/app.js", "utf8");
const liveApp = readFileSync("apps/web/src/App.tsx", "utf8");
const liveMain = readFileSync("apps/web/src/main.tsx", "utf8");
const liveCss = readFileSync("apps/web/src/styles.css", "utf8");

test("local demo uses one focused product workspace instead of numbered dashboard cards", () => {
  assert.match(demoHtml, /class="workspace"/);
  assert.match(demoHtml, /id="run"/);
  assert.match(demoHtml, /data-identity="alice"/);
  assert.match(demoHtml, /name="mode" value="paid"/);
  assert.doesNotMatch(demoHtml, /class="step"/);
  assert.doesNotMatch(demoCss, /radial-gradient|linear-gradient/);
});

test("local demo renders structured service results and reversible ownership transfer", () => {
  assert.match(demoHtml, /id="metric-words"/);
  assert.match(demoHtml, /id="result-preview"/);
  assert.match(demoJs, /const to = from === "alice" \? "bob" : "alice"/);
  assert.match(demoJs, /renderSuccess\(result\)/);
});

test("live CCC frontend has a single editor workspace with readable result output", () => {
  assert.equal((liveApp.match(/<textarea/g) || []).length, 1);
  assert.match(liveApp, /Analysis result/);
  assert.match(liveApp, /metric-grid/);
  assert.match(liveApp, /Manage this pass/);
  assert.doesNotMatch(liveApp, /Your capabilities/);
  assert.doesNotMatch(liveCss, /radial-gradient|linear-gradient/);
});

test("live payment UX keeps private-key safety explicit and uses a modal secondary flow", () => {
  assert.match(liveApp, /Pay to continue/);
  assert.match(liveApp, /never asks for your private key or seed phrase/i);
  assert.match(liveApp, /className="modal-backdrop"/);
});


test("live wallet connector is constrained to the network and signer type the app supports", () => {
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
  assert.match(viteConfig, /"\/.well-known": apiOrigin/);
});
