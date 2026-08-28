# Problem and research hypothesis

Service providers normally represent rights in private account tables: subscription rows, API keys, seats, licenses, or prepaid-credit records. Payment protocols solve a different problem: they prove that value was transferred. Neither fact alone answers **who currently owns a durable service right and whether that right may move to somebody else**.

SkillPass separates three questions:

1. **Ownership:** who currently owns the provider-issued right? -> CKB live Cell.
2. **Payment:** did this invocation satisfy its economic condition? -> Fiber/x402 path.
3. **Delivery:** did the protected service authorize and execute this request? -> verifier + signed/recorded response.

The central hypothesis is:

> A provider can retain issuer authority while service entitlement ownership becomes portable and independently verifiable from CKB state, and frequent usage/payment can remain off the CKB L1 state transition path through Fiber.

The key acceptance consequence is still simple: A owns and can use; A transfers; A is rejected; B owns and can use. v0.3 extends this so **a successful payment by the wrong owner must still be rejected**.
