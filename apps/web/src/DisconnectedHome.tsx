import type { ReactNode } from "react";

type Props = {
  ready: boolean;
  onConnect: () => void;
};

type FeatureIcon = "wallet" | "key" | "service" | "agent" | "swap" | "shield" | "arrow" | "check";

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
    agent: <><rect x="5" y="7" width="14" height="11" rx="3"/><path d="M12 3v4M9 12h.01M15 12h.01M9 15h6"/></>,
    swap: <><path d="m7 7 3-3 3 3"/><path d="M10 4v12"/><path d="m17 17-3 3-3-3"/><path d="M14 20V8"/></>,
    shield: <><path d="M12 3 5 6v5c0 4.6 2.8 8.2 7 10 4.2-1.8 7-5.4 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const steps = [
  {
    icon: "wallet" as const,
    title: "Connect JoyID",
    text: "Connect a CKB Testnet wallet. SkillPass never asks for your private key or seed phrase.",
  },
  {
    icon: "key" as const,
    title: "Receive a service right",
    text: "A provider issues or transfers a SkillPass Capability Cell to your wallet. You become the on-chain owner of that right.",
  },
  {
    icon: "service" as const,
    title: "Use an accepted service",
    text: "The provider verifies the live Capability Cell before the request runs. One entitlement can be accepted by multiple providers.",
  },
  {
    icon: "agent" as const,
    title: "Delegate to an agent",
    text: "When the policy allows it, create a short-lived credential with limits such as expiry, maximum uses, or spend budget.",
  },
  {
    icon: "swap" as const,
    title: "Transfer the right",
    text: "Send the Capability Cell to a new owner. Credentials tied to the consumed old outpoint stop authorizing access.",
  },
];

export default function DisconnectedHome({ ready, onConnect }: Props) {
  return (
    <div className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="eyebrow">Portable service rights on CKB</div>
          <h1 id="landing-title">Own the service right, not another account.</h1>
          <p>
            SkillPass turns a CKB Capability Cell into a portable entitlement that independent services can verify,
            an AI agent can use under bounded delegation, and a new owner can receive by transfer.
          </p>
          <div className="landing-actions">
            <button className="button primary large" disabled={!ready} onClick={onConnect}>
              <LandingIcon name="wallet" size={18} />
              {ready ? "Connect JoyID" : "Loading Testnet…"}
            </button>
            <a className="button secondary large" href="#how-it-works">How it works</a>
          </div>
          <div className="trust-row" aria-label="Security notes">
            <span><LandingIcon name="shield" size={14} /> Wallet signs locally</span>
            <span>CKB Testnet</span>
            <span>No private keys requested</span>
          </div>
        </div>

        <div className="landing-right-preview" aria-label="SkillPass ownership example">
          <div className="preview-label">Service right</div>
          <div className="preview-pass-card">
            <div className="preview-pass-top">
              <span className="preview-pass-mark">SP</span>
              <div>
                <strong>Agent Pro Pass</strong>
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
              <span>Delegatable</span>
              <span>Multi-provider</span>
            </div>
          </div>
          <div className="preview-services">
            <div><LandingIcon name="check" size={14} /><span><strong>Model API</strong><small>Provider A</small></span></div>
            <div><LandingIcon name="check" size={14} /><span><strong>Private Data</strong><small>Provider B</small></span></div>
            <div><LandingIcon name="check" size={14} /><span><strong>Compute</strong><small>Provider C</small></span></div>
          </div>
          <p className="preview-note">Example architecture: the entitlement is portable; the service implementation can be replaced.</p>
        </div>
      </section>

      <section className="landing-section" id="how-it-works" aria-labelledby="how-title">
        <div className="landing-section-heading">
          <span className="eyebrow">Try the lifecycle</span>
          <h2 id="how-title">Step by step</h2>
          <p>The public app focuses on the ownership and authorization lifecycle. Issuance remains a provider action.</p>
        </div>
        <ol className="onboarding-grid">
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
            <strong>Before you test</strong>
            <p>You need a CKB Testnet wallet and a provider-issued or transferred pass. On-chain transfer also requires sufficient Testnet capacity for the transaction.</p>
          </div>
        </div>
      </section>

      <section className="landing-section use-case-section" aria-labelledby="use-case-title">
        <div className="landing-section-heading">
          <span className="eyebrow">Concrete example</span>
          <h2 id="use-case-title">An AI agent changes owner without keeping the old owner's access.</h2>
          <p>This is the kind of workflow SkillPass is designed to make explicit and independently verifiable.</p>
        </div>

        <div className="use-case-grid">
          <article className="story-card">
            <span className="story-step">01 · Own</span>
            <h3>Alice owns Agent Pro Pass.</h3>
            <p>Independent providers accept the same entitlement for model, data, or compute access.</p>
            <div className="story-status good"><LandingIcon name="check" size={14} /> Alice authorized</div>
          </article>
          <div className="story-arrow"><LandingIcon name="arrow" size={20} /></div>
          <article className="story-card">
            <span className="story-step">02 · Delegate</span>
            <h3>Alice delegates limited use to Agent X.</h3>
            <p>The agent receives temporary authority, for example 20 calls for 2 hours, without receiving Alice's wallet key.</p>
            <div className="story-status good"><LandingIcon name="check" size={14} /> Agent X bounded</div>
          </article>
          <div className="story-arrow"><LandingIcon name="arrow" size={20} /></div>
          <article className="story-card emphasized">
            <span className="story-step">03 · Transfer</span>
            <h3>Alice transfers the pass to Bob.</h3>
            <p>The old Cell outpoint is consumed. Providers verify the new live owner instead of relying on an account database update.</p>
            <div className="story-status split"><span>× Alice / Agent X</span><span>✓ Bob</span></div>
          </article>
        </div>
      </section>

      <section className="landing-section distinction-section" aria-labelledby="difference-title">
        <div className="landing-section-heading compact-copy">
          <span className="eyebrow">What SkillPass proves</span>
          <h2 id="difference-title">Entitlement and payment are separate.</h2>
          <p>Owning a service right answers “may this principal use the service?” A payment rail can separately answer “has this particular use been paid for?”</p>
        </div>
        <div className="distinction-grid">
          <div className="distinction-card">
            <span>SkillPass</span>
            <strong>Who currently owns or may exercise the service right?</strong>
            <small>CKB ownership · provider policy · bounded delegation</small>
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
          <span className="eyebrow">CKB Testnet</span>
          <h2>See the right from the owner's side.</h2>
          <p>Connect JoyID to discover passes owned by your wallet and continue into the live SkillPass workspace.</p>
        </div>
        <button className="button primary large" disabled={!ready} onClick={onConnect}>
          <LandingIcon name="wallet" size={18} />
          {ready ? "Connect JoyID" : "Loading Testnet…"}
        </button>
      </section>
    </div>
  );
}
