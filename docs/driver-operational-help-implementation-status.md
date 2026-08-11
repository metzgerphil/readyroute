# Driver Assistant implementation status

Status date: 2026-08-10

## Current state

Phase 2 has been reconciled to the completed owner-defined Phase 1 mainstream daily-driver release. Deferred non-mainstream sources and human questions remain governed work and do not relax publication safety: unresolved, outdated, insufficient-evidence, or evidence-gated records remain unable to produce definitive driver instructions.

The existing product already provides the core V1 experience:

- Operational Help is the driver's primary mobile screen; Route Tools remains available.
- Voice uses native `expo-speech-recognition`, and voice/text share the same authenticated API.
- Retrieval supports `ANSWER`, minimum `CLARIFY`, and `ESCALATE`, plus conversational session context.
- Feedback, unanswered-question capture, manager activity, and account-scoped storage are implemented.
- No external model is required for V1 and no general-knowledge operational fallback exists.

## Canonical production boundary completed locally

- The importer now reads `knowledge/operations/records.jsonl`, `knowledge/evaluations/driver-language-cases.jsonl`, and `knowledge/sources/registry.jsonl` rather than treating the research workbench as production authority.
- `SOURCE_VERIFIED` and `READY_ROUTE_APPROVED` are the only answer-eligible statuses. `PENDING_REVIEW`, `POTENTIALLY_OUTDATED`, and `INSUFFICIENT_EVIDENCE` remain indexed blockers.
- Canonical `production_eligibility` controls publication independently of status.
- Canonical record version, source IDs, adjudication ID, approver, approval date, schema version, answer snapshot, candidates, and response latency are preserved for audit.
- Explicit tests prove prompt-injection wording cannot enable a noneligible record, general-knowledge fallback, or alteration of the selected canonical answer.
- Release generation and runtime import now use separate gate evaluators: raw research records are checked against capture and claim-allocation evidence during generation, while runtime import accepts only the resulting canonical eligibility fields. A regression test protects this boundary.

Current canonical dry import:

- 144 indexed records
- 97 publication-ready records
- 0 status-eligible but publication-withheld records
- 42 source identities used by the runtime import
- 385 record-to-source evidence links

Current production retrieval validation:

- 192/192 top-1 mappings
- 192/192 top-5 mappings
- 192/192 response-mode matches
- 0 unsafe answer-gating failures

Independent Phase 2 holdout:

- 12 previously unused driver phrasings covering routine answers, clarification, unresolved knowledge, and a boundary-bypass prompt
- Initial result: 5/12 passed, exposing synonym and intent-ranking failures
- After normalization and intent-layer corrections: 12/12 passed
- Maintained Phase 1 suite remained 192/192 with zero unsafe-answer failures after the corrections
- The authenticated 2026-08-10 re-download of `FedEx_Driver_Bot_Scenarios.xlsx` matched the archived reviewed source byte-for-byte; its 78 rows remain a secondary adversarial/evaluation source and do not independently authorize procedures.

## Database and analytics changes prepared locally

- An additive migration converts old research statuses to canonical statuses and adds source/adjudication trace, canonical interaction trace, escalation detail, and latency fields.
- Internal activity metrics now include canonical match rate, no-verified-answer rate, and average response latency in addition to answer, clarification, escalation, and feedback counts.
- Internal activity now also separates retrieval failures and groups questions by the selected canonical operational category.
- Internal activity reports active-driver count and questions per active driver for the selected interaction window.
- A separate idempotent $5 driver/calendar-month ledger is prepared. Driver creation/activation accrues one row per month; same-month deactivation/reactivation cannot duplicate it; a monthly function accrues active drivers for a new month. It does not issue Stripe charges.
- One-authorized-device control is prepared end to end. The official app creates a stable identifier in device-only secure storage; the backend stores only its SHA-256 hash, revokes the prior authorization after a successful replacement-device login, places the authorization in the signed driver token, and revalidates it on production requests. Manager-only mobile sessions are not incorrectly subjected to driver-device controls.
- Secure driver invitations are prepared end to end at the API and acceptance-page layers. A manager can issue a seven-day invite; resending changes `invited_at` and invalidates the earlier link; acceptance is single-use and stores only a bcrypt password hash. Once established, the password becomes the driver's credential authority and invalidates earlier PIN-derived sessions. The public portal provides `/driver-invite` for optional username and private password establishment.
- The legacy driver-login fallback now accepts the established password as well as a legacy four-digit PIN. This prevents the official app's fallback path from rejecting invited drivers.
- Invite/reset issuance and acceptance have dedicated rate limits. Token and driver identifiers are hashed before use as limiter keys.
- All Phase 2 tables explicitly grant backend service-role access without granting client reads or writes.

UTC is the documented V1 billing-month boundary. A different contractual billing timezone would be a business-policy change and must be decided before commercial billing.

## Verification in this worktree

- Canonical importer/retrieval focused tests: passed.
- Backend unit suite with inert local test configuration: 420 passed, 8 skipped, 0 failed (428 total). The applied-database integration test is intentionally skipped in the portable unit run.
- Applied local Supabase migrations and SQL integration: passed. Checks cover two companies, RLS/anonymous denial, canonical publication constraints, monthly billing idempotency, username uniqueness, and device uniqueness.
- Applied local Supabase authentication integration: passed. Checks cover invite resend/replay/expiry, cross-company substitution, reset replay, and immediate revocation of the previous device token.
- Phase 1 production retrieval suite: passed all 192 cases with zero unsafe answers.
- Candidate operational retrieval suite: passed 69/69 with zero unsafe-answer failures.
- Phase 3 adversarial/context/status suite: passed 1,184/1,184 after post-Phase-1 reconciliation defects were fixed and retained as regressions.
- Canonical traceability audit: 97/97 publication-ready records, 7/7 active approvals, and 27/27 direct-answer cases.
- Knowledge import dry run: passed with the counts above.
- Driver app: 29 suites / 225 tests passed; Expo configuration check passed. Existing VirtualizedList `act(...)` warnings remain non-failing test-harness cleanup.
- The mobile dependency install reports 12 high-severity transitive audit findings; dependency triage is required before release rather than applying an unreviewed breaking `npm audit fix --force`.
- Backend and manager-portal production dependency audits report zero vulnerabilities after non-breaking updates. Manager portal lint and production build pass.
- Portable knowledge validation, release build, source-archive checksum/integrity validation, 192-case retrieval evaluation, and 12-case independent holdout all pass.
- `git diff --check`: passed after the canonical-boundary changes.

## Deliberately not performed

- No database migration or canonical import was applied to staging or production.
- No backend, portal, mobile, TestFlight, or App Store deployment was performed.
- No EAS build was created.
- No live Stripe charge or invoice item was created.
- No deferred Phase 1 record was upgraded merely to keep Phase 2 moving.

## Remaining Phase 2 work

1. Resolve mobile Expo/Metro dependency advisories through a reviewed SDK upgrade, then repeat the mobile suite and physical-device speech/noise/latency testing.
2. Approve production proxy/crash redaction and retention periods; complete attorney privacy/terms/liability review.
3. Complete payment-provider configuration and billing-policy review before connecting invoice preparation. Live charging remains intentionally disabled.
4. Run a controlled authenticated pilot and measure real-device latency, speech accuracy, retrieval failures, and negative feedback.
5. Preserve deferred non-mainstream acquisitions and human reconciliation without publishing unsupported answers.
