import { ccc } from "@ckb-ccc/ccc";

function rpcError(method, payload) {
  const detail = payload?.error?.message || payload?.error?.code || "unknown RPC error";
  return Object.assign(new Error(`CKB RPC ${method} failed: ${detail}`), { code: "CKB_RPC_ERROR", rpc: payload?.error });
}

export function normalizeRpcUrl(value) {
  const url = new URL(String(value || "https://testnet.ckb.dev"));
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("CKB RPC URL must use http or https");
  if (url.username || url.password) throw new Error("CKB RPC URL must not embed credentials");
  return url.toString();
}

export function createCkbRpc(url = process.env.CKB_RPC_URL || "https://testnet.ckb.dev") {
  const endpoint = normalizeRpcUrl(url);
  let id = 0;
  return Object.freeze({
    endpoint,
    async call(method, params = []) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "user-agent": "SkillPass-Evidence/1.0" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
        redirect: "error",
      });
      if (!response.ok) throw Object.assign(new Error(`CKB RPC ${method} returned HTTP ${response.status}`), { code: "CKB_RPC_HTTP_ERROR" });
      const payload = await response.json();
      if (payload?.error) throw rpcError(method, payload);
      return payload?.result;
    },
  });
}

export function rpcIndex(index) {
  const n = typeof index === "bigint" ? index : BigInt(index);
  if (n < 0n) throw new Error("outpoint index must be non-negative");
  return `0x${n.toString(16)}`;
}

export function toRpcOutPoint(outPoint) {
  if (!outPoint || !/^0x[0-9a-fA-F]{64}$/.test(String(outPoint.txHash || ""))) throw new Error("outPoint.txHash must be 32-byte hex");
  return { tx_hash: String(outPoint.txHash).toLowerCase(), index: rpcIndex(outPoint.index) };
}

export function fromRpcScript(script) {
  if (!script) return null;
  return {
    codeHash: String(script.code_hash ?? script.codeHash).toLowerCase(),
    hashType: String(script.hash_type ?? script.hashType),
    args: String(script.args).toLowerCase(),
  };
}

export function scriptHash(script) {
  const normalized = fromRpcScript(script);
  if (!normalized) return "";
  return String(ccc.Script.from(normalized).hash()).toLowerCase();
}

export function hexBytes(value) {
  const hex = String(value || "").replace(/^0x/i, "");
  if (hex.length % 2 || !/^[0-9a-f]*$/i.test(hex)) throw new Error("invalid hex bytes");
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

function transactionView(result) {
  const tx = result?.transaction?.inner ?? result?.transaction;
  return tx && typeof tx === "object" ? tx : null;
}

export async function getTransaction(rpc, txHash) {
  let result;
  try { result = await rpc.call("get_transaction", [String(txHash), "0x2"]); }
  catch (first) {
    try { result = await rpc.call("get_transaction", [String(txHash)]); }
    catch { throw first; }
  }
  const transaction = transactionView(result);
  if (!transaction) throw Object.assign(new Error(`transaction not found: ${txHash}`), { code: "TX_NOT_FOUND" });
  return { transaction, status: result?.tx_status ?? result?.txStatus ?? null };
}

export async function getHeaderNumber(rpc, blockHash) {
  if (!blockHash) return null;
  const header = await rpc.call("get_header", [String(blockHash)]);
  const raw = header?.inner?.number ?? header?.number;
  return raw == null ? null : BigInt(raw);
}

export async function getTipNumber(rpc) {
  const header = await rpc.call("get_tip_header", []);
  const raw = header?.inner?.number ?? header?.number;
  if (raw == null) throw new Error("CKB tip header does not contain a block number");
  return BigInt(raw);
}

export async function transactionConfirmations(rpc, txHash) {
  const record = await getTransaction(rpc, txHash);
  const blockHash = record.status?.block_hash ?? record.status?.blockHash ?? null;
  if (!blockHash) return { confirmations: 0, blockNumber: null, status: String(record.status?.status || "unknown") };
  const [included, tip] = await Promise.all([getHeaderNumber(rpc, blockHash), getTipNumber(rpc)]);
  if (included == null) return { confirmations: 0, blockNumber: null, status: String(record.status?.status || "unknown") };
  return {
    confirmations: tip >= included ? Number(tip - included + 1n) : 0,
    blockNumber: included.toString(),
    tipBlockNumber: tip.toString(),
    status: String(record.status?.status || "committed"),
  };
}

export async function getHistoricalCell(rpc, outPoint) {
  const { transaction } = await getTransaction(rpc, outPoint.txHash);
  const index = Number(outPoint.index);
  const output = transaction.outputs?.[index];
  const outputData = transaction.outputs_data?.[index] ?? transaction.outputsData?.[index];
  if (!output || outputData == null) throw Object.assign(new Error(`transaction output not found at index ${index}`), { code: "OUTPUT_NOT_FOUND" });
  const lock = fromRpcScript(output.lock);
  const type = fromRpcScript(output.type);
  const finality = await transactionConfirmations(rpc, outPoint.txHash);
  return {
    cellOutput: { capacity: output.capacity, lock, type },
    outputData: String(outputData).toLowerCase(),
    lockHash: scriptHash(output.lock),
    confirmations: finality.confirmations,
    blockNumber: finality.blockNumber,
    txStatus: finality.status,
  };
}

export async function getLiveCell(rpc, outPoint) {
  const result = await rpc.call("get_live_cell", [toRpcOutPoint(outPoint), true]);
  const status = String(result?.status || "unknown").toLowerCase();
  if (status !== "live") return null;
  const cell = result?.cell;
  const output = cell?.output;
  const outputData = cell?.data?.content ?? cell?.data;
  if (!output || outputData == null) throw new Error("live cell response is incomplete");
  const finality = await transactionConfirmations(rpc, outPoint.txHash);
  return {
    cellOutput: { capacity: output.capacity, lock: fromRpcScript(output.lock), type: fromRpcScript(output.type) },
    outputData: String(outputData).toLowerCase(),
    lockHash: scriptHash(output.lock),
    confirmations: finality.confirmations,
    blockNumber: finality.blockNumber,
    txStatus: finality.status,
  };
}

export async function liveCellStatus(rpc, outPoint) {
  const result = await rpc.call("get_live_cell", [toRpcOutPoint(outPoint), false]);
  return String(result?.status || "unknown").toLowerCase();
}

export function transactionConsumesOutPoint(transaction, outPoint) {
  const expectedHash = String(outPoint.txHash).toLowerCase();
  const expectedIndex = BigInt(outPoint.index);
  return (transaction.inputs || []).some((input) => {
    const previous = input.previous_output ?? input.previousOutput;
    if (!previous) return false;
    const hash = String(previous.tx_hash ?? previous.txHash).toLowerCase();
    try { return hash === expectedHash && BigInt(previous.index) === expectedIndex; }
    catch { return false; }
  });
}

export function dataCodeHash(outputData) {
  return String(ccc.hashCkb(hexBytes(outputData))).toLowerCase();
}
