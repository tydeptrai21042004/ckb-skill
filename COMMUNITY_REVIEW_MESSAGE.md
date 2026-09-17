Gm everyone — I’ve been working on a new product-focused prototype called **SkillPass Care**, built from the portable service-right direction I’ve been exploring with SkillPass.

Instead of starting from generic API gating, SkillPass Care focuses on a more concrete problem: **service coverage for a second-hand/refurbished product should be able to move to the new owner**.

The intended lifecycle is simple:

**Alice owns the product + service right → Alice is eligible → Alice transfers the product/right to Bob → Alice stops qualifying → Bob can use the remaining coverage at accepted providers.**

The longer-term CKB design is for the current live service-right Cell to be the ownership reference, while each provider independently keeps its own issuer/policy/finality rules rather than relying on one shared customer-entitlement database.

I’ve also tried to keep the current implementation honest: the public deployment has a serverless-safe demo and an authenticated pilot API, but the CKB adapter still fails closed for entitlement reads/writes until the live Cell schema and wallet-signed issuance/transfer path are implemented. So I’m treating this as a production-oriented product prototype, not claiming the demo transfer is already an on-chain production transfer.

Current deployment: https://skill-pass-care-api.vercel.app/

I’d really appreciate review on four areas: **(1)** whether this product use case is useful enough, **(2)** the minimal safe Cell/state model, **(3)** transfer and claim-consumption rules, and **(4)** what an independent provider should verify from CKB before serving the current holder.

Any technical or product feedback is very welcome — especially criticism of the trust boundaries or places where the current model is still too centralized.
