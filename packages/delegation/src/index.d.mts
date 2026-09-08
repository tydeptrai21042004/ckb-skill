export type DelegationLimits = { maxUses?: number; maxSpendAtomic?: string };
export type DelegationGrantV1 = {
  version: 1;
  grantId: string;
  ownerAddress: string;
  delegateAddress: string;
  serviceSlug: string;
  serviceId: `0x${string}`;
  capabilityId: `0x${string}` | string;
  capabilityOutPoint: { txHash: string; index: string };
  action: string;
  issuedAt: number;
  expiresAt: number;
};
export type DelegationGrantV2 = Omit<DelegationGrantV1, "version"> & { version: 2; limits: DelegationLimits };
export type DelegationGrant = DelegationGrantV1 | DelegationGrantV2;
export type DelegationCredential = {
  grant: DelegationGrant;
  ownerSignature: { identity: string; signature: string; [key: string]: unknown };
};
export function normalizeDelegationGrant(value: unknown, options?: { now?: number; maxLifetimeMs?: number }): DelegationGrant;
export function buildDelegationMessage(grant: DelegationGrant): string;
export function assertDelegationScope(grant: DelegationGrant, expected: {
  delegateAddress?: string;
  serviceSlug?: string;
  serviceId?: string;
  capabilityId?: string;
  outPoint?: { txHash: string; index: string };
  action?: string;
  now?: number;
  maxLifetimeMs?: number;
}): DelegationGrant;
