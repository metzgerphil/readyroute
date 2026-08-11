# Ready Route TestFlight preparation report

Status date: 2026-08-10.

## Outcome

The Ready Route driver assistant is prepared at the repository and iOS-export layer for a help-only TestFlight build. The approved visual states are implemented and the build profile is internally consistent. No EAS build, App Store Connect upload, deployment, database mutation, or live-user action was performed.

This preparation does not change the Phase 3 pilot decision from `NOT_READY`. Physical-device, external-service, dependency, governance, and legal gates remain.

## Implemented interface

- Simple voice-or-text home with no route tools, code browser, categories, recents, or bottom navigation.
- Upper-right account access.
- Original driver question displayed on every result state.
- Verified procedure card with numbered immediate steps, optional More Info, canonical trace state, feedback, follow-up, and a new-question action.
- One-detail clarification card with large choices, free-text follow-up, and a safe “Not sure” path.
- Verified-answer-unavailable card with the canonical escalation message and an explicit refusal to guess.

## TestFlight configuration

- EAS profile: `testflight`.
- Distribution: App Store/TestFlight (`store`).
- iOS bundle identifier: `com.readyroute.driverapp`.
- Expo project ID: `3de49618-8973-4330-b335-f2901d75ac46`.
- App Store Connect app ID: `6762488881`.
- Build number: remote source with automatic increment.
- Application mode: `EXPO_PUBLIC_DRIVER_HELP_ONLY=true`.
- API target: `https://readyroute-api-staging-201632321692.us-west1.run.app`.
- Help-only permissions: secure storage, microphone, and speech recognition. Route location, background location, photo-library access, and Google Maps configuration are omitted.

The TestFlight export wrapper reads the EAS profile directly, clears Metro's cache, exports the production-mode iOS bundle, and fails if the compiled Hermes bundle does not contain the profile API URL.

## Verification completed

- Driver app: 29/29 suites and 227/227 tests passed.
- Help-only TestFlight configuration audit: passed.
- Clean production-mode iOS Hermes export: passed.
- Compiled TestFlight API target check: passed.
- Research knowledge validation: 144 operational records and 57 reference definitions passed.
- Full corpus integrity: passed for 123 primary sources and the restored archive.
- Canonical release: 97/97 operational records publication-ready; 49 verified reference definitions remain independently answer-eligible.
- Maintained retrieval: 192/192 top-1, top-5, and response-mode matches; zero unsafe answer-gating failures.
- Independent candidate retrieval: 69/69; zero unsafe answer-gating failures.
- Phase 2 holdout: 12/12.
- Phase 3 adversarial suite: 1,244/1,244; zero failures.
- Traceability audit: passed for all 97 publication-ready records, all seven approvals, and all 27 direct-answer cases.
- Backend portable unit suite: 433 passed, eight intentionally skipped, zero failed.

The backend live end-to-end test was not counted as a software failure: it was invoked with the inert unit-test Supabase URL and correctly could not connect. It still requires an authorized applied staging database and credentials.

## Remaining gates before an actual TestFlight pilot

1. Verify Apple/EAS signing credentials and App Store Connect access during the authorized EAS build.
2. Apply and verify the required migrations and canonical import against the intended staging backend; do not point the app at a backend that lacks the current driver-help release.
3. Complete an authenticated physical-iPhone walkthrough covering login, device authorization/replacement, microphone permission, speech recognition, clarification, verified answers, escalation, feedback, session persistence, and network failure.
4. Resolve or formally risk-review the 12 high-severity transitive Expo/Metro/React Native dependency advisories. The audit's suggested automatic fix is a breaking SDK downgrade and must not be applied blindly.
5. Complete production-like latency, logging/redaction, monitoring, incident ownership, and knowledge-review workflow verification.
6. Complete the outstanding billing-provider, privacy, retention, terms, liability, consent, and operational-data-rights decisions before a customer pilot.

## Authorized next command

Once the external gates and build authorization are satisfied:

```bash
cd driver-app
npm run release:prep:testflight
eas build --platform ios --profile testflight
eas submit --platform ios --profile testflight
```

The last two commands create and upload the build and were intentionally not run.
