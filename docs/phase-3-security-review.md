# Phase 3 security review

Status: local application review and automated checks, 2026-08-10. Not a penetration test.

## Current findings

| Severity | Finding | Disposition |
| --- | --- | --- |
| High | Mobile production dependency graph reports 12 high advisories in Expo/Metro/React Native tooling. The automated remediation recommends a breaking downgrade. | Open release blocker. Resolve through a reviewed compatible SDK/toolchain update, then rerun mobile and native tests. |
| High | Production proxy, crash reporter, and infrastructure log redaction cannot be verified locally. | Open external configuration blocker. Application logs omit query strings, bodies, authorization headers, and raw device IDs. |
| High | Physical-device secure-store, reinstall/recovery, speech-permission, and replacement-device behavior is not yet exercised. | Open device blocker. Database/API revocation behavior passes locally. |
| Medium | Production fallback that returns a shareable reset URL when email delivery is unavailable needs an explicit commercial policy decision. | Open business/security review. Consider fail-closed production behavior. |
| Medium | Privacy/retention, terms, liability, consent, and operational-data rights require counsel. | Open legal blocker; engineering data map and proposed retention are documented. |

## Automated evidence

- Backend production dependency audit: 0 findings.
- Manager portal production dependency audit: 0 findings.
- Driver app production dependency audit: 12 high, 0 critical.
- High-confidence tracked-secret scan: 771 tracked files, 0 matching Stripe live keys, Supabase secret keys, AWS access keys, webhook secrets, or private-key blocks.
- API payload bounds, security headers, production CORS, login/invite/reset rate limits, and generic error responses have automated coverage.
- Password/reset/invite replay, credential-version invalidation, one-device replacement, and cross-company token substitution pass applied-local-database tests.
- Two-company RLS tests deny anonymous/authenticated direct reads of Phase 2 private tables and deny public billing-function execution.
- Prompt injection, forced-code output, protected-material requests, fake policy, and noneligible-answer attempts are included in the 1,184-case Phase 3 suite.
- Canonical answer traceability audit covers 97 publication-ready records, all 7 active approvals, and 27 direct-answer cases with zero failures.

## Configuration review still required

- Secret manager and production environment-variable access.
- TLS, reverse proxy, WAF/rate limiting, database network policy, backups, incident alerting, and audit-log access.
- Stripe webhook signatures and provider idempotency under real test-mode configuration.
- Email-provider domain, link lifetime, redirect allowlist, and abuse handling.
- App Store/Play privacy declarations and platform speech-processing disclosures.

No destructive security testing, live credential testing, deployment, or payment operation was performed.
