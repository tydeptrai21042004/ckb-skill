export type DemoIdentity = "Alice" | "Bob";
export type DemoDecision = "granted" | "denied";

export type DemoReceipt = {
  decision: DemoDecision;
  requester: DemoIdentity;
  owner: DemoIdentity;
  service: string;
  provider: string;
  message: string;
  detail?: string;
};

export function otherIdentity(identity: DemoIdentity): DemoIdentity {
  return identity === "Alice" ? "Bob" : "Alice";
}

export function authorizeDemoRequest({
  requester,
  owner,
  service,
  provider,
  detail,
}: {
  requester: DemoIdentity;
  owner: DemoIdentity;
  service: string;
  provider: string;
  detail?: string;
}): DemoReceipt {
  const decision: DemoDecision = requester === owner ? "granted" : "denied";
  return {
    decision,
    requester,
    owner,
    service,
    provider,
    detail,
    message: decision === "granted"
      ? `${requester} is the current owner of Service Bundle Pass.`
      : `${requester} is not the current owner. ${owner} now owns this service right.`,
  };
}
