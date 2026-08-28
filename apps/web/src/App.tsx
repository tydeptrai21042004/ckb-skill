import { useEffect, useMemo, useState } from "react";
import { ccc } from "@ckb-ccc/connector-react";
import {
  buildIssueCapabilityTx,
  buildTransferCapabilityTx,
  discoverOwnedCapabilities,
  sendAndWait,
  type Deployment,
} from "../../../packages/ckb-client/src/live";
import { FLAG_TRANSFERABLE } from "../../../packages/capability-codec/src/index.mjs";

type RuntimeConfig = {
  network: "testnet";
  deployment: Deployment;
  serviceId: `0x${string}`;
  service: string;
  enablePublicIssue: boolean;
};

type Found = Awaited<ReturnType<typeof discoverOwnedCapabilities>>[number];

function short(value: string, n = 9) {
  return value.length > n * 2 ? `${value.slice(0, n)}…${value.slice(-n)}` : value;
}

function outPointJson(cell: Found["cell"]) {
  return { txHash: cell.outPoint.txHash, index: cell.outPoint.index.toString() };
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await res.json();
  if (!res.ok) throw new Error(value.message || value.error || `HTTP ${res.status}`);
  return value;
}

export default function App() {
  const { open, disconnect, wallet, signerInfo } = ccc.useCcc();
  const signer = ccc.useSigner();
  const [config, setConfig] = useState<RuntimeConfig>();
  const [address, setAddress] = useState("");
  const [caps, setCaps] = useState<Found[]>([]);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("Loading SkillPass configuration…");
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState("Method. We verify access against the current live CKB Capability Cell. Result. Ownership controls access. Conclusion.");
  const [issueDays, setIssueDays] = useState(7);

  useEffect(() => {
    api<RuntimeConfig>("/api/config")
      .then((c) => { setConfig(c); setStatus("CKB Testnet configuration loaded."); })
      .catch((e) => setStatus(`Configuration error: ${e.message}`));
  }, []);

  useEffect(() => {
    if (!signer) { setAddress(""); setCaps([]); return; }
    signer.getRecommendedAddress()
      .then(setAddress)
      .catch((e) => setStatus(`Wallet address error: ${e.message}`));
  }, [signer]);

  async function refresh() {
    if (!signer || !config) return;
    setBusy("refresh");
    try {
      const found = await discoverOwnedCapabilities({ signer, deployment: config.deployment });
      setCaps(found);
      setStatus(`Found ${found.length} live SkillPass capability cell${found.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setStatus(`Discovery failed: ${(e as Error).message}`);
    } finally { setBusy(""); }
  }

  useEffect(() => { if (signer && config) void refresh(); }, [signer, config]);

  async function issue() {
    if (!signer || !config || !config.enablePublicIssue) return;
    setBusy("issue");
    try {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, issueDays) * 86_400);
      const { tx, capabilityId } = await buildIssueCapabilityTx({ signer, deployment: config.deployment, serviceId: config.serviceId, expiry, flags: FLAG_TRANSFERABLE });
      const { txHash } = await sendAndWait(signer, tx);
      setStatus(`Capability issued. tx=${txHash}; id=${capabilityId}`);
      await refresh();
    } catch (e) { setStatus(`Issue failed: ${(e as Error).message}`); }
    finally { setBusy(""); }
  }

  async function transfer(cap: Found) {
    if (!signer || !config || !recipient.trim()) return;
    setBusy(`transfer:${cap.capability.capabilityId}`);
    try {
      const tx = await buildTransferCapabilityTx({ signer, deployment: config.deployment, outPoint: cap.cell.outPoint, recipientAddress: recipient.trim() });
      const { txHash } = await sendAndWait(signer, tx);
      setStatus(`Transfer confirmed: ${txHash}`);
      setRecipient("");
      await refresh();
    } catch (e) { setStatus(`Transfer failed: ${(e as Error).message}`); }
    finally { setBusy(""); }
  }

  async function useService(cap: Found) {
    if (!signer || !config || !address) return;
    setBusy(`use:${cap.capability.capabilityId}`);
    try {
      const challenge = await api<{ nonce: string; message: string; expiresAt: number }>("/api/challenge", { address });
      const signature = await signer.signMessage(challenge.message);
      if (signature.identity !== address) {
        throw new Error("This MVP currently requires a CKB-native signer whose message-signature identity equals the connected CKB address.");
      }
      const response = await api<{ result: unknown }>("/api/analyze", {
        address,
        nonce: challenge.nonce,
        signature,
        outPoint: outPointJson(cap.cell),
        text,
      });
      setStatus(`Access granted: ${JSON.stringify(response.result)}`);
    } catch (e) { setStatus(`Access denied/failed: ${(e as Error).message}`); }
    finally { setBusy(""); }
  }

  const connected = Boolean(signer && signerInfo);
  const now = BigInt(Math.floor(Date.now() / 1000));

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <span className="network">CKB TESTNET</span>
          <h1>SkillPass</h1>
          <p>Portable service access owned as a CKB Cell.</p>
        </div>
        <div className="wallet">
          {connected ? (
            <>
              <span>{wallet?.name || "Wallet"}</span>
              <code title={address}>{short(address, 8)}</code>
              <button className="secondary" onClick={() => disconnect()}>Disconnect</button>
            </>
          ) : <button onClick={() => open()}>Connect wallet</button>}
        </div>
      </header>

      <section className="status"><strong>Status</strong><span>{status}</span></section>

      <section className="panel hero-panel">
        <div>
          <h2>Your capabilities</h2>
          <p>The list comes from live CKB state. A centralized ownership row is not used as authority.</p>
        </div>
        <button className="secondary" disabled={!connected || busy === "refresh"} onClick={refresh}>Refresh</button>
      </section>

      {config?.enablePublicIssue && connected && (
        <section className="panel issue">
          <div><h2>Issue demo pass</h2><p>Provider/demo mode only. Your wallet explicitly signs the creation transaction.</p></div>
          <label>Valid days <input type="number" min="1" max="365" value={issueDays} onChange={(e) => setIssueDays(Number(e.target.value))} /></label>
          <button disabled={Boolean(busy)} onClick={issue}>Issue transferable pass</button>
        </section>
      )}

      {!connected ? (
        <section className="empty panel"><h2>Connect a CCC-compatible wallet</h2><p>Testnet is the only supported network in this MVP.</p></section>
      ) : caps.length === 0 ? (
        <section className="empty panel"><h2>No SkillPass cells found</h2><p>Receive a pass from the provider, or issue one when public demo issuance is enabled.</p></section>
      ) : (
        <section className="cards">
          {caps.map((cap) => {
            const active = now < cap.capability.expiry;
            const key = `${cap.cell.outPoint.txHash}:${cap.cell.outPoint.index}`;
            return <article className="cap" key={key}>
              <div className="cap-head"><span className={active ? "pill active" : "pill"}>{active ? "ACTIVE" : "EXPIRED"}</span><code>{short(cap.capability.capabilityId)}</code></div>
              <h3>{config?.service}</h3>
              <dl>
                <div><dt>Expires</dt><dd>{new Date(Number(cap.capability.expiry) * 1000).toLocaleString()}</dd></div>
                <div><dt>Out point</dt><dd><code>{short(cap.cell.outPoint.txHash)}:{cap.cell.outPoint.index.toString()}</code></dd></div>
              </dl>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} />
              <button disabled={!active || Boolean(busy)} onClick={() => useService(cap)}>Use paper-analyzer-v1</button>
              <div className="transfer">
                <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Recipient ckt1… address" />
                <button className="secondary" disabled={!recipient.trim() || Boolean(busy)} onClick={() => transfer(cap)}>Transfer</button>
              </div>
            </article>;
          })}
        </section>
      )}

      <footer>
        <p>Testnet only. User private keys stay in the connected wallet. The service verifies a one-time wallet challenge and then reads the current live Capability Cell.</p>
      </footer>
    </main>
  );
}
