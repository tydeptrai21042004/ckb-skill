# Final balanced merge

This build combines the production/security packaging from the v1.5 corrected archive with the newer multi-service UI and service catalog.

Product emphasis:

- primary primitive: portable provider-issued service rights on CKB;
- default examples: Model API, Private Data API, Compute API;
- default shared entitlement: `service-bundle-v1`;
- ownership and transfer are primary; delegation is optional and can target another wallet, app, automation, device, or agent;
- Fiber/x402 remains an optional per-use payment layer and cannot replace entitlement authorization.

Compatibility:

`SERVICE_BUNDLE_V1_ENTITLEMENT_ID` uses the same 32-byte value as the previous Agent Pro demo entitlement. `AGENT_PRO_BUNDLE_V1_ENTITLEMENT_ID` remains as a deprecated code alias so older integrations do not break solely because of the naming change.

The old Paper Analyzer / Research Insights implementation remains only in legacy/local-demo and compatibility test code. It is not part of the primary live service catalog or connected web experience.
