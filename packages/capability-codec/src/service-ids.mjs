/** Application-level ID for the built-in `model-api-v1` demo service. */
export const MODEL_API_V1_SERVICE_ID =
  "0x1341732dda1ffda79bdba1af9936ec5ee80f29b55d3a5ae003c064c736820995";

/** Application-level ID for the built-in `private-data-api-v1` demo service. */
export const PRIVATE_DATA_API_V1_SERVICE_ID =
  "0x337378a2d734d4e20e84f8ea71b7f5f0f95d83454225839cd408da5afcc06243";

/** Application-level ID for the built-in `compute-api-v1` demo service. */
export const COMPUTE_API_V1_SERVICE_ID =
  "0x1bb78da57f5f4ec0e02e0ac84ccd0620edcf71ad44752b021c63d16559977d2b";

/** Shared entitlement accepted by all three default Service Bundle demo services. */
export const SERVICE_BUNDLE_V1_ENTITLEMENT_ID =
  "0x6e1ac48a15fdd09e4dfd0c662603b0a09f66cda66bea56f0034ecf4877ef0fa9";

/** @deprecated Use SERVICE_BUNDLE_V1_ENTITLEMENT_ID. Kept for older integrations. */
export const AGENT_PRO_BUNDLE_V1_ENTITLEMENT_ID = SERVICE_BUNDLE_V1_ENTITLEMENT_ID;

// Deprecated exports are kept only so older scripts/tests importing the package
// do not break immediately. They are no longer exposed by the live product UI.
export const PAPER_ANALYZER_V1_SERVICE_ID =
  "0x7cf62c68d4936745fd36e71ffd59d906061abdb4e8cffde4d0c352f839804377";
export const RESEARCH_INSIGHTS_V1_SERVICE_ID =
  "0xc81c36ee26f2e1150be7aa86388657f1bad9551037e21aec72f74e6433601270";

/** Default identity for the operator-configured private JSON upstream gateway. */
export const PRIVATE_JSON_GATEWAY_V1_SERVICE_ID =
  "0xcba940e239ea36ad3722797679307193b2965b9e7f75bdbaadd981ed0482593f";
