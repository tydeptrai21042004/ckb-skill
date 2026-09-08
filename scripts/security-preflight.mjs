import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const errors = [];
const warnings = [];
const ok = (m) => console.log(`[OK] ${m}`);
const bad = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function text(path) { return readFileSync(join(ROOT, path), "utf8"); }
function json(path) { return JSON.parse(text(path)); }
function mustMatch(path, regex, message) {
  if (!regex.test(text(path))) bad(`${path}: ${message}`);
}
function mustNotMatch(path, regex, message) {
  if (regex.test(text(path))) bad(`${path}: ${message}`);
}

const vercel = json("vercel.json");
if (Object.prototype.hasOwnProperty.call(vercel.services?.api ?? {}, "maxDuration")) bad("vercel.json: services.api.maxDuration is invalid in the current Vercel Services schema; configure duration in Vercel settings instead");
if (Object.prototype.hasOwnProperty.call(vercel.services?.facilitator ?? {}, "maxDuration")) bad("vercel.json: services.facilitator.maxDuration is invalid in the current Vercel Services schema; configure duration in Vercel settings instead");
const headers = JSON.stringify(vercel.headers || []);
for (const required of [
  "Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options",
  "Referrer-Policy", "Strict-Transport-Security", "Permissions-Policy",
]) if (!headers.includes(required)) bad(`vercel.json: missing ${required}`);
if (!headers.includes("object-src 'none'")) bad("vercel.json: CSP must block object-src");
if (!headers.includes("frame-ancestors 'none'")) bad("vercel.json: CSP must block framing");
ok("Vercel function duration and response-header guards checked");

const env = text(".env.vercel.example");
for (const required of [
  /STATE_BACKEND=postgres/, /POSTGRES_POOL_MAX=2/, /SKILLPASS_PUBLIC_PRODUCTION=true/,
  /CAPABILITY_TRUSTED_ISSUER_ID=/,
  /ENABLE_PUBLIC_ISSUE=false/, /PAYMENTS_REQUIRED=false/, /FIBER_BACKEND=mock/,
  /ALLOW_DEV_PAYMENT=false/, /ENABLE_DEEP_HEALTH=false/,
  /ANALYZE_RATE_LIMIT_PER_MINUTE=8/, /UPSTREAM_TIMEOUT_MS=8000/,
]) if (!required.test(env)) bad(`.env.vercel.example missing hardened default ${required}`);
mustNotMatch(".env.vercel.example", /^DATABASE_URL=postgres/m, "must not contain a real/local database URL");
ok("Hardened Vercel defaults checked");

mustMatch("apps/live-service/server.mjs", /authenticateProtectedRequest\(requestBody\)[\s\S]{0,1600}createPaymentQuote\(/,
  "wallet + live CKB ownership verification must happen before invoice creation");
mustMatch("apps/live-service/server.mjs", /ENABLE_DEEP_HEALTH[\s\S]*DEEP_HEALTH_TOKEN/,
  "deep health endpoint must be opt-in/token guarded");
mustMatch("apps/live-service/server.mjs", /assertRequestEnvelope\(req/,
  "request URL/header envelope guard is required");
mustMatch("apps/live-service/server.mjs", /requestTimeout\s*=\s*12_000/,
  "server request timeout should stay bounded");
mustMatch("apps/fiber-facilitator/server.mjs", /FACILITATOR_AUTH_TOKEN[\s\S]*32/,
  "public facilitator requires a strong auth token");
mustMatch("apps/fiber-facilitator/server.mjs", /assertRequestEnvelope\(req/,
  "facilitator request envelope guard is required");
ok("Protected flow ordering, limits, and facilitator guards checked");

// Direct dependencies must be exact versions. This does not replace a lockfile or npm audit.
const packageFiles = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "target", ".git", "dist", "build"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name === "package.json") packageFiles.push(p);
  }
}
walk(ROOT);
for (const p of packageFiles) {
  const pkg = JSON.parse(readFileSync(p, "utf8"));
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries(pkg[section] || {})) {
      if (/^[~^*]|\s|>|<|\|\||\b(latest|next|beta|canary)\b/i.test(String(version))) {
        bad(`${relative(ROOT, p)}: ${section}.${name} is not pinned exactly (${version})`);
      }
    }
  }
}
ok(`Checked exact direct dependency versions in ${packageFiles.length} package.json files`);

// Block common accidental production secrets in executable/config files.
const scanRoots = ["apps", "packages", "scripts"];
const secretPatterns = [
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key"],
  [/\bsk_live_[A-Za-z0-9_-]{12,}\b/, "live API key"],
  [/\bpostgres(?:ql)?:\/\/[^\s:'\"]+:[^\s@'\"]{12,}@/i, "embedded PostgreSQL password"],
];
function scan(dir) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "target", "dist", "build"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) scan(p);
    else if (st.size <= 1_000_000 && /\.(?:mjs|js|ts|tsx|json|sh)$/.test(name)) {
      const src = readFileSync(p, "utf8");
      for (const [re, label] of secretPatterns) if (re.test(src)) bad(`${relative(ROOT,p)} appears to contain a ${label}`);
    }
  }
}
for (const r of scanRoots) scan(join(ROOT, r));
ok("Basic accidental-secret scan checked executable/config sources");

const lockfiles = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"]
  .filter((p) => { try { return statSync(join(ROOT,p)).isFile(); } catch { return false; } });
if (!lockfiles.length) warn("No root lockfile is present. Direct versions are pinned, but transitive dependencies are not fully reproducible. Generate/commit lockfiles and run npm audit before a high-risk production launch.");

if (warnings.length) {
  console.warn("\nWarnings:");
  for (const item of warnings) console.warn(`  - ${item}`);
}
if (errors.length) {
  console.error("\nSecurity preflight FAILED:");
  for (const item of errors) console.error(`  - ${item}`);
  process.exit(1);
}
console.log("\nSkillPass security preflight: PASS");
