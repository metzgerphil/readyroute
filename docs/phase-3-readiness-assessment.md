# Phase 3 pilot readiness assessment

Assessment date: 2026-08-10.

## Decision: `NOT_READY`

The portable system is materially stronger, and every discovered critical software defect in the exercised lanes is fixed. Pilot readiness cannot yet be declared because required physical-device, production-like, payment-provider, and governance/legal gates remain unverified.

The 2026-08-10 TestFlight-preparation pass completed the approved driver result-state design and produced a validated help-only iOS export. This makes the repository build-ready at the code/configuration layer; it does not clear the remaining pilot gates below.

## Evidence now green

- Repository verification: 433 backend tests passed, 8 intentionally skipped, 0 failed; manager lint/build and 23/23 manager tests passed.
- Driver app: 29 suites and 227 tests passed; the approved home, verified-answer, clarification, and no-verified-answer states are implemented.
- The `testflight` profile passes an explicit release audit, uses `com.readyroute.driverapp`, store distribution, automatic build-number increments, App Store Connect app ID `6762488881`, and the help-only shell.
- The help-only TestFlight configuration requests speech/microphone access but omits unrelated route-location, background-location, photo-library, Maps-key, route-tool, and bottom-navigation requirements.
- A clean Hermes iOS export passed and the export guard verified that the compiled bundle targets `https://readyroute-api-staging-201632321692.us-west1.run.app`.
- Maintained retrieval: 192/192 top-1, top-5, and mode; zero unsafe-answer gating failures.
- Phase 2 holdout: 12/12.
- Phase 3 adversarial/context/status suite: 1,244/1,244, including 60 independently worded confusing-neighbor cases.
- Canonical reference-language runtime suite: 23/23; only verified definitions answer, and every answer preserves the workflow/authority boundary.
- Traceability: 97/97 publication-ready records, 7/7 approved adjudications, and 27/27 direct answers passed.
- Backend and manager production dependency audits: zero findings; tracked high-confidence secret scan: zero findings.
- Twenty-one defects were root-caused and fixed, including wrong-procedure, noneligible-neighbor, and status-code reference-boundary failures.

## Blockers before a limited pilot

1. Execute the physical iPhone/Android speech, secure-store, replacement-device, accessibility, and mobile-usability matrix.
2. Resolve the 12 high mobile dependency advisories through a reviewed compatible Expo/React Native toolchain update; do not apply the automated breaking downgrade blindly.
3. Run production-like end-to-end latency and network/service fault injection and verify proxy/crash-log redaction and operational alerting.
4. Complete the fresh applied database run for the expanded duplicate-billing-job and inactive-next-month assertions; then test payment-provider webhooks, retries, failure states, timezone boundaries, and idempotency in authorized test mode.
5. Run the governed end-to-end knowledge update/versioning rehearsal.
6. Obtain the required privacy, retention, terms, liability, consent, operational-data-rights, and payment-policy decisions from qualified humans.
7. Establish authorized staging, named incident-review ownership, and measured review capacity before choosing pilot cohort size.
8. Verify EAS/Apple signing credentials and App Store Connect access at build time; no EAS build or upload has been attempted in this workspace.

No deployment, EAS build, live billing action, or live customer mutation was performed.
