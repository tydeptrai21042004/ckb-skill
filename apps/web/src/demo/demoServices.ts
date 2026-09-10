export type DemoService = {
  slug: "model-api-v1" | "private-data-api-v1" | "compute-api-v1";
  name: string;
  provider: string;
  description: string;
  inputKind: "text" | "json";
  placeholder: string;
};

export const demoServices: DemoService[] = [
  {
    slug: "model-api-v1",
    name: "Model API",
    provider: "Provider A",
    description: "Protected model inference and embedding access.",
    inputKind: "text",
    placeholder: "Summarize why portable service rights are useful.",
  },
  {
    slug: "private-data-api-v1",
    name: "Private Data API",
    provider: "Provider B",
    description: "Protected queries over provider-controlled example data.",
    inputKind: "json",
    placeholder: '{"query":"available research assets","limit":3}',
  },
  {
    slug: "compute-api-v1",
    name: "Compute API",
    provider: "Provider C",
    description: "Protected deterministic compute execution.",
    inputKind: "json",
    placeholder: '{"task":"vector-score","values":[3,5,8]}',
  },
];

export function runDemoService(service: DemoService, input: string) {
  if (service.slug === "model-api-v1") {
    const normalized = input.trim().replace(/\s+/g, " ");
    return {
      title: "Model response",
      summary: normalized
        ? `Accepted protected request. Demo model processed ${normalized.length} characters under the current SkillPass entitlement.`
        : "Accepted protected request under the current SkillPass entitlement.",
      detail: "model-demo-v1 · deterministic demo inference",
    };
  }

  if (service.slug === "private-data-api-v1") {
    return {
      title: "Protected data returned",
      summary: "3 provider-controlled demo records matched the authorized query.",
      detail: "dataset: service-rights-demo · rows: 3 · read-only",
    };
  }

  return {
    title: "Compute job completed",
    summary: "The deterministic demo job completed after entitlement verification.",
    detail: "job: demo-compute-001 · status: complete · idempotent",
  };
}
