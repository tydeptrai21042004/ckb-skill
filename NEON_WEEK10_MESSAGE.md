Gm Neon, quick Week 10 update — I continued improving the original SkillPass proposal, but I also tried to make the portable-service-right idea much more concrete by building a new product-focused prototype called **SkillPass Care**.

The new use case is service coverage for second-hand/refurbished products. The intended flow is: **Alice owns the product + service right → Alice is eligible → the right is transferred to Bob → Alice stops qualifying → Bob can use the remaining coverage at accepted providers.** I think this makes the value of transferable service rights easier to understand than starting from generic gated APIs.

On the existing SkillPass side, I continued hardening the provider/adoption path: independent provider verification, provider scaffolding, signed authorization evidence, portable audit/transfer evidence, and clearer cross-provider acceptance surfaces. I also ran the focused v1.8 feature test on the current snapshot and it passed **4/4**.

For SkillPass Care, I created a separate production-oriented web/API structure with a Vercel-ready public demo, authenticated pilot API, shared transition rules, provider SDK, and an explicit CKB boundary. I’m deliberately not presenting the current demo as an on-chain transfer: the CKB adapter fails closed until I implement the real Cell schema, canonical live-Cell resolution, and wallet-signed issuance/transfer path.

I also followed your suggestion on getting more external feedback. I reached out to Hanssen and he said he left feedback on GitHub. Separately, I volunteered to review Vellum’s Claim Cell protocol and found a possible replay/durability issue around removed claims being recreated if there is no durable anti-replay rule; the maintainer acknowledged it.

The main next step is now much narrower: implement one real CKB Testnet SkillPass Care lifecycle — issue to Alice, provider verifies Alice, transfer to Bob, Alice is denied after confirmation, Bob is accepted, and a second provider independently reaches the same ownership result.

Week 10 report:
https://github.com/tydeptrai21042004/ckb-skill/blob/main/reports/week-10-report/week-10-report.md

SkillPass Care deployment:
https://skill-pass-care-api.vercel.app/

I’d really appreciate your thoughts on whether this **product-coverage / second-owner** use case is a stronger direction for the portable service-right concept, and whether I should keep SkillPass Care very narrow until the real Testnet lifecycle is fully proven.
