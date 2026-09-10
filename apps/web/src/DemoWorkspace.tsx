import { useMemo, useState } from "react";
import { authorizeDemoRequest, otherIdentity, type DemoIdentity, type DemoReceipt } from "./demo/demoState";
import { demoServices, runDemoService } from "./demo/demoServices";

type Props = {
  liveReady: boolean;
  onOpenLive: () => void;
  onConnectLive: () => void;
};

const starterInputs: Record<string, string> = {
  "model-api-v1": "Explain how a portable service right can move from Alice to Bob.",
  "private-data-api-v1": '{"query":"available research assets","limit":3}',
  "compute-api-v1": '{"task":"vector-score","values":[3,5,8]}',
};

export default function DemoWorkspace({ liveReady, onOpenLive, onConnectLive }: Props) {
  const [owner, setOwner] = useState<DemoIdentity>("Alice");
  const [requester, setRequester] = useState<DemoIdentity>("Alice");
  const [serviceSlug, setServiceSlug] = useState(demoServices[0].slug);
  const [input, setInput] = useState(starterInputs[demoServices[0].slug]);
  const [receipt, setReceipt] = useState<DemoReceipt>();
  const [serviceResult, setServiceResult] = useState<{ title: string; summary: string; detail: string }>();
  const [hasUsed, setHasUsed] = useState(false);
  const [hasTransferred, setHasTransferred] = useState(false);
  const [hasDeniedOldOwner, setHasDeniedOldOwner] = useState(false);
  const [hasVerifiedNewOwner, setHasVerifiedNewOwner] = useState(false);

  const service = useMemo(
    () => demoServices.find((item) => item.slug === serviceSlug) ?? demoServices[0],
    [serviceSlug],
  );

  const oldOwner = hasTransferred ? otherIdentity(owner) : undefined;
  const progress = hasVerifiedNewOwner ? 4 : hasTransferred ? 3 : hasUsed ? 2 : 1;

  function chooseService(slug: string) {
    const next = demoServices.find((item) => item.slug === slug) ?? demoServices[0];
    setServiceSlug(next.slug);
    setInput(starterInputs[next.slug] ?? next.placeholder);
    setReceipt(undefined);
    setServiceResult(undefined);
  }

  function runAs(identity = requester) {
    const result = runDemoService(service, input);
    const nextReceipt = authorizeDemoRequest({
      requester: identity,
      owner,
      service: service.name,
      provider: service.provider,
      detail: identity === owner ? result.detail : undefined,
    });

    setRequester(identity);
    setReceipt(nextReceipt);
    if (nextReceipt.decision === "granted") {
      setServiceResult(result);
      setHasUsed(true);
      if (hasTransferred && identity === owner) setHasVerifiedNewOwner(true);
    } else {
      setServiceResult(undefined);
      if (hasTransferred && identity === oldOwner) setHasDeniedOldOwner(true);
    }
  }

  function transfer() {
    const previousOwner = owner;
    const nextOwner = otherIdentity(owner);
    setOwner(nextOwner);
    setRequester(previousOwner);
    setReceipt(undefined);
    setServiceResult(undefined);
    setHasTransferred(true);
    setHasDeniedOldOwner(false);
    setHasVerifiedNewOwner(false);
  }

  function resetDemo() {
    setOwner("Alice");
    setRequester("Alice");
    setServiceSlug(demoServices[0].slug);
    setInput(starterInputs[demoServices[0].slug]);
    setReceipt(undefined);
    setServiceResult(undefined);
    setHasUsed(false);
    setHasTransferred(false);
    setHasDeniedOldOwner(false);
    setHasVerifiedNewOwner(false);
  }

  return (
    <div className="demo-page">
      <section className="demo-banner" aria-label="Demo mode notice">
        <div>
          <span className="demo-badge">Demo mode</span>
          <strong>Simulated capability lifecycle</strong>
          <span>No wallet, funds, or blockchain transaction is used in this workspace.</span>
        </div>
        <div className="demo-banner-actions">
          <button type="button" className="button ghost small" onClick={resetDemo}>Reset demo</button>
          <button type="button" className="button secondary small" onClick={onOpenLive}>Open Live Testnet</button>
        </div>
      </section>

      <section className="demo-progress" aria-label="Demo lifecycle progress">
        {[
          [1, "Own"],
          [2, "Use"],
          [3, "Transfer"],
          [4, "Verify"],
        ].map(([step, label]) => (
          <div className={`demo-progress-step ${Number(step) <= progress ? "active" : ""}`} key={String(label)}>
            <span>{Number(step) < progress ? "✓" : step}</span>
            <strong>{label}</strong>
          </div>
        ))}
      </section>

      <div className="demo-layout">
        <aside className="demo-pass-column">
          <section className="demo-pass-card">
            <div className="preview-label">Your demo pass</div>
            <div className="demo-pass-title">
              <span className="preview-pass-mark">SP</span>
              <div>
                <strong>Service Bundle Pass</strong>
                <small>Simulated CKB Capability Cell</small>
              </div>
              <span className="preview-active"><span /> Active</span>
            </div>

            <div className="demo-owner-block">
              <span>Current owner</span>
              <strong>{owner}</strong>
              <code>{owner === "Alice" ? "ckt1…alice92fa" : "ckt1…bob74c1"}</code>
            </div>

            <div className="demo-service-entitlements">
              {demoServices.map((item) => (
                <div key={item.slug}>
                  <span>✓</span>
                  <div><strong>{item.name}</strong><small>{item.provider}</small></div>
                </div>
              ))}
            </div>

            <div className="demo-transfer-box">
              <span className="eyebrow">Ownership</span>
              <strong>{owner} → {otherIdentity(owner)}</strong>
              <p>Transfer changes who can exercise the shared service right. The previous owner should stop authorizing.</p>
              <button type="button" className="button secondary full" onClick={transfer}>
                Transfer pass to {otherIdentity(owner)}
              </button>
            </div>
          </section>
        </aside>

        <section className="demo-service-column">
          <div className="demo-service-header">
            <div>
              <span className="eyebrow">Protected service</span>
              <h1>Use the pass, transfer it, verify the new owner.</h1>
              <p>All three providers accept the same demo entitlement under independent service policies.</p>
            </div>
          </div>

          <div className="demo-service-tabs" role="tablist" aria-label="Demo services">
            {demoServices.map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={service.slug === item.slug}
                className={service.slug === item.slug ? "selected" : ""}
                key={item.slug}
                onClick={() => chooseService(item.slug)}
              >
                <strong>{item.name}</strong>
                <span>{item.provider}</span>
              </button>
            ))}
          </div>

          <section className="demo-run-card">
            <div className="demo-run-heading">
              <div>
                <strong>{service.name}</strong>
                <p>{service.description}</p>
              </div>
              <span className="provider-pill">{service.provider}</span>
            </div>

            <label className="editor-label" htmlFor="demo-service-input">Request</label>
            <textarea
              id="demo-service-input"
              className="editor demo-editor"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={7}
              spellCheck={service.inputKind !== "json"}
            />

            <div className="demo-requester-row">
              <div>
                <span>Requesting as</span>
                <strong>{requester}</strong>
                <small>{requester === owner ? "Current owner" : "Previous / non-owner"}</small>
              </div>
              <div className="demo-identity-switch" aria-label="Choose demo requester">
                <button type="button" className={requester === "Alice" ? "selected" : ""} onClick={() => setRequester("Alice")}>Alice</button>
                <button type="button" className={requester === "Bob" ? "selected" : ""} onClick={() => setRequester("Bob")}>Bob</button>
              </div>
              <button type="button" className="button primary" onClick={() => runAs()}>
                Run {service.name}
              </button>
            </div>
          </section>

          {receipt && (
            <section className={`demo-decision ${receipt.decision}`} role="status" aria-live="polite">
              <div className="demo-decision-mark">{receipt.decision === "granted" ? "✓" : "×"}</div>
              <div className="demo-decision-main">
                <span className="eyebrow">Authorization result</span>
                <h2>{receipt.decision === "granted" ? "Access granted" : "Access denied"}</h2>
                <p>{receipt.message}</p>
                <div className="demo-receipt-grid">
                  <div><span>Requester</span><strong>{receipt.requester}</strong></div>
                  <div><span>Current owner</span><strong>{receipt.owner}</strong></div>
                  <div><span>Service</span><strong>{receipt.service}</strong></div>
                  <div><span>Provider</span><strong>{receipt.provider}</strong></div>
                </div>
                {serviceResult && receipt.decision === "granted" && (
                  <div className="demo-service-result">
                    <strong>{serviceResult.title}</strong>
                    <p>{serviceResult.summary}</p>
                    <code>{serviceResult.detail}</code>
                  </div>
                )}
              </div>
            </section>
          )}

          {hasTransferred && (
            <section className="demo-next-action">
              {!hasDeniedOldOwner ? (
                <>
                  <div><strong>Now prove the old owner lost access.</strong><span>Request again as {oldOwner} after the transfer.</span></div>
                  <button type="button" className="button secondary" onClick={() => runAs(oldOwner)}>Test {oldOwner}'s access</button>
                </>
              ) : !hasVerifiedNewOwner ? (
                <>
                  <div><strong>Old-owner access was rejected.</strong><span>Finish the lifecycle by verifying {owner}.</span></div>
                  <button type="button" className="button primary" onClick={() => runAs(owner)}>Test {owner}'s access</button>
                </>
              ) : (
                <>
                  <div><strong>Lifecycle verified.</strong><span>The entitlement followed ownership from {oldOwner} to {owner} across participating services.</span></div>
                  <button type="button" className="button primary" disabled={!liveReady} onClick={onConnectLive}>{liveReady ? "Try Live Testnet" : "Live Testnet unavailable"}</button>
                </>
              )}
            </section>
          )}
        </section>
      </div>
    </div>
  );
}
