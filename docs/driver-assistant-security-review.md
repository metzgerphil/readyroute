# Driver Assistant security review

Status: local implementation review, 2026-08-10. This is not a penetration test or legal/privacy approval.

## Enforced controls

- Driver and manager APIs require signed role-specific tokens and account identifiers.
- Production middleware revalidates the current credential hash and active status, so password changes and deactivation end existing sessions.
- Official mobile driver logins require a stable device identifier in production. Only a SHA-256 device hash is retained; authorizing a replacement revokes the previous device authorization.
- Driver invitations expire after seven days, are single-use, and are invalidated by resend. Password reset links expire after 30 minutes and are bound to the current password version.
- Passwords use bcrypt and are never returned. Invite/reset URLs are returned only when configured email delivery is unavailable so a manager can transmit them through a secure channel.
- Driver Help status gating is deterministic and server-side. User instructions cannot enable general-model fallback or make noneligible knowledge answerable.
- Interaction records preserve the exact answer and canonical trace without returning archived source material to drivers.
- Driver Help and billing tables have RLS enabled; API reads and writes are account-scoped. Billing helper functions are not executable by anonymous or authenticated database roles.
- Existing API security middleware supplies bounded payloads, CORS policy, security headers, and login/request rate limits.
- Driver invite acceptance and manager-issued driver/manager invite or reset endpoints use a dedicated bounded rate limit. Identifiers and tokens are hashed into limiter keys and are not returned.
- Structured application request logs remove query strings and do not log request bodies or authorization headers. The proposed production retention/redaction boundary is documented in `docs/driver-assistant-data-retention.md`.
- Phase 2 tables explicitly grant access to the backend `service_role` while granting no client data access.

## Explicitly tested

- Inactive drivers and changed credentials invalidate sessions.
- Prompt-injection wording cannot enable general knowledge, noneligible records, or altered canonical answers.
- Manager Driver Help reads remain account-scoped.
- Same-month billing reactivation produces the same idempotency key; later months produce a different key.
- Driver device identifiers are validated and stored only as hashes.
- Applied-local-database tests cover two-company RLS, anonymous/authenticated denial, invite resend/replay/expiry, reset replay, cross-company token substitution, and immediate old-device rejection after replacement login.
- Production dependency audit is clear for the backend and manager portal after non-breaking lockfile updates.

## Remaining release checks

- Review whether returning a reset URL when email is unavailable is acceptable for commercial operation; production may instead need to fail closed.
- Confirm production proxy/crash logging follows the documented application redaction boundary, and approve the proposed retention periods before enabling purge automation.
- Resolve the 12 mobile production dependency findings through a reviewed Expo/React Native SDK upgrade; the available automated recommendation is a breaking downgrade and was not applied.
- Conduct physical-device privacy and microphone-permission review and a third-party review before enabling any external model or transcription provider.
- Complete attorney review of terms, privacy notice, liability language, operational-data rights, and user responsibilities.

## Release posture

The architecture fails closed at the canonical knowledge boundary and live driver-month charging remains disabled. Local database integration, cross-company isolation, device replacement, token replay, backend dependencies, and portal dependencies are verified. No production deployment should occur until mobile dependency, physical-device, production-observability, privacy/legal, and payment-provider reviews are complete.
