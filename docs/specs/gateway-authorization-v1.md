# SkillPass Gateway Authorization v1

A gateway authorization is a short-lived Ed25519 assertion sent to a protected upstream in `x-skillpass-authorization`.

Claims bind the authorization to the provider, service, Capability, live owner context, request hash, policy, operation/delegation identity and durable invocation key.

Remote providers should use `verifyGatewayRequest()` rather than checking the signature alone. At minimum, bind the token to the expected provider ID, service ID and canonical request hash. Idempotent side-effecting providers should also bind and deduplicate the invocation key.
