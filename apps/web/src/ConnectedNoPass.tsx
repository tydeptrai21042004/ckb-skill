type ServiceSummary = {
  slug: string;
  name: string;
  description?: string;
};

type Props = {
  address: string;
  services: ServiceSummary[];
  refreshing: boolean;
  onRefresh: () => void;
};

function short(value: string, n = 7) {
  return value.length > n * 2 ? `${value.slice(0, n)}…${value.slice(-n)}` : value;
}

const fallbackServices: ServiceSummary[] = [
  { slug: "model-api-v1", name: "Model API", description: "Protected model or inference endpoint." },
  { slug: "private-data-api-v1", name: "Private Data API", description: "Protected provider-controlled data endpoint." },
  { slug: "compute-api-v1", name: "Compute API", description: "Protected compute or job-admission endpoint." },
];

export default function ConnectedNoPass({ address, services, refreshing, onRefresh }: Props) {
  const visibleServices = services.length ? services.slice(0, 3) : fallbackServices;

  return (
    <div className="connected-onboarding">
      <section className="connected-onboarding-hero">
        <div>
          <span className="eyebrow">Wallet connected</span>
          <h1>You are connected. Now add a service right.</h1>
          <p>
            SkillPass found no matching Capability Cell in this wallet. A participating provider must issue or transfer
            an accepted entitlement before a protected service can authorize this wallet.
          </p>
          <div className="connected-wallet-line">
            <span className="connected-dot" />
            <span>JoyID connected</span>
            <code title={address}>{short(address, 9)}</code>
          </div>
          <div className="connected-onboarding-actions">
            <button type="button" className="button primary" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? "Checking CKB…" : "Refresh service rights"}
            </button>
            <a className="button secondary" href="#connected-get-started">How to get a pass</a>
          </div>
        </div>
        <div className="service-pass-preview">
          <span className="preview-label">Example entitlement</span>
          <div className="service-pass-preview-title">
            <span className="preview-pass-mark">SP</span>
            <div><strong>Service Bundle Pass</strong><small>Shared CKB entitlement</small></div>
          </div>
          <div className="service-pass-preview-list">
            {visibleServices.map((service) => (
              <div key={service.slug}>
                <span>✓</span>
                <div><strong>{service.name}</strong><small>{service.description}</small></div>
              </div>
            ))}
          </div>
          <p>One accepted entitlement can be verified by multiple independent services without a shared ownership database.</p>
        </div>
      </section>

      <section className="connected-get-started" id="connected-get-started">
        <div className="connected-section-heading">
          <span className="eyebrow">Get started</span>
          <h2>What happens next</h2>
        </div>
        <ol className="connected-steps">
          <li><span>1</span><div><strong>Receive a pass</strong><p>A provider issues or transfers a compatible Capability Cell to this wallet.</p></div></li>
          <li><span>2</span><div><strong>Refresh ownership</strong><p>SkillPass discovers the live CKB Cell and checks its entitlement, issuer, flags, expiry, and provider policy.</p></div></li>
          <li><span>3</span><div><strong>Use a service</strong><p>Select Model API, Private Data API, or Compute API. Each request verifies the live entitlement before execution.</p></div></li>
          <li><span>4</span><div><strong>Transfer or delegate if needed</strong><p>Transfer ownership to another wallet, or create bounded temporary access for another client when policy permits it.</p></div></li>
        </ol>
      </section>

      <section className="connected-example">
        <div className="connected-section-heading">
          <span className="eyebrow">Use case</span>
          <h2>Alice → Bob, across several providers</h2>
          <p>The service right moves through CKB ownership instead of a synchronized provider account database.</p>
        </div>
        <div className="connected-example-flow">
          <div><strong>Alice owns Service Bundle Pass</strong><span>Model ✓ · Data ✓ · Compute ✓</span></div>
          <b>→</b>
          <div><strong>Alice uses or delegates bounded access</strong><span>Optional · provider-controlled</span></div>
          <b>→</b>
          <div className="connected-example-final"><strong>Alice transfers to Bob</strong><span>Alice ✗ · old grants ✗ · Bob ✓</span></div>
        </div>
      </section>

      <section className="connected-note">
        <strong>Why you cannot mint a trusted pass here</strong>
        <p>
          Public users should not be able to self-issue a provider-trusted entitlement. Issuance is intentionally a
          provider action; this wallet UI is for ownership discovery, use, verification, optional delegation, and transfer.
        </p>
      </section>
    </div>
  );
}
