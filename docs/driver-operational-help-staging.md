# Driver Operational Help staging environment

> Historical staging snapshot: the import counts below describe the last authorized staging import and were not changed during the 2026-08-10 local reconciliation. The current local canonical release contains 144 indexed and 97 publication-ready records. No staging deployment or import was performed in this pass.

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
