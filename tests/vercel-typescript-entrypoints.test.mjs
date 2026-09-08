import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

async function json(path) {
  return JSON.parse(await readFile(join(ROOT, path), "utf8"));
}

for (const service of ["apps/live-service", "apps/fiber-facilitator"]) {
  test(`${service} declares its own Node TypeScript build dependencies`, async () => {
    const pkg = await json(`${service}/package.json`);
    assert.equal(pkg.engines?.node, "24.x");
    assert.equal(pkg.devDependencies?.["@types/node"], "24.13.3");
    assert.equal(pkg.devDependencies?.typescript, "5.9.2");

    const tsconfig = await json(`${service}/tsconfig.json`);
    assert.deepEqual(tsconfig.compilerOptions?.types, ["node"]);
    assert.equal(tsconfig.compilerOptions?.module, "NodeNext");
    assert.equal(tsconfig.compilerOptions?.moduleResolution, "NodeNext");
    assert.equal(tsconfig.compilerOptions?.noEmit, true);
    assert.deepEqual(tsconfig.include, ["server.ts"]);
  });

  test(`${service} Vercel TypeScript wrapper keeps the runtime JS module behind a typed dynamic boundary`, async () => {
    const source = await readFile(join(ROOT, service, "server.ts"), "utf8");
    assert.match(source, /from "node:http"/);
    assert.match(source, /from "node:crypto"/);
    assert.match(source, /runtimeEntrypoint = "\.\/server\.mjs"/);
    assert.match(source, /as \{ server: http\.Server \}/);
    assert.doesNotMatch(source, /import\("\.\/server\.mjs"\)/);
  });
}

test("workspace pins the Vercel Node major instead of allowing automatic future major upgrades", async () => {
  const pkg = await json("package.json");
  assert.equal(pkg.engines?.node, "24.x");
  assert.equal(pkg.devDependencies?.["@types/node"], "24.13.3");
  assert.equal(pkg.devDependencies?.typescript, "5.9.2");
  assert.equal(pkg.allowScripts?.["esbuild@0.25.12"], true);
  assert.match(pkg.scripts?.["typecheck:vercel"] || "", /apps\/live-service\/tsconfig\.json/);
  assert.match(pkg.scripts?.["typecheck:vercel"] || "", /apps\/fiber-facilitator\/tsconfig\.json/);
});
