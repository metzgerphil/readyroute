# Approved knowledge restoration — September 6, 2026

The live comparison found six owner-approved topics stored in the database but unpublished and absent from the current canonical release. This change restores their preserved records, approval traces, source identities, change history, and driver-language cases without rewriting their operational instructions:

- Cargo stacking — `KNO-VEH-CARGO-STACKING-001`
- Heavy lifting — `KNO-SAFETY-HEAVY-LIFT-001`
- Extreme heat — `KNO-SAFETY-EXTREME-HEAT-001`
- Peak route overload — `KNO-ROUTE-PEAK-OVERLOAD-001`
- Parking tickets — `KNO-INCIDENT-PARKING-TICKET-001`
- Customer tips — `KNO-POLICY-CUSTOMER-TIP-001`

All 156 previously released operational records remain unchanged. The rebuilt release has 162 operational records, of which 157 are publication-ready, plus 63 code-reference records. Existing pending and withdrawn records remain ineligible.

The gate-code topic is deliberately excluded from this restoration. Its previous live version was already unpublished. Its original source and approval are preserved, but the overlap between the saved Code 007 and Code 001 rules needs owner clarification before it is activated. See [the partner review question](ready-route-gate-access-review-2026-09-06.md). The other Code 001 records retain their existing approved scopes; this release does not change routing behavior or claim to resolve that overlap.

## Protection against loss during import

Before uploading assets or writing any knowledge table, the importer reads the stored knowledge versions in ordered pages. It rejects an incoming release if a currently published topic is absent, or if an incoming topic is older than any stored version of that topic, including an unpublished version. It also rejects multiple incoming current versions of one topic. The omission check runs again before older publication flags are changed.

An intentional withdrawal must retain an explicit ineligible canonical record and its review history. A newer approved version can replace an older version; the old database row remains as unpublished history. Do not delete a topic from the release to withdraw it.

`knowledge:import:dry-run` validates and summarizes local release inputs. It does not compare with the live database. The live preflight runs during the actual import, before its first write. Imports still use the existing multi-step process; this guard does not make the entire import transactional or detect a content change that reuses the same version number.

The restoration is based on the protected September 6 baseline, reconciled candidate, and read-only live comparison held outside the application checkout. Private source captures remain in the preserved evidence area. The existing application checkout and unfinished mobile work are not part of this release.

The release must pass importer tests, backend tests, canonical validation, the gold gate, and the repeated stability gate. These checks validate the existing test coverage; they do not establish perfect accuracy for every driver phrasing. Previously identified negation and past-condition interpretation issues require separate work.
