# Phase 3 baseline

Originally frozen: 2026-08-10 before Phase 3 hardening changes. Reconciled on 2026-08-10 after completion of the mainstream Phase 1 release.

## Version control

- Original Phase 3 baseline commit: `bfd9a580e28e11303bd32c147e071b9cfaee33d5`
- Reconciliation base commit: `ae8b5a5` (`Close Phase 1 mainstream evidence gates`)
- The retrieval fixes and refreshed evidence in this report are preserved in the same checkpoint as this reconciled baseline.
- Branch: `codex/portable-knowledge-workspace`
- Worktree at freeze: clean

## Application and runtime

- Backend application: `1.0.0`, Node.js `v22.12.0`, Express 4, Supabase JS 2, Stripe 22.
- Driver application: `1.0.3`, Expo 54.0.36, React Native 0.81.5, React 19.1.0, native `expo-speech-recognition` 3.1.3.
- Manager portal: `0.0.0`, React 19.2.x, React Router 7.18.2, Vite 8.1.x.
- Required database schema: `20260810184000`.
- External generative model: none in V1.
- Speech architecture: device-native transcription; Ready Route does not retain raw audio.

## Canonical knowledge

- Schema version: `1.0.0`.
- Manifest generation time: `2026-08-11T03:00:09.576Z`.
- Canonical records: 144; every current record is version 1.
- Statuses: 90 `SOURCE_VERIFIED`, 7 `READY_ROUTE_APPROVED`, 27 `PENDING_REVIEW`, 20 `POTENTIALLY_OUTDATED`, 0 `INSUFFICIENT_EVIDENCE`.
- Publication-ready: 97; status-eligible but evidence-withheld: 0.
- Registered sources: 123; record/source links: 385; claim traces: 3,254.
- Active adjudications: 7.
- Canonical records checksum: `b4638b47a32cf8a2dbb4f16ef42448b55fa72b3119f08f1bb664a87d8b6b2932`.
- Evaluation checksum: `00e7943cccf8d7ef97d237110c79fce6d5ee926c4f2c3e31bb1444639bff24ef`.

## Baseline evaluations

- Maintained Phase 1 cases: 192/192 top-1, 192/192 top-5, 192/192 response-mode matches, 0 unsafe answer-gating failures.
- Phase 2 independent holdout: 12/12.
- Backend portable unit suite: 423 passed, 8 skipped, 0 failed.
- Applied local database SQL and authentication integration: passed.
- Driver app: 29 suites, 225 tests passed.
- Manager portal: lint and build passed; 23 tests passed.
- Portable and full source-archive knowledge validation: passed.
- Backend and portal production dependency audits: zero findings.
- Mobile production dependency audit: 12 high findings in the Expo/Metro/React Native toolchain; the automated recommendation is an unreviewed breaking downgrade and was not applied.

## Known limitations at freeze

- The owner-defined Phase 1 mainstream daily-driver milestone is complete. Deferred specialist and non-mainstream work remains status-gated and cannot independently answer drivers.
- Physical-device speech accuracy, noise behavior, microphone permissions, and end-to-end latency are unmeasured.
- No staging/production migration, canonical import, deployment, EAS build, or live billing occurred.
- Payment-provider behavior, billing timezone policy beyond the documented UTC V1 boundary, attorney review, production proxy/crash redaction, and retention approval remain external gates.
- Existing mobile test output includes non-failing `VirtualizedList` `act(...)` warnings.
- All canonical records currently use record version 1, so multi-version production behavior needs synthetic update testing.
