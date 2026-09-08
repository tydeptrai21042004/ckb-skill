export type SkillPassAgentService = {
  slug: string;
  id: `0x${string}` | string;
  endpoint?: string;
  inputKind?: "text" | "json";
  [key: string]: unknown;
};
export type SkillPassSigner = {
  getRecommendedAddress(): Promise<string>;
  signMessage(message: string): Promise<{ identity: string; signature: string; [key: string]: unknown }>;
};
export type SkillPassInvocationOptions = {
  baseUrl: string;
  signer: SkillPassSigner;
  outPoint: { txHash: string; index: string };
  service: SkillPassAgentService;
  input: unknown;
  delegation?: unknown;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
};
export type SkillPassPaymentAdapter = {
  createPaymentSignature(context: {
    requirement: string | null;
    response: unknown;
    service: SkillPassAgentService;
    baseUrl: string;
  }): Promise<string>;
};
export function discoverSkillPass(baseUrl: string, options?: { fetchImpl?: typeof fetch }): Promise<any>;
export function fetchAgentSpec(baseUrl: string, options?: { fetchImpl?: typeof fetch }): Promise<string>;
export function resolveService(discovery: any, selector: string): SkillPassAgentService;
export function buildSignedInvocation(options: SkillPassInvocationOptions): Promise<{ endpoint: string; body: Record<string, unknown>; challengeExpiresAt: number }>;
export function invokeSkillPass(options: SkillPassInvocationOptions): Promise<any>;
export function invokeSkillPassWithPayment(options: SkillPassInvocationOptions & { paymentAdapter: SkillPassPaymentAdapter }): Promise<any>;
