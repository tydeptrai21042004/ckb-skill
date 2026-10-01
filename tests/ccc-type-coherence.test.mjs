import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

test("web app and web-facing CKB client use the same CCC connector Signer family", async () => {
  const webPkg = await json("apps/web/package.json");
  const clientPkg = await json("packages/ckb-client/package.json");
  const app = await readFile("apps/web/src/App.tsx", "utf8");
  const live = await readFile("packages/ckb-client/src/live.ts", "utf8");

  const webConnector = webPkg.dependencies?.["@ckb-ccc/connector-react"];
  const clientConnector = clientPkg.dependencies?.["@ckb-ccc/connector-react"];

  assert.ok(webConnector, "web must declare @ckb-ccc/connector-react");
  assert.equal(clientConnector, webConnector, "web and @skillpass/ckb-client must pin the same connector-react version");
  assert.match(app, /from\s+["']@ckb-ccc\/connector-react["']/, "App.tsx must use connector-react");
  assert.match(live, /from\s+["']@ckb-ccc\/connector-react["']/, "live.ts must use the same connector-react namespace as App.tsx");
  assert.doesNotMatch(live, /from\s+["']@ckb-ccc\/ccc["']/, "live.ts must not expose Signer types from a second CCC bundle");
});

test("install-script approvals live only at workspace root", async () => {
  const rootPkg = await json("package.json");
  const webPkg = await json("apps/web/package.json");

  assert.equal(webPkg.allowScripts, undefined, "workspace allowScripts is ignored by npm and must not be present");
  assert.equal(rootPkg.allowScripts?.["esbuild@0.25.12"], true);
  assert.equal(rootPkg.allowScripts?.["esbuild@0.27.7"], true);
});
