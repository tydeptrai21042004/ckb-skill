export declare function providerIdDigest(providerId: string): string;
export declare function publicKeyFromPrivateKey(privateKeyPem: string): string;
export declare function publicKeyFingerprint(publicKeyPem: string): string;
export declare function verifyResolvedCapabilityCell(input: {
  cell: Record<string, any>;
  capability?: Record<string, any>;
  deployment: { codeHash: string; hashType: string };
  minConfirmations?: number;
}): Readonly<Record<string, any>>;
export declare function verifySkillPassAuthorization(input: Record<string, any>): Promise<Readonly<Record<string, any>>>;
export declare function verifyProviderAuthorization(input: Record<string, unknown>): Promise<Readonly<Record<string, unknown>>>;
export declare function signProviderManifest(input: { manifest: Record<string, unknown>; privateKeyPem: string; keyId?: string; issuedAt?: string; expiresAt?: string }): Readonly<Record<string, unknown>>;
export declare function verifyProviderManifest(input: { signedManifest: Record<string, any>; publicKeyPem?: string; now?: number }): boolean;
export declare function verifyTrustedProviderManifest(input: { signedManifest: Record<string, any>; trustedPublicKeyPem?: string; trustedFingerprint?: string; now?: number }): boolean;
export declare function createGatewayAssertion(input: { claims: Record<string, unknown>; privateKeyPem: string; keyId?: string; ttlSeconds?: number; now?: number }): string;
export declare function verifyGatewayAssertion(input: { token: string; publicKeyPem: string; now?: number }): Readonly<Record<string, any>>;
export declare function verifyGatewayRequest(input: {
  token: string;
  publicKeyPem: string;
  expectedProviderId: string;
  expectedServiceId: string;
  expectedRequestHash: string;
  expectedInvocationKey?: unknown;
  expectedCapabilityId?: unknown;
  expectedPolicyFingerprint?: unknown;
  expectedOperationId?: unknown;
  now?: number;
}): Readonly<Record<string, any>>;
