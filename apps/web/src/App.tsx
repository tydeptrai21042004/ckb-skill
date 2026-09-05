import { useEffect, useMemo, useState, type ReactNode } from "react";
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
  limits?: { maxInputChars?: number };
  payments?: {
    required: boolean;
    amount?: string;
    asset?: string;
    network?: string;
    x402Version?: number;
    proofMode?: "invoice-status" | "preimage";
  };
};

type RuntimeStatus = {
  ok: boolean;
  network: string;
  tip?: string | null;
  paymentsRequired: boolean;
  paymentProof?: string;
  uptimeSeconds?: number;
  checkedAt?: string;
  dependencies?: {
    ckb?: { ok: boolean; error?: string };
    facilitator?: {
      ok: boolean;
      skipped?: boolean;
      mode?: string;
      paymentProof?: string;
      error?: string;
      upstream?: { ok?: boolean; backend?: string; version?: string };
    };
  };
};

type Found = Awaited<ReturnType<typeof discoverOwnedCapabilities>>[number];

type AnalysisResult = {
  service?: string;
  characters?: number;
  words?: number;
  sentences?: number;
  lexicalDiversity?: number;
  markerHits?: Record<string, number>;
  preview?: string;
  [key: string]: unknown;
};

type PaymentRequired = {
  x402Version: 2;
  resource: {
    url: string;
    description?: string;
    mimeType: string;
    serviceName?: string;
    tags?: string[];
  };
  accepts: Array<{
    scheme: string;
    network: string;
    amount: string;
    asset: string;
    payTo: string;
    maxTimeoutSeconds: number;
    extra: {
      invoice: string;
      paymentHash: string;
      assetTransferMethod: string;
      paymentFlow?: string;
    };
  }>;
};

type PendingPayment = {
  required: PaymentRequired;
  outPoint: { txHash: string; index: string };
  text: string;
};

type Notice = { tone: "info" | "success" | "error"; message: string };

type IconName =
  | "arrow"
  | "check"
  | "copy"
  | "external"
  | "key"
  | "refresh"
  | "shield"
  | "swap"
  | "wallet"
  | "x";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<IconName, ReactNode> = {
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/></>,
    external: <><path d="M14 5h5v5"/><path d="m10 14 9-9"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></>,
    key: <><circle cx="8" cy="15" r="3"/><path d="m10.5 12.5 7-7"/><path d="m15 8 2 2"/><path d="m17 6 2 2"/></>,
    refresh: <><path d="M20 11a8 8 0 0 0-14.9-3"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 3"/><path d="M20 20v-5h-5"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    swap: <><path d="m7 7 3-3 3 3"/><path d="M10 4v12"/><path d="m17 17-3 3-3-3"/><path d="M14 20V8"/></>,
    wallet: <><path d="M4 7.5V6a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    x: <><path d="m6 6 12 12"/><path d="m18 6-12 12"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function decodeBase64Json<T>(value: string): T {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function encodeBase64Json(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function short(value: string, n = 7) {
  return value.length > n * 2 ? `${value.slice(0, n)}…${value.slice(-n)}` : value;
}

