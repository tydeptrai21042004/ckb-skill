export interface AuthorizationIntentInput {
  action?: string;
  serviceSlug: string;
  serviceId: string;
  policyId: string;
  policyFingerprint: string;
  capabilityOutPoint: { txHash: string; index: string | number | bigint } | string;
  requestHash: string;
  operationId?: string;
  delegationId?: string;
  address: string;
  nonce: string;
  expiresAt: number;
}
export declare function formatAuthorizationIntent(input: AuthorizationIntentInput): string;
export declare function authorizationIntentFields(input: AuthorizationIntentInput): Readonly<Record<string, string>>;
