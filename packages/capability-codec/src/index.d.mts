export type CapabilityV1 = Readonly<{
  version: 1; flags: number; serviceId: `0x${string}`; issuerId: `0x${string}`; capabilityId: `0x${string}`; expiry: bigint;
}>;
export type CapabilityV2 = Readonly<{
  version: 2; flags: number; serviceId: `0x${string}`; issuerId: `0x${string}`; capabilityId: `0x${string}`; expiry: bigint;
  subjectType: number; bindingMode: number; subjectId: `0x${string}`; policyHash: `0x${string}`;
}>;
export type Capability = CapabilityV1 | CapabilityV2;
export const CAPABILITY_VERSION: 1;
export const CAPABILITY_VERSION_V2: 2;
export const CAPABILITY_DATA_LENGTH: number;
export const CAPABILITY_V2_DATA_LENGTH: number;
export const SUBJECT_NONE: number; export const SUBJECT_SPORE: number; export const SUBJECT_DOB: number; export const SUBJECT_AGENT: number; export const SUBJECT_DEVICE: number; export const SUBJECT_CUSTOM: number;
export const BINDING_HOLDER: number; export const BINDING_SUBJECT_OWNER: number; export const BINDING_ATOMIC: number; export const BINDING_LICENSE: number;
export const FLAG_TRANSFERABLE: number; export const FLAG_DELEGATABLE: number; export const FLAG_REVOCABLE: number; export const KNOWN_FLAGS_MASK: number;
export function normalizeHex32(value: string, field?: string): `0x${string}`;
export function encodeCapability(input: Record<string, unknown> & {serviceId:string; issuerId:string; capabilityId:string; expiry: bigint|number|string}): Uint8Array;
export function encodeCapabilityHex(input: Record<string, unknown> & {serviceId:string; issuerId:string; capabilityId:string; expiry: bigint|number|string}): `0x${string}`;
export function decodeCapability(data: string | Uint8Array): Capability;
export function encodeTypeArgs(input: {issuerId:string; capabilityId:string}): `0x${string}`;
export function decodeTypeArgs(argsHex: string): Readonly<{issuerId:`0x${string}`; capabilityId:`0x${string}`} >;
export function hasFlag(capabilityOrFlags: Capability | number, flag: number): boolean;
export function isActive(capability: Capability, nowUnixSeconds: bigint | number | string): boolean;