function formatServiceName(value?: string) {
  if (!value) return "Protected service";
  return value
    .replace(/-v\d+$/i, "")
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function loadDraft() {
  try {
    return localStorage.getItem("skillpass.paperDraft") || "";
  } catch {
    return "";
  }
}

function outPointJson(cell: Found["cell"]) {
  return { txHash: cell.outPoint.txHash, index: cell.outPoint.index.toString() };
}

function capabilityKey(cap: Found) {
  return `${cap.cell.outPoint.txHash}:${cap.cell.outPoint.index.toString()}`;
}

function isCapabilityActive(cap: Found) {
  return BigInt(Math.floor(Date.now() / 1000)) < cap.capability.expiry;
}

function formatExpiry(expiry: bigint) {
  const date = new Date(Number(expiry) * 1000);
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
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
  const [selectedKey, setSelectedKey] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice>({ tone: "info", message: "Loading service configuration…" });
  const [health, setHealth] = useState<RuntimeStatus>();
  const [recipient, setRecipient] = useState("");
  const [text, setText] = useState(loadDraft);
  const [issueDays, setIssueDays] = useState(7);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment>();
  const [paymentPreimage, setPaymentPreimage] = useState("");
  const [result, setResult] = useState<AnalysisResult>();

  const selectedCap = useMemo(
    () => caps.find((cap) => capabilityKey(cap) === selectedKey) ?? caps[0],
    [caps, selectedKey],
  );

  useEffect(() => {
    api<RuntimeConfig>("/api/config")
      .then((c) => {
        setConfig(c);
        setNotice({ tone: "info", message: "Service ready. Connect your wallet to continue." });
      })
      .catch((e) => setNotice({ tone: "error", message: `Configuration error: ${e.message}` }));
  }, []);

  async function refreshHealth() {
    try {
      const res = await fetch("/api/status", { headers: { accept: "application/json" } });
      const value = await res.json() as RuntimeStatus;
      setHealth(value);
    } catch (e) {
      setHealth({
        ok: false,
        network: "testnet",
        paymentsRequired: Boolean(config?.payments?.required),
        dependencies: {
          ckb: { ok: false, error: (e as Error).message },
          facilitator: { ok: false },
        },
      });
    }
  }

  useEffect(() => {
    void refreshHealth();
    const timer = window.setInterval(() => void refreshHealth(), 30_000);
    return () => window.clearInterval(timer);
  }, [config?.payments?.required]);

  useEffect(() => {
    try { localStorage.setItem("skillpass.paperDraft", text); } catch {}
  }, [text]);

  useEffect(() => {
    if (!signer) {
      setAddress("");
      setCaps([]);
      setSelectedKey("");
      setResult(undefined);
      return;
    }
    signer.getRecommendedAddress()
      .then(setAddress)
      .catch((e) => setNotice({ tone: "error", message: `Could not read wallet address: ${e.message}` }));
  }, [signer]);

  async function refresh() {
    if (!signer || !config) return;
    setBusy("refresh");
    try {
      const found = await discoverOwnedCapabilities({ signer, deployment: config.deployment });
      setCaps(found);
      setSelectedKey((current) => {
        if (found.some((cap) => capabilityKey(cap) === current)) return current;
        const firstActive = found.find(isCapabilityActive) ?? found[0];
        return firstActive ? capabilityKey(firstActive) : "";
      });
      setNotice({
        tone: found.length ? "success" : "info",
        message: found.length
          ? `${found.length} access pass${found.length === 1 ? "" : "es"} found on CKB.`
          : "No SkillPass access pass was found for this wallet.",
      });
    } catch (e) {
      setNotice({ tone: "error", message: `Could not load passes: ${(e as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  useEffect(() => { if (signer && config) void refresh(); }, [signer, config]);

  async function issue() {
    if (!signer || !config || !config.enablePublicIssue) return;
    setBusy("issue");
    try {
      const expiry = BigInt(Math.floor(Date.now() / 1000) + Math.max(1, issueDays) * 86_400);
      const { tx, capabilityId } = await buildIssueCapabilityTx({
        signer,
        deployment: config.deployment,
        serviceId: config.serviceId,
        expiry,
        flags: FLAG_TRANSFERABLE,
      });
      const { txHash } = await sendAndWait(signer, tx);
      setNotice({ tone: "success", message: `Pass issued on CKB: ${short(txHash, 10)} · ${short(capabilityId, 10)}` });
      await refresh();
    } catch (e) {
      setNotice({ tone: "error", message: `Issue failed: ${(e as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function transfer(cap: Found) {
    if (!signer || !config || !recipient.trim()) return;
    setBusy("transfer");
    try {
      const tx = await buildTransferCapabilityTx({
        signer,
        deployment: config.deployment,
        outPoint: cap.cell.outPoint,
        recipientAddress: recipient.trim(),
      });
      const { txHash } = await sendAndWait(signer, tx);
      setRecipient("");
      setNotice({ tone: "success", message: `Transfer confirmed on CKB: ${short(txHash, 12)}` });
      await refresh();
    } catch (e) {
      setNotice({ tone: "error", message: `Transfer failed: ${(e as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function signedRequestBody(outPoint: { txHash: string; index: string }, requestText: string) {
    if (!signer || !address) throw new Error("Connect a wallet first.");
    const challenge = await api<{ nonce: string; message: string; expiresAt: number }>("/api/challenge", { address });
    const signature = await signer.signMessage(challenge.message);
    if (signature.identity !== address) {
      throw new Error("This deployment requires a CKB-native signer whose message-signature identity matches the connected CKB address.");
    }
    return { address, nonce: challenge.nonce, signature, outPoint, text: requestText };
  }

  async function sendAnalyze(
    body: Awaited<ReturnType<typeof signedRequestBody>>,
    paymentRequired?: PaymentRequired,
    preimage = "",
  ) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (paymentRequired) {
      const requirement = paymentRequired.accepts[0];
      if (!requirement) throw new Error("Server returned a payment request without an accepted payment method.");
      headers["PAYMENT-SIGNATURE"] = encodeBase64Json({
        x402Version: 2,
        resource: paymentRequired.resource,
        accepted: requirement,
        payload: {
          invoice: requirement.extra.invoice,
          paymentHash: requirement.extra.paymentHash,
          payer: address,
          ...(preimage ? { paymentPreimage: preimage.trim() } : {}),
        },
        extensions: {},
      });
    }
    const res = await fetch("/api/analyze", { method: "POST", headers, body: JSON.stringify(body) });
    const value = await res.json();
    if (res.status === 402) {
      const header = res.headers.get("payment-required");
      if (!header) throw new Error(value.message || "Payment required, but the server did not return payment details.");
      return { kind: "payment" as const, required: decodeBase64Json<PaymentRequired>(header), value };
    }
    if (!res.ok) throw new Error(value.message || value.error || `HTTP ${res.status}`);
    return { kind: "success" as const, value };
  }

  async function useService(cap: Found) {
    if (!signer || !config || !address) return;
    setBusy("analyze");
    setResult(undefined);
    try {
      const outPoint = outPointJson(cap.cell);
      const body = await signedRequestBody(outPoint, text);
      const response = await sendAnalyze(body);
      if (response.kind === "payment") {
        setPendingPayment({ required: response.required, outPoint, text });
        setPaymentPreimage("");
        setNotice({ tone: "info", message: "Payment is required before this request can run." });
      } else {
        setPendingPayment(undefined);
        setPaymentPreimage("");
        setResult(response.value.result as AnalysisResult);
        setNotice({ tone: "success", message: "Access verified. Analysis complete." });
      }
    } catch (e) {
      setNotice({ tone: "error", message: `Request failed: ${(e as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function retryPaidUse() {
    if (!pendingPayment || !signer || !address) return;
    setBusy("paid-retry");
    try {
      const body = await signedRequestBody(pendingPayment.outPoint, pendingPayment.text);
      if (config?.payments?.proofMode === "preimage" && !/^0x[0-9a-fA-F]{64}$/.test(paymentPreimage.trim())) {
        throw new Error("Enter the 32-byte Fiber payment preimage (0x + 64 hex characters)." );
      }
      const response = await sendAnalyze(body, pendingPayment.required, paymentPreimage);
      if (response.kind === "payment") {
        setPendingPayment({ ...pendingPayment, required: response.required });
        setNotice({ tone: "info", message: response.value.message || "Payment has not been verified yet." });
      } else {
        setPendingPayment(undefined);
        setPaymentPreimage("");
        setResult(response.value.result as AnalysisResult);
        setNotice({ tone: "success", message: "Payment verified. Analysis complete." });
      }
    } catch (e) {
      setNotice({ tone: "error", message: `Paid request failed: ${(e as Error).message}` });
    } finally {
      setBusy("");
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ tone: "success", message: `${label} copied.` });
    } catch {
      setNotice({ tone: "error", message: `Could not copy ${label.toLowerCase()}.` });
    }
  }

  const connected = Boolean(signer && signerInfo);
  const maxInputChars = config?.limits?.maxInputChars ?? 20_000;
  const inputValid = text.trim().length > 0 && text.length <= maxInputChars;
  const serviceName = formatServiceName(config?.service);
  const selectedActive = selectedCap ? isCapabilityActive(selectedCap) : false;
  const ckbReady = Boolean(health?.dependencies?.ckb?.ok);
  const fiberReady = !config?.payments?.required || Boolean(health?.dependencies?.facilitator?.ok);
  const systemReady = ckbReady && fiberReady;
  const paymentRequirement = pendingPayment?.required.accepts[0];
  const markerEntries = (Object.entries(result?.markerHits ?? {}) as Array<[string, number]>).filter(([, count]) => count > 0);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="SkillPass home">
            <span className="brand-mark">SP</span>
            <span className="brand-name">SkillPass</span>
            <span className="network-badge">Testnet</span>
          </a>

          <div className="header-actions">
            <button
              className={`system-indicator ${systemReady ? "ready" : "warn"}`}
              type="button"
              onClick={() => void refreshHealth()}
              title="Refresh service health"
            >
              <span className="status-dot" />
              <span>{!health ? "Checking" : systemReady ? "Systems ready" : "Service issue"}</span>
            </button>

            {connected ? (
              <div className="wallet-menu">
                <div className="wallet-summary">
                  <span className="wallet-icon"><Icon name="wallet" size={16} /></span>
                  <span>
                    <strong>{wallet?.name || "Wallet"}</strong>
                    <code title={address}>{short(address, 6)}</code>
                  </span>
                </div>
                <button className="button ghost small" onClick={() => disconnect()}>Disconnect</button>
              </div>
            ) : (
              <button className="button primary" onClick={() => open()}>
                <Icon name="wallet" size={17} />
                Connect wallet
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className={`notice ${notice.tone}`} role="status" aria-live="polite">
          <span className="notice-icon">{notice.tone === "success" ? <Icon name="check" size={16} /> : notice.tone === "error" ? "!" : "i"}</span>
          <span>{notice.message}</span>
        </div>

        {!connected ? (
          <section className="connect-view">
            <div className="connect-copy">
              <div className="eyebrow">CKB-owned access</div>
              <h1>Use the service with a pass you actually own.</h1>
              <p>SkillPass checks the current Capability Cell on CKB before every protected request. Your wallet keeps control of signing.</p>
              <button className="button primary large" onClick={() => open()}>
                Connect a CKB wallet
                <Icon name="arrow" />
              </button>
              <p className="privacy-note"><Icon name="shield" size={15} /> Private keys never leave your wallet.</p>
            </div>

            <div className="connect-steps" aria-label="How SkillPass works">
              <div className="step-row"><span>01</span><div><strong>Connect</strong><p>Choose a CCC-compatible wallet.</p></div></div>
              <div className="step-row"><span>02</span><div><strong>Select access</strong><p>SkillPass finds Capability Cells owned by your wallet.</p></div></div>
              <div className="step-row"><span>03</span><div><strong>Use the service</strong><p>Sign a one-time challenge. Pay by Fiber only when required.</p></div></div>
            </div>
          </section>
        ) : (
          <div className="workspace">
            <aside className="sidebar">
              <section className="sidebar-section">
                <div className="section-heading compact-heading">
                  <div>
                    <span className="eyebrow">On-chain access</span>
                    <h2>Your passes</h2>
                  </div>
                  <button className="icon-button" onClick={refresh} disabled={busy === "refresh"} title="Refresh passes" aria-label="Refresh passes">
                    <Icon name="refresh" size={17} />
                  </button>
                </div>

                <div className="pass-list">
                  {caps.length === 0 ? (
                    <div className="sidebar-empty">
                      <div className="empty-icon"><Icon name="key" size={20} /></div>
                      <strong>No passes found</strong>
                      <p>Receive one from the provider{config?.enablePublicIssue ? " or issue a test pass below" : ""}.</p>
                    </div>
                  ) : caps.map((cap) => {
                    const key = capabilityKey(cap);
                    const active = isCapabilityActive(cap);
                    const selected = selectedCap ? capabilityKey(selectedCap) === key : false;
                    return (
                      <button
                        type="button"
                        className={`pass-option ${selected ? "selected" : ""}`}
                        key={key}
                        onClick={() => { setSelectedKey(key); setResult(undefined); setRecipient(""); }}
                      >
                        <span className={`pass-state ${active ? "active" : "expired"}`}><span />{active ? "Active" : "Expired"}</span>
                        <strong>{short(cap.capability.capabilityId, 8)}</strong>
                        <small>Expires {formatExpiry(cap.capability.expiry)}</small>
                      </button>
                    );
                  })}
                </div>
              </section>

              {config?.enablePublicIssue && (
                <section className="sidebar-section issue-box">
                  <div className="section-heading">
                    <div><span className="eyebrow">Demo provider</span><h3>Issue a test pass</h3></div>
                  </div>
                  <p>Creates a transferable testnet Capability Cell from your wallet.</p>
                  <div className="issue-controls">
                    <label>
                      <span>Validity</span>
                      <select value={issueDays} onChange={(e) => setIssueDays(Number(e.target.value))}>
                        <option value={1}>1 day</option>
                        <option value={7}>7 days</option>
                        <option value={30}>30 days</option>
                        <option value={90}>90 days</option>
                      </select>
                    </label>
                    <button className="button secondary full" disabled={Boolean(busy)} onClick={issue}>Issue pass</button>
                  </div>
                </section>
              )}

              <section className="sidebar-section system-box">
                <div className="system-row"><span><span className={`mini-dot ${ckbReady ? "ok" : "bad"}`} />CKB</span><strong>{!health ? "Checking" : ckbReady ? "Ready" : "Unavailable"}</strong></div>
                <div className="system-row"><span><span className={`mini-dot ${fiberReady ? "ok" : "bad"}`} />Fiber</span><strong>{!config?.payments?.required ? "Optional" : !health ? "Checking" : fiberReady ? "Ready" : "Unavailable"}</strong></div>
                <div className="system-row"><span>CKB tip</span><code>{health?.tip ?? "—"}</code></div>
              </section>
            </aside>

            <section className="service-workspace">
              <div className="service-header">
                <div>
                  <div className="eyebrow">Protected service</div>
                  <h1>{serviceName}</h1>
                  <p>Access is checked against the selected CKB pass at request time.</p>
                </div>
                <div className="service-meta">
                  <span className={`meta-chip ${config?.payments?.required ? "paid" : "free"}`}>
                    {config?.payments?.required ? "Fiber payment" : "No payment"}
                  </span>
                  <span className="meta-chip">x402 v{config?.payments?.x402Version ?? 2}</span>
                </div>
              </div>

              {!selectedCap ? (
                <div className="workspace-empty">
                  <div className="empty-icon large"><Icon name="key" size={25} /></div>
                  <h2>No access pass selected</h2>
                  <p>This wallet does not currently own a SkillPass capability for this deployment.</p>
                </div>
              ) : (
                <>
                  <section className="editor-card">
                    <div className="selected-pass-line">
                      <div>
                        <span className={`pass-state ${selectedActive ? "active" : "expired"}`}><span />{selectedActive ? "Pass active" : "Pass expired"}</span>
                        <code title={selectedCap.capability.capabilityId}>{short(selectedCap.capability.capabilityId, 9)}</code>
                      </div>
                      <span>Valid until {formatExpiry(selectedCap.capability.expiry)}</span>
                    </div>

                    <label className="editor-label" htmlFor="paper-input">Text to analyze</label>
                    <textarea
                      id="paper-input"
                      className="editor"
                      maxLength={maxInputChars}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Paste the section or paper text you want to analyze…"
                      rows={13}
                      spellCheck
                    />
                    <div className="editor-footer">
                      <span>Draft saved in this browser</span>
                      <span className={text.length >= maxInputChars ? "limit-hit" : ""}>{text.length.toLocaleString()} / {maxInputChars.toLocaleString()}</span>
                    </div>
                    <div className="run-row">
                      <div className="run-note">
                        <Icon name="shield" size={17} />
                        <span>You will sign a one-time access challenge. No transaction is sent to use the service.</span>
                      </div>
                      <button
                        className="button primary large"
                        disabled={!selectedActive || !inputValid || Boolean(busy) || !systemReady}
                        onClick={() => useService(selectedCap)}
                      >
                        {busy === "analyze" ? "Verifying…" : config?.payments?.required ? "Continue to analysis" : "Run analysis"}
                        {busy !== "analyze" && <Icon name="arrow" size={18} />}
                      </button>
                    </div>
                  </section>

                  <section className="result-card">
                    <div className="result-heading">
                      <div><span className="eyebrow">Output</span><h2>Analysis result</h2></div>
                      {result && <span className="result-status"><Icon name="check" size={14} /> Complete</span>}
                    </div>

                    {!result ? (
                      <div className="result-placeholder">
                        <p>Run the protected service to see the result here.</p>
                      </div>
                    ) : (
                      <div className="result-content">
                        <div className="metric-grid">
                          <div className="metric"><span>Words</span><strong>{result.words?.toLocaleString() ?? "—"}</strong></div>
                          <div className="metric"><span>Sentences</span><strong>{result.sentences?.toLocaleString() ?? "—"}</strong></div>
                          <div className="metric"><span>Characters</span><strong>{result.characters?.toLocaleString() ?? "—"}</strong></div>
                          <div className="metric"><span>Lexical diversity</span><strong>{typeof result.lexicalDiversity === "number" ? `${Math.round(result.lexicalDiversity * 100)}%` : "—"}</strong></div>
                        </div>

                        {result.preview && (
                          <div className="result-block">
                            <h3>Preview</h3>
                            <p>{result.preview}</p>
                          </div>
                        )}

                        <div className="result-block">
                          <h3>Structure markers</h3>
                          {markerEntries.length ? (
                            <div className="marker-list">
                              {markerEntries.map(([marker, count]) => <span key={marker}>{marker}<strong>{count}</strong></span>)}
                            </div>
                          ) : <p className="muted">No tracked structure markers were found.</p>}
                        </div>
                      </div>
                    )}
                  </section>

                  <details className="manage-card">
                    <summary>
                      <span><Icon name="swap" size={17} /> Manage this pass</span>
                      <span>Transfer or inspect on-chain details</span>
                    </summary>
                    <div className="manage-content">
                      <div className="detail-grid">
                        <div><span>Capability ID</span><code>{selectedCap.capability.capabilityId}</code></div>
                        <div><span>Out point</span><code>{selectedCap.cell.outPoint.txHash}:{selectedCap.cell.outPoint.index.toString()}</code></div>
                      </div>
                      <div className="transfer-form">
                        <label htmlFor="recipient">Transfer to CKB address</label>
                        <div>
                          <input id="recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="ckt1…" spellCheck={false} />
                          <button className="button secondary" disabled={!recipient.trim() || Boolean(busy)} onClick={() => transfer(selectedCap)}>Transfer</button>
                        </div>
                        <p>This moves ownership of the Capability Cell. The previous owner loses access after confirmation.</p>
                      </div>
                    </div>
                  </details>
                </>
              )}
            </section>
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>SkillPass · CKB Testnet</span>
        <span>Wallet signing via CCC · Payments via Fiber/x402 when enabled</span>
      </footer>

      {pendingPayment && paymentRequirement && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setPendingPayment(undefined); }}>
          <section className="payment-modal" role="dialog" aria-modal="true" aria-labelledby="payment-title">
            <div className="modal-header">
              <div>
                <span className="eyebrow">Fiber payment</span>
                <h2 id="payment-title">Pay to continue</h2>
              </div>
              <button className="icon-button" aria-label="Close payment" disabled={Boolean(busy)} onClick={() => { setPendingPayment(undefined); setPaymentPreimage(""); }}><Icon name="x" /></button>
            </div>

            <div className="payment-amount">
              <span>Amount</span>
              <strong>{paymentRequirement.amount} <small>{paymentRequirement.asset}</small></strong>
              <p>{paymentRequirement.network}</p>
            </div>

            <div className="payment-step">
              <div className="step-number">1</div>
              <div>
                <h3>Pay the invoice</h3>
                <p>Use a Fiber-compatible wallet or payment tool.</p>
                <div className="copy-field invoice-field">
                  <code>{paymentRequirement.extra.invoice}</code>
                  <button className="icon-button" onClick={() => void copyText(paymentRequirement.extra.invoice, "Invoice")} aria-label="Copy invoice"><Icon name="copy" size={17} /></button>
                </div>
              </div>
            </div>

            <div className="payment-step">
              <div className="step-number">2</div>
              <div>
                <h3>Verify payment</h3>
                <p>After payment completes, return here and retry the protected request.</p>
                <div className="payment-hash-row">
                  <span>Payment hash</span>
                  <code>{short(paymentRequirement.extra.paymentHash, 12)}</code>
                  <button className="text-button" onClick={() => void copyText(paymentRequirement.extra.paymentHash, "Payment hash")}>Copy</button>
                </div>
                {config?.payments?.proofMode === "preimage" && (
                  <label className="preimage-field">
                    <span>Payment preimage</span>
                    <input
                      value={paymentPreimage}
                      onChange={(e) => setPaymentPreimage(e.target.value)}
                      placeholder="0x + 64 hex characters"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="payment-security"><Icon name="shield" size={16} /><span>SkillPass never asks for your private key or seed phrase.</span></div>
            <div className="modal-actions">
              <button className="button ghost" disabled={Boolean(busy)} onClick={() => { setPendingPayment(undefined); setPaymentPreimage(""); }}>Cancel</button>
              <button className="button primary" disabled={Boolean(busy)} onClick={retryPaidUse}>{busy === "paid-retry" ? "Checking payment…" : "I paid — verify"}<Icon name="arrow" size={17} /></button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
