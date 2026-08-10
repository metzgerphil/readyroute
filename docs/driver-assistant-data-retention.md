# Driver Assistant data-retention proposal

Status: implementation-ready proposal, 2026-08-10. Final periods require privacy counsel and Ready Route approval before automated deletion is enabled.

## Logging boundary

- Application request logs record the route path without query parameters, request ID, authenticated actor identifiers, status, and latency.
- Request bodies are not included, so operational questions, passwords, invite/reset tokens, and device identifiers are excluded from ordinary structured request logs.
- Authorization headers and raw device identifiers must remain excluded from application, proxy, crash, and analytics logging.
- Driver Help stores the question only in its account-scoped interaction record, where it is needed for quality review and traceability.

## Proposed retention schedule

| Data | Proposed period | Disposal behavior |
| --- | --- | --- |
| Driver Help interactions and exact response snapshots | 12 months | Delete or de-identify after the period, preserving aggregate metrics that cannot identify a driver. |
| Driver Help feedback and unanswered-question links | 12 months, aligned to the interaction | Cascade with the interaction after quality-review obligations are complete. |
| Revoked device authorizations | 90 days after revocation | Delete the hashed device record; never retain the raw identifier. |
| Active device authorization | While active plus 90 days | Revoke on replacement/deactivation, then apply the revoked-device period. |
| Invite and reset state | Invite acceptance or supersession plus 30 days | Keep timestamps needed for replay defense; raw JWTs are never stored. |
| Driver profile and account PII | Active account plus the approved account-retention period | Follow the company account lifecycle and legal deletion/hold process. |
| Billing activation ledger | Statutory accounting period selected by counsel | Preserve immutable charge evidence; restrict access and avoid storing payment-card data. |
| Aggregated product metrics | Indefinite only when de-identified | Remove account, driver, question text, and free-text feedback identifiers. |

## Required decisions before automation

1. Attorney/privacy approval of the periods, deletion rights, legal holds, and operational-data rights.
2. Whether negative-feedback investigations require a longer bounded hold.
3. The accounting retention period for activation-ledger records.
4. Production proxy, crash-reporting, and observability configuration review to confirm the same redaction boundary outside the application process.

No purge job is enabled by this proposal. That avoids irreversible deletion before the business and legal decisions are made.
