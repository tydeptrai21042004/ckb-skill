# Problem

Digital and AI services normally keep access rights in provider-controlled account tables. SkillPass tests a narrower model: a service right is represented by a CKB Cell whose current lock identifies the owner and whose Type Script enforces the capability's immutable identity and transfer policy. The first service is `paper-analyzer-v1`.

The experiment asks whether a service right can remain portable and independently verifiable from CKB state while the service provider still controls issuance. The MVP is successful only when User A can use the service, transfer the capability Cell to User B, immediately lose access, and User B gain access without an administrator changing a centralized entitlement record.
