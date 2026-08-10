# Driver Operational Help implementation status

Status date: 2026-08-09

## Implemented locally

- Operational Help is the driver's primary screen; the existing routing product remains available as Route Tools.
- Driver questions use an authenticated, account-scoped API with conversational session context.
- Runtime retrieval indexes the full corpus and deterministically limits answers to published records.
- Unverified, conflicting, outdated, review-required, or production-gated records act as blockers instead of falling through to an unrelated answer.
- Answer, minimum-clarification, and management-escalation modes are implemented.
- Every interaction stores the question, ranked candidates, selected knowledge IDs and versions, confidence, and the exact answer snapshot.
- Thumbs-up/down feedback and unanswered-question logging are implemented.
- Managers have a Knowledge Activity view for recent questions, result modes, record/version traces, unanswered questions, and negative feedback.
- Manager mobile previews are audited as manager activity and never impersonate a driver account.
- The importer retains real source titles, type, date/version, archive location, exact locator, and evidence note.

## Corpus publication result

- 144 records are indexed for classification and safe blocking.
- 89 records have operational status VERIFIED.
- 74 records currently pass every automated production publication gate.
- 15 VERIFIED records are withheld because evidence capture or exact claim-to-fragment allocation remains incomplete.
- 32 records remain HUMAN_REVIEW_REQUIRED, 21 POTENTIALLY_OUTDATED, and 2 CONFLICT.
- 351 record-to-source evidence links across 40 source IDs are prepared for import.

The importer does not silently convert VERIFIED into published. It stores the capture gate, trace gate, and explicit publication blockers for each record.

## Verification completed

- Backend unit suite after publication-gate hardening: 389 passed, 7 skipped, 0 failed.
- Driver app: 28 suites / 215 tests passed.
- Manager portal: 23 tests passed, lint passed, and production build completed.
- Production-gated language validation: 191/191 top-1 mappings, 191/191 response-mode matches, and 0 unsafe answer-gating failures.
- Knowledge dry run: 144 indexed, 74 published, 15 verified-but-withheld, 40 sources, 351 evidence links.
- Knowledge, reference-data, and full cross-file corpus-integrity validators pass.
- `git diff --check` passes.

The 191 cases are a curated conformance suite, not an independent real-driver holdout. A separate pilot/holdout set is still required before launch.

## Staging environment

- A separate free Supabase project named `Ready Route Solutions` was created in `us-east-1`.
- Staging project reference: `xtzbjlmizmdfqelvhhwx`.
- The complete Ready Route baseline and Operational Help migration were applied successfully.
- The gated corpus import completed: 144 indexed, 74 published, 15 verified-but-withheld, 40 sources, and 351 evidence links.
- An end-to-end disposable-account smoke test produced `ANSWER`, `CLARIFY`, and `ESCALATE` in the expected cases; record/version trace, feedback, interaction, and unanswered logging were verified, and the smoke account was removed.
- The staging database password is stored in the local macOS login keychain under service `readyroute-supabase-staging-db`; no credential was committed to the repository.
- The repository's Supabase CLI link remains the production project `pdhnfbrsbpxkmetjkknb`; staging operations use an isolated temporary CLI workspace.

## Local integration verification

- A persistent staging company, manager, and driver were created for UI testing. Login secrets are stored only in the local macOS keychain.
- The backend was run locally against the staging Supabase project with Stripe disabled. Health/schema compatibility and both manager and driver authentication passed.
- The authenticated driver API returned the expected three safety modes for the pilot account: `ANSWER` for "Direct signature nobody home," `CLARIFY` for "sig pkg nobody home," and `ESCALATE` for "lost badge can use helpers."
- The answer trace selected `KNO-DEL-SIG-DSR-001 v1`; positive feedback, clarification, escalation, and unanswered-question events were persisted.
- The local manager portal successfully signed in to the staging company and its Knowledge Activity page displayed the interaction totals, unanswered queue, feedback, and exact knowledge record/version trace.
- The native Expo driver app compiled and loaded in the iOS simulator. Login fields were exercised using the real simulator keyboard. The app now distinguishes transport failures from invalid credentials instead of presenting both as "Incorrect email or password."
- Login and password-reset requests now explicitly bypass stored-session token resolution because those endpoints are unauthenticated. The driver-app suite still passes: 28 suites / 215 tests.
- Expo Web is not currently a substitute for this test because the existing route-tools screen imports `react-native-maps`, which does not have a web implementation in the current project.

## Hosted staging verification

- A separate Cloud Run service named `readyroute-api-staging` was deployed in `us-west1` at `https://readyroute-api-staging-201632321692.us-west1.run.app`.
- The service is isolated from production data and uses staging-only Supabase and JWT secrets stored in Google Secret Manager.
- It scales from zero to a maximum of one instance, keeps route billing in shadow mode, and keeps FedEx/FCC automation paused.
- Hosted health reports the required schema as compatible and launch readiness as true.
- Hosted HTTPS smoke tests passed manager/driver authentication and the expected `ANSWER`, `CLARIFY`, and `ESCALATE` behavior; the approved answer retained its exact `KNO-DEL-SIG-DSR-001 v1` trace.
- The native staging bundle was loaded through Expo Go with the hosted API URL. Simulator Safari independently reported that the Cloud Run hostname could not be resolved ("server can't be found"), and Cloud Run received no request. This isolates the remaining native blocker to the simulator's DNS/network environment, not ReadyRoute authentication, knowledge retrieval, or Cloud Run health. The complete native walkthrough should be repeated on a physical device or a simulator with working external DNS.

## Deliberately not performed

- No production database migration or knowledge import has been applied.
- No production knowledge import has been run.
- No production backend, manager portal, TestFlight, or App Store deployment has been started. Only the isolated Cloud Run staging backend has been deployed.
- Existing Stripe route-count billing has not been changed.

## Remaining launch gates

1. Resolve or explicitly accept the 15 verified-but-withheld evidence/trace blockers; continue resolving the 32 human-review records without publishing them prematurely.
2. Create an independent, previously unseen driver-language holdout and run a controlled contractor pilot with daily unanswered/negative-feedback review.
3. Choose and approve a speech path. The current large Speak control invokes the device keyboard's built-in dictation; native in-app audio capture/transcription requires a provider, retention policy, consent copy, and privacy review.
4. Apply the database migration in a controlled environment, run the dry import, review its counts, then run the real import and smoke tests.
5. Design and implement the separate $5-per-active-driver calendar-month activation ledger. Do not repurpose the existing route-count Stripe billing.
6. Complete Terms of Service, liability, privacy, source-use, and third-party-processing review.
7. Approve staged deployment: internal environment, limited pilot accounts, then commercial release.

## Existing production capacity concern

The read-only Supabase audit on 2026-08-09 showed the existing production project at 0.518 GB in the organization Usage view against the Free Plan's 0.5 GB per-project allowance. The Infrastructure view simultaneously reported 493.7 MB of database objects, plus 224 MB WAL and 814.6 MB system usage; those panels use different measurements and may refresh on different schedules. The dashboard still labeled the organization as exceeding usage limits. This predates the staging import and was not changed during staging setup. Production should remain untouched until its size is analyzed with valid read-only database credentials and a safe retention/archive plan is approved.
