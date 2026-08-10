# Ready Route Driver Assistant — Phase 2 Architecture

## Scope and transition state

Phase 2 may proceed while the explicitly deferred Phase 1 acquisitions and human answers remain open. That overlap does not relax the production knowledge gate: only canonical records whose status is `SOURCE_VERIFIED` or `READY_ROUTE_APPROVED` and whose `production_eligibility.publication_ready` value is true may produce a definitive instruction. `PENDING_REVIEW`, `POTENTIALLY_OUTDATED`, and `INSUFFICIENT_EVIDENCE` records remain indexed as blockers and must escalate instead of falling through to general knowledge.

This work does not deploy the application, create an EAS build, or build a production release.

## 1. What already exists

- An Expo/React Native driver app, Express backend, React manager portal, Supabase database, authentication middleware, company accounts, manager and driver roles, subscriptions, notifications, logging, and tests.
- A Phase 1 canonical release at `knowledge/operations/records.jsonl`, a publication-ready subset, source registry, adjudications, evidence traces, and 192 driver-language evaluation cases with 724 variants.
- An authenticated, account-scoped Driver Help API, deterministic retrieval service, conversation sessions, answer/clarification/escalation modes, immutable interaction snapshots, lightweight feedback, unanswered-question capture, manager activity reporting, and a driver-first mobile screen.
- Native speech-to-text through `expo-speech-recognition`; only the transcript is sent to Driver Help and the response is written.

## 2. What is reused

- Existing Express/Supabase boundaries, account and role authorization, driver activation, session invalidation, manager portal, mobile navigation, rate limiting, and test harnesses.
- Existing Driver Help tables and services, extended through additive migrations.
- Canonical Phase 1 records and validation cases. The research workbench is not a production authority.
- Existing Stripe infrastructure only where it safely supports company payment collection; the current route-count subscription calculation is not repurposed as driver billing.

## 3. What needs modification

- Import Driver Help from the canonical release, preserve canonical record versions/statuses/adjudications, and enforce the canonical publication gate.
- Treat both eligible statuses as answerable, with an active `READY_ROUTE_APPROVED` record taking canonical precedence.
- Snapshot full canonical trace data on every answer interaction.
- Replace outdated architecture/status documentation and expand adversarial status-boundary tests.
- Evolve the existing starter-PIN driver flow toward secure invitation/password establishment and one-authorized-device session control without locking out replacement devices.

## 4. What needs to be added

- An additive canonical-status/trace migration.
- A driver invitation and device-session lifecycle compatible with existing authentication.
- A calendar-month activation ledger that charges a company once per driver/month at $5, with no proration or same-month duplicate charge.
- Internal aggregates for category, response mode, clarification, unresolved rate, negative feedback, retrieval outcome, and latency.
- Security tests for prompt injection, cross-company access, deactivation/session invalidation, and canonical-boundary bypass attempts.

## 5. Knowledge retrieval architecture

The runtime flow is: normalize driver language → rank the complete canonical index → apply conversation context → check status and publication eligibility → evaluate required clarification → return the stored canonical answer or escalate. Noneligible records participate in ranking so that a closely matching unresolved topic blocks unsafe fallthrough. The service retrieves a small relevant set and never sends the raw corpus to a model.

Response modes are `ANSWER`, `CLARIFY`, and `ESCALATE`. An `ANSWER` must identify the exact canonical record/version and preserve source/adjudication trace. A historical interaction remains tied to the version used at response time.

## 6. AI/model integration

V1 does not require an external generative model. Deterministic retrieval plus canonical answer fields is the smallest reliable implementation and avoids model-created operational facts. A future model adapter may normalize language, rerank candidates, detect missing decision variables, or compress selected canonical text, but it must receive only eligible retrieved records, return structured output, and remain behind a server-side status gate. It may never use general FedEx knowledge as fallback.

## 7. Speech-to-text integration

Use the existing native `expo-speech-recognition` path. It fits the Expo mobile stack, avoids retaining raw audio in Ready Route's backend, supports a prominent tap-to-ask flow, and feeds the same API as typed text. The UI must show the transcript for correction and return written answers. No EAS build is part of this phase of local implementation; device accuracy, latency, permissions, noise performance, and platform availability remain release-gate tests.

## 8. Authentication changes

Retain company-scoped authorization, hashed credentials, active-driver checks, and credential-version session invalidation. Add expiring, single-use driver invitations so managers do not distribute permanent plaintext credentials. Add a revocable authorized-device record; authorizing a replacement device invalidates the prior device session. Drivers must retain a secure recovery/transfer path through a manager. Do not store plaintext passwords, PINs, invite tokens, or device tokens.

## 9. Billing changes

Keep current payment infrastructure but create a separate idempotent driver-month ledger keyed by company, driver, and calendar month. First activation or reactivation in a month creates one $5 liability; deactivation ends access but does not reverse that month; later same-month reactivation does not duplicate it; an inactive driver is not charged in future months. Payment-provider charging and production rollout require separate release configuration and are not performed here.

## 10. Analytics

Record total questions, questions per active driver, category, response mode, successful canonical match, clarification, no-answer escalation, feedback, retrieval candidates, response latency, canonical record/version/status, source IDs, and adjudication ID. V1 exposes a small internal manager/activity view rather than a broad customer dashboard. Feedback never edits or republishes knowledge automatically.

## 11. Security considerations

- Enforce authentication, role checks, company isolation, RLS, active-driver state, rate limits, and server-side canonical eligibility.
- Treat user text as untrusted data. Prompts such as “ignore your instructions” cannot change retrieval policy or enable general-knowledge fallback.
- Return concise operational content without exposing archived source files or internal review notes.
- Minimize PII and audio collection, redact sensitive logs, protect billing webhooks, hash credentials/tokens, and make session/device revocation immediate.
- Preserve auditable answer snapshots and canonical traces without allowing clients to choose arbitrary knowledge IDs as authority.

## 12. Major risks and unknowns

- Phase 1 still has deferred source acquisitions and human questions; affected topics must continue to escalate.
- Native transcription quality in noisy delivery environments needs physical-device testing.
- Exact production payment-provider behavior and legal terms require credentials, business configuration, and attorney review before launch.
- One-device enforcement must distinguish legitimate replacement/recovery from sharing.
- Retrieval quality must be measured separately from answer rendering; a fluent answer from the wrong record is a failure.

## 13. Implementation sequence

1. Correct the canonical importer, database statuses, trace snapshots, and production retrieval gate.
2. Run corpus, importer, retrieval, status-boundary, conversation, and prompt-injection tests.
3. Complete invitation/device-session controls and their authorization tests.
4. Add the idempotent driver-month ledger and billing edge-case tests without issuing live charges.
5. Complete internal analytics and latency instrumentation.
6. Validate the driver speak/type flow locally and update the implementation/completion reports.
7. Preserve changes using the repository's existing version-control practice. Deployment, production configuration, and EAS builds remain excluded.

## Launch gates

- All definitive answers come only from publication-ready `SOURCE_VERIFIED` or `READY_ROUTE_APPROVED` canonical versions.
- Active Ready Route adjudications take precedence and remain traceable to their evidence.
- Phase 1 evaluation cases pass the production eligibility policy with zero unsafe-answer gating failures.
- Cross-company access, injection attempts, inactive accounts, and superseded/noneligible records cannot produce unauthorized output.
- Billing idempotency and device replacement/revocation tests pass.
- Legal, privacy, source-retention, transcription, and payment-provider review are completed before commercial launch.
