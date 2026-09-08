import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const json = (path) => JSON.parse(read(path));

test("web development defaults stay loopback-only and use the patched Vite 7 line", () => {
  const pkg = json("apps/web/package.json");
  assert.equal(pkg.scripts.dev, "vite --host 127.0.0.1");
  assert.equal(pkg.scripts["dev:lan"], "vite --host 0.0.0.0");
  assert.equal(pkg.scripts.preview, "vite preview --host 127.0.0.1");
  assert.equal(pkg.scripts["preview:lan"], "vite preview --host 0.0.0.0");
  assert.equal(pkg.devDependencies.vite, "7.3.5");

  const vite = read("apps/web/vite.config.ts");
  assert.match(vite, /host:\s*["']127\.0\.0\.1["']/);
  assert.match(vite, /strictPort:\s*true/);
  assert.doesNotMatch(vite, /allow:\s*\[\s*fileURLToPath\(new URL\(["']\.\.\/\.\.["']/);
  assert.match(vite, /SKILLPASS_BUILD_SOURCEMAPS/);

  const pairedDev = read("scripts/dev-product.mjs");
  assert.match(pairedDev, /--host["'],\s*["']127\.0\.0\.1/);
  assert.doesNotMatch(pairedDev, /--host["'],\s*["']0\.0\.0\.0/);
});

test("container Node runtime matches the repository Node 24 engine", () => {
  assert.equal(json("package.json").engines.node, "24.x");
  for (const path of ["Dockerfile", "Dockerfile.live", "Dockerfile.facilitator"]) {
    const dockerfile = read(path);
    assert.match(dockerfile, /FROM node:24\.20\.0-alpine3\.24/);
    assert.doesNotMatch(dockerfile, /FROM node:22\./);
  }
});

test("paid production fails closed on facilitator authentication and proxy identity", () => {
  const server = read("apps/live-service/server.mjs");
  assert.match(server, /PAYMENTS_REQUIRED && FACILITATOR_AUTH_TOKEN\.length < 32/);
  const vercelBranch = server.slice(server.indexOf("function requestKey(req)"), server.indexOf("function requestKey(req)") + 700);
  assert.match(vercelBranch, /x-vercel-forwarded-for/);
  assert.doesNotMatch(vercelBranch.split("} else if \(TRUST_PROXY\)")[0] || "", /x-forwarded-for/);
});

test("Fiber/facilitator HTTP clients reject credential-bearing URLs and redirects", () => {
  for (const path of ["packages/x402-fiber/src/http-client.mjs", "packages/x402-fiber/src/fiber-rpc.mjs"]) {
    const src = read(path);
    assert.match(src, /username\s*\|\|\s*parsed\.password/);
    assert.match(src, /redirect:\s*["']error["']/);
    assert.match(src, /\["http:",\s*"https:"\]/);
  }
});

test("shared HTTP responses disable DNS prefetch", () => {
  assert.match(read("packages/http-security/src/index.mjs"), /["']x-dns-prefetch-control["']:\s*["']off["']/);
});

test("security CI uses Node 24, read-only repository permissions and no production secrets", () => {
  const workflow = read(".github/workflows/security-readiness.yml");
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /node-version:\s*['"]24\.20\.0['"]/);
  assert.match(workflow, /node scripts\/security-preflight\.mjs/);
  assert.match(workflow, /node --test/);
  assert.doesNotMatch(workflow, /secrets\./);
});
