# Phase 3 controlled pilot plan

Current readiness assessment: `NOT_READY`.

The plan is prepared, but deployment is blocked by physical-device speech/usability testing, mobile dependency remediation, production observability/privacy/legal approval, payment-provider policy/configuration, and staging authorization.

## Pilot size rule

Begin with the smallest number of companies and drivers for which the assigned Ready Route reviewer can inspect every negative response, every no-answer result, every reported questionable answer, and a random sample of positive answers by the next business day. Do not set the count until named review/support capacity and expected daily question volume are known. Add participants only after the first cohort produces no unresolved critical incident for the agreed observation window.

## Duration and sequence

1. Staging rehearsal with internal test identities and seeded nonproduction billing.
2. Manager onboarding and explicit explanation that Ready Route is a reference for trained drivers and escalates gaps.
3. Driver onboarding, microphone/privacy explanation, account-sharing prohibition, and support path.
4. Limited live observation long enough to include ordinary delivery/pickup days and a month boundary if billing is in scope.
5. Scheduled incident review and knowledge/retrieval corrections through governance, never by silently editing production answers.
6. Formal stop/continue decision before adding any company or driver.

## Support and incident workflow

- A single monitored support intake identifies company, driver, time, interaction ID, urgency, and whether the driver acted on the answer.
- Preserve transcript, conversation context, candidates, selected canonical ID/version/status, sources/adjudication, exact response, feedback, latency, and application version.
- Classify with the Phase 3 failure taxonomy; immediately disable or publication-withhold an affected path when a critical unsafe behavior cannot be corrected at once.
- Operational conflicts go to authorized human adjudication. Engineering defects receive a root-cause fix and regression test.

## Success criteria

- Zero critical failures.
- Zero definitive answers from noneligible knowledge.
- Zero unsupported operational instructions in reviewed samples.
- Correct record/status/branch in the agreed human-reviewed sample.
- No cross-company, authentication, credential, or systematic billing incident.
- Latency and usability remain within thresholds established during pre-pilot physical-device testing.
- Every incident is reconstructable from stored trace data.

## Stop criteria

Stop or suspend the affected capability for any invented instruction, materially wrong procedure, approval override, company-data leak, authentication bypass, credential exposure, systematic billing error, missing trace, repeated high-impact transcription error without safe confirmation, or inability to review incidents at the promised cadence.

