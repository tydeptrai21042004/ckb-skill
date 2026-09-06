import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const json = async (path) => JSON.parse(await readFile(path, "utf8"));

test("npm workspaces link Vercel services and shared SkillPass packages", async () => {
  const root = await json(join(ROOT, "package.json"));
  assert.deepEqual(root.workspaces, ["apps/*", "packages/*"]);

  const web = await json(join(ROOT, "apps/web/package.json"));
  assert.equal(web.dependencies["@skillpass/ckb-client"], "1.0.0");
  assert.equal(web.dependencies["@skillpass/capability-codec"], "0.7.0");

  const ckb = await json(join(ROOT, "packages/ckb-client/package.json"));
  assert.equal(ckb.version, "1.0.0");
  assert.equal(ckb.dependencies["@skillpass/capability-codec"], "0.7.0");
  assert.equal(ckb.exports["./live"], "./src/live.ts");
});

test("web and ckb-client do not use brittle cross-workspace relative imports", async () => {
  const app = await readFile(join(ROOT, "apps/web/src/App.tsx"), "utf8");
  assert.match(app, /@skillpass\/ckb-client\/live/);
  assert.match(app, /@skillpass\/capability-codec/);
  assert.doesNotMatch(app, /\.\.\/\.\.\/\.\.\/packages\//);

  const live = await readFile(join(ROOT, "packages/ckb-client/src/live.ts"), "utf8");
  const example = await readFile(join(ROOT, "packages/ckb-client/src/testnet-example.ts"), "utf8");
  assert.doesNotMatch(live, /\.\.\/\.\.\/capability-codec\//);
  assert.doesNotMatch(example, /\.\.\/\.\.\/capability-codec\//);
});

test("web tsconfig only includes app source; imported workspace sources are followed transitively", async () => {
  const ts = await json(join(ROOT, "apps/web/tsconfig.json"));
  assert.deepEqual(ts.include, ["src"]);
});
