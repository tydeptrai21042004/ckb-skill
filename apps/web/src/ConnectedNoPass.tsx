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
  onTryDemo: () => void;
  onCopyAddress: () => void;
};

function short(value: string, n = 7) {
  return value.length > n * 2 ? `${value.slice(0, n)}…${value.slice(-n)}` : value;
}

const fallbackServices: ServiceSummary[] = [
  { slug: "model-api-v1", name: "Model API", description: "Protected model or inference endpoint." },
  { slug: "private-data-api-v1", name: "Private Data API", description: "Protected provider-controlled data endpoint." },
  { slug: "compute-api-v1", name: "Compute API", description: "Protected deterministic compute endpoint." },
];

export default function ConnectedNoPass({ address, services, refreshing, onRefresh, onTryDemo, onCopyAddress }: Props) {
  const visibleServices = services.length ? services.slice(0, 3) : fallbackServices;

  return (
    <div className="connected-onboarding">
      <section className="connected-onboarding-hero">
        <div>
          <span className="eyebrow">Wallet connected</span>
          <h1>No live SkillPass yet.</h1>
          <p>
            This JoyID wallet does not currently own a compatible provider-issued Capability Cell. Your wallet connection is working;
            you simply need a live service right before protected Testnet services can authorize it.
          </p>
          <div className="connected-wallet-line">
            <span className="connected-dot" />
            <span>JoyID connected</span>
            <code title={address}>{short(address, 9)}</code>
          </div>
          <div className="connected-onboarding-actions">
            <button type="button" className="button primary" onClick={onTryDemo}>Try interactive demo</button>
            <button type="button" className="button secondary" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? "Checking CKB…" : "Refresh ownership"}
            </button>
            <button type="button" className="button ghost" onClick={onCopyAddress}>Copy wallet address</button>
          </div>
          <div className="connected-help-inline">
            <strong>Waiting for a pass?</strong>
            <span>Give this wallet address to a participating provider. After issuance or transfer confirms, return here and refresh ownership.</span>
          </div>
        </div>

        <div className="service-pass-preview">
          <span className="preview-label">What a compatible pass unlocks</span>
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
          <p>The interactive demo uses the same ownership story without pretending that simulated actions happened on-chain.</p>
        </div>
      </section>

      <section className="connected-get-started" id="connected-get-started">
        <div className="connected-section-heading">
          <span className="eyebrow">Live Testnet path</span>
          <h2>How to receive and use a real pass</h2>
          <p>Trusted issuance remains a provider action; the connected wallet is the owner and user of the right.</p>
        </div>
        <ol className="connected-steps three-items">
          <li><span>1</span><div><strong>Receive</strong><p>A provider issues or transfers a compatible Capability Cell to this JoyID address.</p></div></li>
          <li><span>2</span><div><strong>Refresh</strong><p>SkillPass discovers the live Cell and verifies entitlement, issuer, expiry, flags, and provider policy.</p></div></li>
          <li><span>3</span><div><strong>Use or transfer</strong><p>Run a protected service or transfer ownership. Authorization follows the current live owner.</p></div></li>
        </ol>
      </section>

      <section className="connected-note">
        <strong>Why there is no public “mint my pass” button</strong>
        <p>
          Allowing any user to self-issue a provider-trusted entitlement would remove the trust boundary the pass is meant to represent.
          Demo Mode solves the evaluation problem without weakening live Testnet issuance.
        </p>
      </section>
    </div>
  );
}
