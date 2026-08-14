# Driver Operational Help staging environment

> The earlier import counts below are retained as historical context. The grounded-AI staging release on 2026-08-13 imported the current canonical release: 150 indexed records and 103 publication-ready records.

## Identity

- Supabase project name: `Ready Route Solutions`
- Project reference: `xtzbjlmizmdfqelvhhwx`
- Region: `us-east-1`
- Environment: nonproduction staging
- Dashboard: `https://supabase.com/dashboard/project/xtzbjlmizmdfqelvhhwx`
- Staging API: `https://readyroute-api-staging-201632321692.us-west1.run.app`

Never substitute the production project reference `pdhnfbrsbpxkmetjkknb` in staging commands.

## Credential handling

The staging database password is stored in the macOS login keychain:

- account: `readyroute`
- service: `readyroute-supabase-staging-db`

The Supabase service-role key is retrieved from the authenticated CLI only for the lifetime of an import or smoke-test process. Neither credential belongs in Git or an application bundle.

## Applied schema

The empty staging project was initialized from:

1. `backend/schema.sql` as the current Ready Route baseline.
2. `supabase/migrations/20260809010000_driver_operational_help.sql` as the new feature migration.

The staging link was created in an isolated temporary Supabase work directory. The repository's existing Supabase link was left unchanged.

## Imported knowledge

- indexed records: 144
- published records: 74
- verified but withheld: 15
- knowledge sources: 40
- record-to-source evidence links: 351

All record statuses remain indexed so nonpublished knowledge can block unsafe fall-through. Only records passing operational-status, evidence-capture, and exact claim-trace gates are published.

## Smoke-test result

The staging database passed a disposable-account test covering:

- a published DSR record returning `ANSWER` and `KNO-DEL-SIG-DSR-001 v1`;
- ambiguous signature shorthand returning `CLARIFY`;
- a publication-gated badge scenario returning `ESCALATE`;
- interaction, feedback, and unanswered-question writes;
- cascade cleanup of the temporary account and driver.

## Persistent pilot integration

A persistent staging-only company, manager, and driver were also created. Their login secrets are held in the local macOS keychain and are not documented or committed in this repository.

The local backend and manager portal were run against staging successfully. The authenticated pilot driver produced `ANSWER`, `CLARIFY`, and `ESCALATE`; the manager Knowledge Activity screen displayed those interactions, the unanswered queue, feedback, and the exact `KNO-DEL-SIG-DSR-001 v1` trace.

## Hosted staging backend

- Google Cloud Run service: `readyroute-api-staging`
- Region: `us-west1`
- Current verified revision: `readyroute-api-staging-00002-9vv`
- Scaling: zero minimum instances, one maximum instance
- Runtime identity: the existing ReadyRoute API runtime service account
- Supabase and JWT credentials: separate staging-only Google Secret Manager secrets
- Billing mode: `shadow`
- FedEx/FCC automation: paused
- Public health check: schema compatible and launch ready

The hosted API passed staging driver login and HTTPS checks for `ANSWER`, `CLARIFY`, and `ESCALATE`, including the exact `KNO-DEL-SIG-DSR-001 v1` trace. It does not receive production traffic and does not connect to the production Supabase project.

The Expo driver bundle was configured for the secure staging URL during local testing through `EXPO_PUBLIC_API_URL`; no staging URL or secret was committed to the production mobile configuration. The refreshed app loaded and its login form was exercised using the simulator's real on-screen keyboard. Simulator Safari independently failed to resolve the Cloud Run hostname and displayed "server can't be found," while Cloud Run logs showed no incoming request. The final native walkthrough therefore requires a physical device or a simulator with functioning external DNS. The hosted API itself remains healthy and fully verified from the backend and manager-client paths.

## Grounded AI staging gate

The staging service enables grounded composition only through server-side Cloud Run configuration:

- `OPENAI_API_KEY` is injected from the staging-only Secret Manager secret `readyroute-staging-openai-api-key`.
- `READYROUTE_DRIVER_HELP_AI_ENABLED=true` applies only to `readyroute-api-staging`.
- `READYROUTE_DRIVER_HELP_MODEL=gpt-5.6-terra` uses the Responses API with strict structured output.
- Production and local defaults remain disabled.

Every staging release creates a disposable staging driver, signs in through the hosted API, and verifies two grounded direct answers, an ambiguity that remains `CLARIFY`, and an incomplete procedure that remains `ESCALATE`. The direct answers must expose selected-record and source-field traces. The disposable account and its interactions are deleted after the run. Provider errors, malformed output, unsupported codes/numbers, and invalid grounding are tested before deployment and must fall back to the deterministic canonical answer.

### Verified release — 2026-08-13

- Git commit: `8993d23e34b472b6b453381b50a1c8fda7b94d45`
- GitHub Actions run: `31756219279`
- Schema: required/current `20260811120000`, compatible
- Launch state: ready; billing shadowed; FCC automation paused
- Camera Scan answer: `GROUNDED_AI`, `KNO-FORGE-CAMERA-SCAN-001`, 4,643 ms
- Recorded-media answer: `GROUNDED_AI`, `KNO-COMMS-MEDIA-001`, 2,982 ms
- Ambiguous signature question: `CLARIFY`, deterministic, 1,021 ms
- Incomplete refusal procedure: `ESCALATE`, deterministic, 1,066 ms
- Disposable staging account: deleted by the smoke-test cleanup

The release gate also exposed and corrected two staging-test defects before passing: the disposable driver fixture now satisfies the applied legacy `pin` constraint, and client responses now return the exact canonical source fields used for grounded composition instead of keeping that trace only in the stored interaction.
