import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { FLAG_TRANSFERABLE, encodeCapabilityHex } from "../packages/capability-codec/src/index.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../packages/capability-codec/src/service-ids.mjs";
import { randomId32 } from "../packages/capability-codec/src/node-ids.mjs";
import { InMemoryChain } from "../packages/verifier/src/in-memory-chain.mjs";
import { CapabilityVerifier } from "../packages/verifier/src/verifier.mjs";

const N = Number(process.env.BENCH_ITERATIONS || 10_000);
const OWNER = `0x${"aa".repeat(32)}`;
const ISSUER = `0x${"11".repeat(32)}`;
const chain = new InMemoryChain();
const cell = chain.issue({
  ownerLockHash: OWNER,
  issuerInputLockHash: ISSUER,
  data: encodeCapabilityHex({
    version: 1, flags: FLAG_TRANSFERABLE, serviceId: PAPER_ANALYZER_V1_SERVICE_ID,
    issuerId: ISSUER, capabilityId: randomId32(), expiry: BigInt(Math.floor(Date.now() / 1000) + 86_400),
  }),
});
const verifier = new CapabilityVerifier({ chain, expectedServiceId: PAPER_ANALYZER_V1_SERVICE_ID });
for (let i = 0; i < 500; i++) verifier.verify({ outPoint: cell.outPoint, requesterLockHash: OWNER });
const samples = new Array(N);
const started = performance.now();
for (let i = 0; i < N; i++) {
  const t0 = performance.now();
  verifier.verify({ outPoint: cell.outPoint, requesterLockHash: OWNER });
  samples[i] = performance.now() - t0;
}
const elapsedMs = performance.now() - started;
samples.sort((a, b) => a - b);
const q = (p) => samples[Math.min(samples.length - 1, Math.floor((samples.length - 1) * p))];
const result = {
  generatedAt: new Date().toISOString(), iterations: N, totalMs: elapsedMs,
  opsPerSecond: N / (elapsedMs / 1000),
  latencyMs: { p50: q(0.50), p95: q(0.95), p99: q(0.99), max: samples.at(-1) },
  boundary: "in-memory verifier only; excludes CKB RPC/network latency",
};
await mkdir("reports/benchmarks", { recursive: true });
await writeFile("reports/benchmarks/latest.json", JSON.stringify(result, null, 2) + "\n");
await writeFile("reports/benchmarks/latest.md", `# SkillPass local verifier benchmark\n\nGenerated: ${result.generatedAt}\n\n| Metric | Value |\n|---|---:|\n| Iterations | ${N.toLocaleString()} |\n| Throughput | ${result.opsPerSecond.toFixed(0)} ops/s |\n| p50 | ${result.latencyMs.p50.toFixed(4)} ms |\n| p95 | ${result.latencyMs.p95.toFixed(4)} ms |\n| p99 | ${result.latencyMs.p99.toFixed(4)} ms |\n| max | ${result.latencyMs.max.toFixed(4)} ms |\n\n> ${result.boundary}.\n`);
console.log(JSON.stringify(result, null, 2));
