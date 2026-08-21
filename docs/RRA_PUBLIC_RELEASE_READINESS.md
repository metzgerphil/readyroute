# ReadyRoute Answers public release readiness

Status: implementation started August 16, 2026. This package is scoped to the RRA-only public iOS app. Other ReadyRoute features remain excluded from the production build.

## Implemented in the repository

- Production App Store build profile uses `https://api.readyroute.org` and `EXPO_PUBLIC_DRIVER_HELP_ONLY=true`.
- First-use OpenAI disclosure with an explicit allow/decline choice.
- Server-side consent enforcement. Declining blocks new OpenAI processing while deterministic and learned routes remain available.
- Common email, phone, address, URL, and long identifier redaction before OpenAI processing.
- In-app access to Privacy & AI settings and the web account-deletion flow.
- Authenticated driver account-deletion request and cancellation page, with a 30-day completion window.
- Automated 90-day raw-content cleanup, 24-month metric cleanup, and due account-deletion processing.
- RRA-specific public privacy and terms drafts.

## App Store listing draft

**Name:** ReadyRoute

**Subtitle:** Verified answers for drivers

**Promotional text:** Get concise answers grounded in ReadyRoute-approved operating procedures, with clear steps, conditions, and escalation when a verified answer is not available.

**Description:**

ReadyRoute Answers gives authorized drivers quick access to operational-reference answers approved for ReadyRoute. Ask a question by voice or text, review the concise answer, and open additional conditions or details when needed.

ReadyRoute Answers supports trained drivers. It does not replace required training, manager or station direction, safety rules, applicable law, or emergency services. Access requires authorization from a participating company.

Features:

- Ask operational questions by voice or text
- Answers grounded in ReadyRoute-approved procedures
- Conditions, exceptions, and additional detail when available
- Clear escalation when ReadyRoute does not have a verified answer
- Private, authenticated access for authorized drivers

**Keywords:** driver,delivery,operations,procedure,reference,route,safety,training,support

**Support URL:** `https://readyroute.org/support.html`

**Marketing URL:** `https://readyroute.org/`

**Privacy URL:** `https://readyroute.org/privacy.html`

**Account deletion URL:** `https://readyroute.org/account.html`

**Primary category:** Business

**Secondary category:** Productivity

**Copyright:** 2026 ReadyRoute

## Screenshot plan

Do not use the existing dispatch, map, fleet, or manager screenshots for this release. Capture new screenshots from the production RRA-only build:

1. RRA home with voice and text question options.
2. A concise verified answer with no customer or package data.
3. A clarification screen showing how RRA asks for a necessary detail.
4. The More Info view showing conditions and exceptions.
5. Privacy & AI choice or account menu, without identifying user data.

Capture at least the current required iPhone display sizes in App Store Connect. Add iPad screenshots only if the app remains available for iPad at submission time.

## App privacy working answers

Confirm these in App Store Connect against the final production behavior. Do not submit until the answers match the shipped build.

- Contact info: email and name, linked to the user, used for app functionality and account management.
- User content: questions and feedback, linked to the user internally, used for app functionality and product improvement.
- Identifiers: user/account identifiers, linked to the user, used for authentication and app functionality.
- Usage data: product interaction and diagnostics, linked to the company or user internally, used for analytics, reliability, and improvement.
- Data used for tracking: none, assuming no advertising or cross-company tracking SDK is added.
- Third-party AI: disclose OpenAI processing in the privacy policy and first-use consent screen.

## App Review notes draft

ReadyRoute is an authenticated operational-reference app for drivers authorized by participating companies. This submission intentionally contains only ReadyRoute Answers. It does not expose dispatch, route management, mapping, fleet, or manager features.

The app checks approved ReadyRoute records. OpenAI may be used only to interpret the wording of a question after explicit user permission; it does not create the operational procedure. Users may decline and continue with non-AI matching. Common personal and package identifiers are redacted before approved AI processing.

Provide App Review with a stable demo driver account and keep the production API and demo data available throughout review.

**Review username:** `[CREATE BEFORE SUBMISSION]`

**Review password:** `[CREATE BEFORE SUBMISSION]`

**Review contact:** `info@readyroute.org`

## Required operational setup before submission

1. Apply migration `20260816231000_rra_public_privacy.sql` to production Supabase.
2. Deploy the backend and landing-page changes.
3. Schedule `npm run privacy:maintain` in the backend once each day and alert on failure.
4. Test consent allow, decline, and withdrawal with a real authorized driver account.
5. Test account-deletion request and cancellation at `readyroute.org/account.html`.
6. Owner approved the privacy policy and terms for release on August 16, 2026; no additional legal-review gate is planned.
7. Create a dedicated App Review account with safe demonstration questions and no real customer data.
8. Capture RRA-only screenshots from the exact release build.
9. Complete App Privacy, age rating, content rights, pricing, and availability in App Store Connect.
10. Run the release checks, upload the production build, add review notes, and submit.

## Release commands

From `driver-app`:

```sh
npm run check:appstore
npm test
npx eas-cli build --platform ios --profile production
npx eas-cli submit --platform ios --profile production
```

Submission is a deliberate owner action after the production migration, deployments, legal review, demo login, and screenshots are complete.
