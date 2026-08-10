# Phase 3 privacy review

Status: engineering data map and minimization review; not legal approval.

| Data | Purpose and storage | Access | Minimization/retention state |
| --- | --- | --- | --- |
| Driver name, email, phone, FedEx ID, username | Company-scoped driver profile in Supabase | Authorized company managers and backend service role; driver authentication uses the relevant identity | Required fields should be confirmed against onboarding necessity; proposed account-lifecycle retention awaits counsel. |
| Password/PIN | Bcrypt hash only | Authentication backend | Plaintext prohibited; credential-version hash invalidates sessions. |
| Device identity | SHA-256 hash, device label, authorization/revocation timestamps | Backend service role and authorized management workflows | Raw identifier is not stored; proposed revoked-record period is 90 days pending approval. |
| Driver questions and normalized text | Account-scoped interaction and unanswered-question records | Driver actor, company review workflows, backend service role | Needed for traceability/quality; proposed 12-month period and later deletion/de-identification await approval. |
| Canonical answer snapshot and trace | Interaction record | Same scoped reviewers | Required to reconstruct historical answers; tied to interaction retention. |
| Feedback and optional comment | Account-scoped feedback record | Same scoped reviewers | Lightweight and optional; free text may contain incidental PII and should share interaction retention. |
| Usage/latency metrics | Derived interaction fields and internal aggregates | Authorized internal/manager views | Prefer de-identified aggregates for longer retention. |
| Speech audio | Not stored by Ready Route; device-native recognition produces transcript | Device/platform speech service according to platform configuration | Physical-device/platform privacy disclosure review remains required. |
| Billing activation ledger | Account, driver, month, amount, provider reference/status | Backend billing processes and authorized company views | Contains no payment-card data; statutory retention requires counsel/accounting decision. |
| Request logs | Path without query, request ID, actor identifiers, status, latency | Production operators | Bodies, authorization headers, raw device IDs, questions, and tokens are excluded at application layer; proxy/crash tooling still requires verification. |

The proposed periods and deletion decisions are maintained in `docs/driver-assistant-data-retention.md`. Consent, privacy notice, data rights, legal holds, operational-data rights, and final retention require qualified review. Ready Route does not claim legal compliance from this engineering review.

