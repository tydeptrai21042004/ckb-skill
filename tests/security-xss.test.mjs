import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const port = 19000 + (process.pid % 1000);
const base = `http://127.0.0.1:${port}`;
let child;
let logs = "";

const XSS_PAYLOADS = [
  `<script>globalThis.__skillpassXss=1</script>. Method.`,
  `<img src=x onerror="globalThis.__skillpassXss=1"> Result.`,
  `<svg/onload=globalThis.__skillpassXss=1> Conclusion.`,
  `</textarea><script>globalThis.__skillpassXss=1</script> Method.`,
  `\"><img src=x onerror=globalThis.__skillpassXss=1> Result.`,
  `javascript:globalThis.__skillpassXss=1 Conclusion.`,
  `<iframe srcdoc="<script>globalThis.__skillpassXss=1</script>"></iframe> Method.`,
  `<a href="javascript:globalThis.__skillpassXss=1">click</a> Result.`,
  `<math><mtext></style><img src=x onerror=globalThis.__skillpassXss=1> Conclusion.`,
  `&lt;script&gt;globalThis.__skillpassXss=1&lt;/script&gt; Method.`,
];

async function waitForHealth() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {}
    await sleep(75);
  }
  throw new Error(`security test server did not start\n${logs}`);
}

async function post(path, body, headers = {}) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  let data;
  try { data = await response.json(); } catch { data = null; }
  return { response, data };
}

before(async () => {
  child = spawn(process.execPath, ["apps/demo-service/server.mjs"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => { logs += chunk.toString(); });
  child.stderr.on("data", (chunk) => { logs += chunk.toString(); });
  await waitForHealth();
});

after(async () => {
  child?.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child?.once("exit", resolve)),
    sleep(800),
  ]);
  if (child && !child.killed) child.kill("SIGKILL");
});

test("frontends contain no direct executable HTML/JS injection sinks", () => {
  const files = [
    "apps/demo-service/public/app.js",
    "apps/demo-service/public/index.html",
    "apps/web/src/App.tsx",
    "apps/web/src/main.tsx",
  ];
  const source = files.map((file) => readFileSync(file, "utf8")).join("\n");
  const forbidden = [
    /dangerouslySetInnerHTML/,
    /\.innerHTML\s*=/,
    /\.outerHTML\s*=/,
    /insertAdjacentHTML\s*\(/,
    /document\.write\s*\(/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
    /setTimeout\s*\(\s*["'`]/,
    /setInterval\s*\(\s*["'`]/,
    /javascript\s*:/i,
  ];
  for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `forbidden XSS sink matched ${pattern}`);
});

test("HTML entry points have no inline event handlers or inline executable scripts", () => {
  for (const file of ["apps/demo-service/public/index.html", "apps/web/index.html"]) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>\s*[^<\s]/i);
  }
});

test("demo HTML responses enforce a strict XSS-oriented CSP and security headers", async () => {
  const response = await fetch(`${base}/`);
  assert.equal(response.status, 200);
  const csp = response.headers.get("content-security-policy") || "";
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /require-trusted-types-for 'script'/);
  assert.match(csp, /trusted-types 'none'/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
});

test("JSON API responses stay JSON/nosniff even when the paper contains XSS syntax", async () => {
  const state = await (await fetch(`${base}/api/demo/state`)).json();
  for (const payload of XSS_PAYLOADS) {
    const { response, data } = await post("/api/demo/use", {
      identity: "alice",
      outPoint: state.currentOutPoint,
      text: payload,
    });
    assert.equal(response.status, 200, JSON.stringify(data));
    assert.match(response.headers.get("content-type") || "", /^application\/json/i);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(data.ok, true);
    assert.equal(typeof data.result.preview, "string");
    assert.ok(data.result.preview.length <= 500);
    assert.ok(data.result.preview.includes(payload.slice(0, Math.min(12, payload.length))));
  }
});

test("cross-site browser POST is rejected before application logic", async () => {
  const { response, data } = await post(
    "/api/demo/reset",
    {},
    { "sec-fetch-site": "cross-site" },
  );
  assert.equal(response.status, 403);
  assert.equal(data.error, "CROSS_SITE_REQUEST_DENIED");
});

test("state-changing endpoints reject form/text content types", async () => {
  for (const contentType of ["text/plain", "application/x-www-form-urlencoded"]) {
    const response = await fetch(`${base}/api/demo/reset`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: "x=1",
    });
    const data = await response.json();
    assert.equal(response.status, 415);
    assert.equal(data.error, "UNSUPPORTED_MEDIA_TYPE");
  }
});

test("malformed JSON returns a stable error without echoing attacker fragments", async () => {
  const attack = `{"x":"</script><img src=x onerror=alert(1)>"`;
  const { response, data } = await post("/api/demo/use", attack);
  assert.equal(response.status, 400);
  assert.equal(data.error, "INVALID_JSON");
  assert.equal(data.message, "request body must be valid JSON");
  assert.doesNotMatch(data.message, /script|img|onerror/i);
});

test("unknown paths do not reflect path-based HTML payloads", async () => {
  const payload = "%3Csvg%20onload%3Dalert(1)%3E.js";
  const response = await fetch(`${base}/${payload}`);
  const body = await response.text();
  assert.equal(response.status, 404);
  assert.doesNotMatch(body, /svg|onload|alert/i);
  assert.match(response.headers.get("content-type") || "", /^application\/json/i);
});

test("live service keeps CSP narrow and applies request/error hardening helpers", () => {
  const source = readFileSync("apps/live-service/server.mjs", "utf8");
  assert.match(source, /object-src 'none'/);
  assert.match(source, /frame-ancestors 'none'/);
  assert.match(source, /trustedTypesReportOnly: true/);
  assert.match(source, /rejectCrossSiteBrowserRequest\(req\)/);
  assert.match(source, /assertJsonRequest\(req\)/);
  assert.match(source, /safeRequestUrl\(req\)/);
  assert.match(source, /publicErrorMessage\(error\)/);
  assert.doesNotMatch(source, /img-src 'self' data: https:/);
  assert.doesNotMatch(source, /message:\s*error\?\.message/);
});

test("facilitator is JSON-only with a default-deny CSP and browser mutation guards", () => {
  const source = readFileSync("apps/fiber-facilitator/server.mjs", "utf8");
  assert.match(source, /default-src 'none'/);
  assert.match(source, /object-src 'none'/);
  assert.match(source, /rejectCrossSiteBrowserRequest\(req\)/);
  assert.match(source, /assertJsonRequest\(req\)/);
  assert.match(source, /publicErrorMessage\(error\)/);
});

test("demo rendering writes attacker-controlled values through text nodes only", () => {
  const source = readFileSync("apps/demo-service/public/app.js", "utf8");
  assert.match(source, /result-preview"\)\.textContent/);
  assert.match(source, /denied-message"\)\.textContent/);
  assert.match(source, /logEl\.textContent/);
  assert.match(source, /document\.createTextNode\(name\)/);
});
