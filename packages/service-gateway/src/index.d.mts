export type ServiceInputKind = "text" | "json";
export type SkillPassService = {
  slug: string;
  id: `0x${string}`;
  name: string;
  description: string;
  inputKind: ServiceInputKind;
  maxInputChars: number;
  kind: string;
  operationMode?: "read";
  execute: (input: unknown, context?: Record<string, unknown>) => Promise<unknown> | unknown;
};
export type PublicSkillPassService = Omit<SkillPassService, "execute">;
export type ServiceRegistry = {
  services: readonly SkillPassService[];
  getBySlug(slug: string): SkillPassService | null;
  getById(id: string): SkillPassService | null;
  publicList(): readonly PublicSkillPassService[];
};
export function canonicalJson(value: unknown): string;
export function normalizeServiceSlug(value: string): string;
export function createServiceRegistry(services: SkillPassService[]): ServiceRegistry;
export function validateServiceInput(service: Pick<SkillPassService, "inputKind" | "maxInputChars">, input: unknown): unknown;
