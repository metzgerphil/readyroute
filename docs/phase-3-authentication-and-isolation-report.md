# Phase 3 authentication, onboarding, and company-isolation report

Status: automated local database/API coverage complete; representative physical-device recovery remains open.

## Verified locally

- Passwords and legacy PINs are bcrypt hashes; plaintext permanent credentials are not stored or returned.
- Seven-day driver invites are bound to driver, company, email, and invite timestamp.
- Resending invalidates the prior invite; accepted and expired invites cannot be reused.
- Thirty-minute resets are bound to the current credential version and become invalid after use.
- Cross-company token substitution and mismatched email fail closed.
- Username uniqueness is case-insensitive within a company; the same username may exist in separate companies.
- Deactivation and credential changes invalidate existing credential-version sessions.
- A successful replacement-device login revokes the prior authorization; its token immediately fails server-side revalidation.
- Only a SHA-256 device identifier is stored.
- Login, invite, and reset routes have bounded rate limits with hashed identifiers.
- Two-company database tests deny authenticated and anonymous direct access to private device, billing, and canonical tables.
- Manager Driver Help activity is account-scoped.

## Remaining physical/UI checks

- Replace actual iPhone and Android devices and verify secure-store identity behavior across reinstall, restore, and device migration.
- Confirm the manager recovery path is understandable and does not expose a permanent password.
- Attempt UI/API object substitution throughout all manager driver, billing, analytics, and feedback screens in staging.
- Validate production email delivery, link routing, universal-link behavior, and inaccessible/expired-link UX.

