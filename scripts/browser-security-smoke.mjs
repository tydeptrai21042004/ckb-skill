import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

function findChromium() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    "chromium",
    "chromium-browser",
    "google-chrome",
    "google-chrome-stable",
  ].filter(Boolean);
  for (const name of candidates) {
    const result = spawnSync("sh", ["-lc", `command -v ${JSON.stringify(name)}`], { encoding: "utf8" });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return null;
}

const chromium = findChromium();
if (!chromium) {
  if (process.env.REQUIRE_BROWSER_SECURITY === "1") throw new Error("Chromium is required but was not found");
  console.log("BROWSER SECURITY SMOKE SKIPPED: Chromium not installed");
  process.exit(0);
}

const appPort = 19870 + (process.pid % 100);
const debugPort = 19970 + (process.pid % 100);
const healthBase = `http://127.0.0.1:${appPort}`;
const base = `http://skillpass.test:${appPort}`;
const profile = await mkdtemp(join(tmpdir(), "skillpass-chromium-"));
let serverLogs = "";
let browserLogs = "";
const server = spawn(process.execPath, ["apps/demo-service/server.mjs"], {
  env: { ...process.env, HOST: "127.0.0.1", PORT: String(appPort) },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => { serverLogs += chunk.toString(); });
server.stderr.on("data", (chunk) => { serverLogs += chunk.toString(); });

const browser = spawn(chromium, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--disable-extensions",
  "--disable-background-networking",
  "--no-proxy-server",
  "--host-resolver-rules=MAP skillpass.test 127.0.0.1",
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "pipe", "pipe"] });
browser.stdout.on("data", (chunk) => { browserLogs += chunk.toString(); });
browser.stderr.on("data", (chunk) => { browserLogs += chunk.toString(); });

async function waitFor(url, label) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await sleep(100);
  }
  throw new Error(`${label} did not become ready\nserver:\n${serverLogs}\nbrowser:\n${browserLogs}`);
}

class Cdp {
  constructor(wsUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.ws = new WebSocket(wsUrl);
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
    return result.result?.value;
  }
  close() { this.ws.close(); }
}

let cdp;
try {
  await waitFor(`${healthBase}/health`, "demo service");
  await waitFor(`http://127.0.0.1:${debugPort}/json/version`, "Chromium DevTools");
  const pageInfoResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(base + "/")}`, { method: "PUT" });
  if (!pageInfoResponse.ok) throw new Error(`Could not create Chromium target: ${pageInfoResponse.status}`);
  const pageInfo = await pageInfoResponse.json();
  cdp = new Cdp(pageInfo.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.navigate", { url: `${base}/` });
  await sleep(250);
  const initialPage = await cdp.eval(`JSON.stringify({ href: location.href, text: document.body?.innerText?.slice(0, 300) || "" })`);
  const initial = JSON.parse(initialPage || "{}");
  if (String(initial.href || "").startsWith("chrome-error://") && /blocked|organization/i.test(String(initial.text || ""))) {
    throw Object.assign(new Error("Chromium policy blocks local security test pages"), { code: "BROWSER_POLICY_BLOCK" });
  }

  for (let i = 0; i < 80; i += 1) {
    const ready = await cdp.eval("document.readyState === 'complete' && Boolean(document.querySelector('#run'))");
    if (ready) break;
    if (i === 79) throw new Error("SkillPass UI did not become interactive");
    await sleep(100);
  }

  const payload = `<img src=x onerror="globalThis.__skillpassXss=(globalThis.__skillpassXss||0)+1"> <svg onload="globalThis.__skillpassXss=(globalThis.__skillpassXss||0)+1"></svg> Method. Result. Conclusion.`;
  await cdp.eval(`(() => {
    globalThis.__skillpassXss = 0;
    const textarea = document.querySelector('#paper');
    textarea.value = ${JSON.stringify(payload)};
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#run').click();
    return true;
  })()`);

  for (let i = 0; i < 80; i += 1) {
    const status = await cdp.eval("document.querySelector('#result-status')?.textContent");
    if (status === "Access granted") break;
    if (i === 79) throw new Error(`Analysis did not complete; last status=${status}`);
    await sleep(100);
  }

  const rendered = await cdp.eval(`(() => ({
    marker: globalThis.__skillpassXss,
    text: document.querySelector('#result-preview').textContent,
    html: document.querySelector('#result-preview').innerHTML,
  }))()`);
  if (rendered.marker !== 0) throw new Error(`XSS marker executed ${rendered.marker} time(s)`);
  if (!rendered.text.includes("<img")) throw new Error("payload was not rendered as plain text");
  if (!rendered.html.includes("&lt;img")) throw new Error("DOM serialization does not show escaped payload text");

  const inlineBlocked = await cdp.eval(`(async () => {
    globalThis.__skillpassInline = 0;
    const script = document.createElement('script');
    script.textContent = 'globalThis.__skillpassInline = 1';
    document.body.appendChild(script);
    await new Promise((resolve) => setTimeout(resolve, 50));
    return globalThis.__skillpassInline === 0;
  })()`);
  if (!inlineBlocked) throw new Error("CSP failed to block an injected inline script");

  const trustedTypesBlocked = await cdp.eval(`(() => {
    try {
      document.querySelector('#result-preview').innerHTML = '<img src=x onerror=globalThis.__skillpassXss=99>';
      return false;
    } catch (error) {
      return error && error.name === 'TypeError';
    }
  })()`);
  if (!trustedTypesBlocked) throw new Error("Trusted Types did not block string assignment to innerHTML");

  console.log("BROWSER SECURITY SMOKE PASSED: payload stayed text; CSP blocked inline script; Trusted Types blocked innerHTML sink");
} catch (error) {
  if (error?.code === "BROWSER_POLICY_BLOCK" && process.env.REQUIRE_BROWSER_SECURITY !== "1") {
    console.log("BROWSER SECURITY SMOKE SKIPPED: Chromium policy blocks local test pages in this environment");
  } else {
    throw error;
  }
} finally {
  try { cdp?.close(); } catch {}
  browser.kill("SIGTERM");
  server.kill("SIGTERM");
  await sleep(250);
  if (!browser.killed) browser.kill("SIGKILL");
  if (!server.killed) server.kill("SIGKILL");
  await rm(profile, { recursive: true, force: true });
}
