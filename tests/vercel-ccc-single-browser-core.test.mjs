import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const live = fs.readFileSync("packages/ckb-client/src/live.ts", "utf8");
const app = fs.readFileSync("apps/web/src/App.tsx", "utf8");
const webPkg = JSON.parse(fs.readFileSync("apps/web/package.json", "utf8"));
const clientPkg = JSON.parse(fs.readFileSync("packages/ckb-client/package.json", "utf8"));

test("browser signer and live transaction helpers use connector-react CCC", () => {
  assert.match(app, /from ["']@ckb-ccc\/connector-react["']/);
  assert.match(live, /from ["']@ckb-ccc\/connector-react["']/);
  assert.doesNotMatch(live, /from ["']@ckb-ccc\/ccc["']/);
  assert.equal(clientPkg.dependencies["@ckb-ccc/connector-react"], webPkg.dependencies["@ckb-ccc/connector-react"]);
  assert.equal(webPkg.dependencies["@ckb-ccc/ccc"], undefined);
});
