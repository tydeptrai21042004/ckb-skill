import type { ReactNode } from "react";

type Props = {
  ready: boolean;
  onConnect: () => void;
  onTryDemo: () => void;
};

type FeatureIcon = "wallet" | "key" | "service" | "swap" | "shield" | "arrow" | "check";

function LandingIcon({ name, size = 18 }: { name: FeatureIcon; size?: number }) {
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
  const paths: Record<FeatureIcon, ReactNode> = {
    wallet: <><path d="M4 7.5V6a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z"/></>,
    key: <><circle cx="8" cy="15" r="3"/><path d="m10.5 12.5 7-7"/><path d="m15 8 2 2"/><path d="m17 6 2 2"/></>,
    service: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h5M8 17h3"/></>,
    swap: <><path d="m7 7 3-3 3 3"/><path d="M10 4v12"/><path d="m17 17-3 3-3-3"/><path d="M14 20V8"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const steps = [
  {
    icon: "key" as const,
    title: "Own",
    text: "A provider-issued Capability Cell represents a service right accepted under provider policy.",
  },
  {
    icon: "service" as const,
    title: "Use",
    text: "Model, data, or compute providers verify the entitlement before protected requests run.",
  },
  {
    icon: "swap" as const,
    title: "Transfer",
    text: "Move the Capability Cell to a new owner. The old outpoint is consumed on CKB.",
  },
  {
    icon: "shield" as const,
    title: "Verify",
    text: "The previous owner stops authorizing while the new owner can use participating services.",
  },
];

export default function DisconnectedHome({ ready, onConnect, onTryDemo }: Props) {
  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="eyebrow">Portable service rights on CKB</div>
          <h1 id="landing-title">Own the service right, not another account.</h1>
          <p>
            SkillPass turns a CKB Capability Cell into a portable entitlement that participating providers can verify.
            Use it across supported services, transfer ownership, and let authorization follow the live owner.
          </p>
          <div className="landing-actions">
            <button className="button primary large" onClick={onTryDemo}>
              <LandingIcon name="service" size={18} />
              Try interactive demo
            </button>
            <button className="button secondary large" disabled={!ready} onClick={onConnect}>
              <LandingIcon name="wallet" size={18} />
              {ready ? "Connect JoyID · Live Testnet" : "Live Testnet loading…"}
            </button>
          </div>
          <div className="landing-demo-note">No wallet required for demo · Simulated lifecycle · About one minute</div>
          <div className="trust-row" aria-label="Security notes">
            <span><LandingIcon name="shield" size={14} /> Wallet signs locally in Live Testnet</span>
            <span>Provider-trusted issuance</span>
            <span>No private keys requested</span>
          </div>
        </div>

        <div className="landing-right-preview" aria-label="SkillPass ownership example">
          <div className="preview-label">Example service right</div>
          <div className="preview-pass-card">
            <div className="preview-pass-top">
              <span className="preview-pass-mark">SP</span>
              <div>
                <strong>Service Bundle Pass</strong>
                <small>CKB Capability Cell</small>
              </div>
              <span className="preview-active"><span /> Active</span>
            </div>
            <div className="preview-owner-row">
              <span>Current owner</span>
              <code>Alice · ckt1…92fa</code>
            </div>
            <div className="preview-tags">
              <span>Transferable</span>
              <span>Multi-provider</span>
              <span>Provider verified</span>
            </div>
          </div>
          <div className="preview-services">
            <div><LandingIcon name="check" size={14} /><span><strong>Model API</strong><small>Provider A</small></span></div>
            <div><LandingIcon name="check" size={14} /><span><strong>Private Data API</strong><small>Provider B</small></span></div>
            <div><LandingIcon name="check" size={14} /><span><strong>Compute API</strong><small>Provider C</small></span></div>
          </div>
          <p className="preview-note">One accepted entitlement can be recognized by independent providers without a shared ownership database.</p>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section-heading">
          <span className="eyebrow">How SkillPass works</span>
          <h2 id="how-title">One lifecycle, four things to prove.</h2>
          <p>The interactive demo lets you perform this lifecycle immediately. Live Testnet uses real JoyID ownership and CKB state.</p>
        </div>
        <ol className="onboarding-grid four-items">
          {steps.map((step, index) => (
            <li className="onboarding-card" key={step.title}>
              <div className="onboarding-card-top">
                <span className="onboarding-number">{index + 1}</span>
                <span className="onboarding-icon"><LandingIcon name={step.icon} size={18} /></span>
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
        <div className="testnet-callout">
          <LandingIcon name="shield" size={18} />
          <div>
            <strong>Live issuance stays provider-controlled</strong>
            <p>Public users cannot self-mint trusted entitlements. A participating provider must issue or transfer a compatible Testnet pass.</p>
          </div>
        </div>
      </section>

      <section className="landing-section use-case-section" aria-labelledby="use-case-title">
        <div className="landing-section-heading">
          <span className="eyebrow">Concrete example</span>
          <h2 id="use-case-title">Alice transfers one service right; participating providers recognize Bob.</h2>
          <p>The live Capability Cell is the ownership reference. Transfer changes who can exercise the entitlement without synchronizing ownership records across providers.</p>
        </div>

        <div className="use-case-grid">
          <article className="story-card">
            <span className="story-step">01 · Own & use</span>
            <h3>Alice owns Service Bundle Pass.</h3>
            <p>Model, data, and compute providers independently accept the entitlement under their own policies.</p>
            <div className="story-status good"><LandingIcon name="check" size={14} /> Alice authorized</div>
          </article>
          <div className="story-arrow"><LandingIcon name="arrow" size={20} /></div>
          <article className="story-card emphasized">
            <span className="story-step">02 · Transfer</span>
            <h3>Alice transfers the pass to Bob.</h3>
            <p>The old Cell outpoint is consumed and the entitlement continues under Bob's new ownership.</p>
            <div className="story-status split"><span>× Alice</span><span>✓ Bob</span></div>
          </article>
          <div className="story-arrow"><LandingIcon name="arrow" size={20} /></div>
          <article className="story-card">
            <span className="story-step">03 · Verify</span>
            <h3>Providers verify the live owner.</h3>
            <p>Alice is rejected; Bob can use the same participating Model, Data, and Compute services.</p>
            <div className="story-status good"><LandingIcon name="check" size={14} /> Bob authorized</div>
          </article>
        </div>
      </section>

      <section className="landing-section distinction-section" aria-labelledby="difference-title">
        <div className="landing-section-heading compact-copy">
          <span className="eyebrow">What SkillPass proves</span>
          <h2 id="difference-title">Entitlement and payment stay separate.</h2>
          <p>SkillPass answers who currently owns or may exercise a service right. An optional payment layer can independently settle a particular usage charge.</p>
        </div>
        <div className="distinction-grid">
          <div className="distinction-card">
            <span>SkillPass</span>
            <strong>Who currently owns or may exercise the service right?</strong>
            <small>CKB ownership · provider policy · optional bounded delegation</small>
          </div>
          <div className="distinction-plus">+</div>
          <div className="distinction-card">
            <span>Payment layer</span>
            <strong>Has this request's usage charge been satisfied?</strong>
            <small>Optional per-use payment, kept separate from entitlement</small>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <div>
          <span className="eyebrow">Start with the product</span>
          <h2>See Alice → Bob authorization before connecting a wallet.</h2>
          <p>Run the simulated lifecycle first, then move to Live Testnet when you have a provider-issued pass.</p>
        </div>
        <div className="landing-cta-actions">
          <button className="button primary large" onClick={onTryDemo}>Try interactive demo</button>
          <button className="button secondary large" disabled={!ready} onClick={onConnect}>{ready ? "Live Testnet" : "Loading…"}</button>
        </div>
      </section>
    </div>
  );
}
