import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

test("extract-offckb-deployment converts current OffCKB scripts.json to SkillPass metadata and env", async () => {
  const dir = await mkdtemp(join(tmpdir(), "skillpass-offckb-"));
  const scriptsPath = join(dir, "scripts.json");
  const deploymentPath = join(dir, "testnet.json");
  const envPath = join(dir, ".env.vercel.generated");
  const codeHash = `0x${"11".repeat(32)}`;
  const txHash = `0x${"22".repeat(32)}`;

  await writeFile(scriptsPath, JSON.stringify({
    devnet: {},
    testnet: {
      "capability-type": {
        codeHash,
        hashType: "data2",
        cellDeps: [{ cellDep: { outPoint: { txHash, index: 0 }, depType: "code" } }],
      },
    },
    mainnet: {},
  }));

  const run = spawnSync(process.execPath, [
    join(ROOT, "scripts/extract-offckb-deployment.mjs"),
    "--scripts", scriptsPath,
    "--deployment", deploymentPath,
    "--env", envPath,
  ], { encoding: "utf8" });

  assert.equal(run.status, 0, run.stderr);
  const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
  assert.deepEqual(deployment, { network: "testnet", codeHash, hashType: "data2", depTxHash: txHash, depIndex: 0 });

  const env = await readFile(envPath, "utf8");
  assert.match(env, new RegExp(`CAPABILITY_CODE_HASH=${codeHash}`));
  assert.match(env, /CAPABILITY_HASH_TYPE=data2/);
  assert.match(env, new RegExp(`CAPABILITY_DEP_TX_HASH=${txHash}`));
  assert.match(env, /STATE_BACKEND=postgres/);
  assert.match(env, /PAYMENTS_REQUIRED=false/);
  assert.match(env, /FACILITATOR_AUTH_TOKEN=[0-9a-f]{64}/);
  assert.doesNotMatch(env, /^DATABASE_URL=/m);
});

test("one-command Vercel setup assets are present and safe by default", async () => {
  const setup = await readFile(join(ROOT, "setup-vercel.sh"), "utf8");
  const envExample = await readFile(join(ROOT, ".env.vercel.example"), "utf8");
  const vercel = JSON.parse(await readFile(join(ROOT, "vercel.json"), "utf8"));

  assert.match(setup, /offckb deploy/);
  assert.match(setup, /extract-offckb-deployment\.mjs/);
  assert.match(setup, /vercel integration add neon/);
  assert.match(setup, /vercel env add/);
  assert.match(setup, /vercel --prod/);
  assert.match(setup, /PAYMENTS_REQUIRED=false|generated SkillPass environment/i);
  assert.match(envExample, /CAPABILITY_HASH_TYPE=data2/);
  assert.match(envExample, /STATE_BACKEND=postgres/);
  assert.match(envExample, /PAYMENTS_REQUIRED=false/);
  assert.ok(vercel.services?.web);
  assert.ok(vercel.services?.api);
  assert.ok(vercel.services?.facilitator);
});
