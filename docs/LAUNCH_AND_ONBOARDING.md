# ReadyRoute Launch and Onboarding Map

Last checked: 2026-08-16

This is the plain-language map for getting ReadyRoute from a public website visit to an active company with managers and drivers.

## Where Each Page Lives

### Public website

| Page | Address | Purpose |
| --- | --- | --- |
| Home | `https://readyroute.org` | Explains ReadyRoute and sends companies to sign up. |
| Company signup | `https://readyroute.org/signup` | Collects company, primary manager, driver count, billing choice, and—when enabled—a Stripe payment method. |
| MVP information and feedback | `https://readyroute.org/mvp` | Longer product explanation, feedback form, and a second company-interest form. |
| About | `https://readyroute.org/about` | Company/product background. |
| Privacy | `https://readyroute.org/privacy` | Privacy policy. |
| Terms | `https://readyroute.org/terms` | Terms of service. |
| Support | `https://readyroute.org/support` | Public support information. |

### Company manager portal

| Page | Address | Purpose |
| --- | --- | --- |
| Manager login | `https://portal.readyroute.org/login` | Manager email and password login; includes manager password reset. |
| Manager invitation/password | Link sent by email | A single-use `/reset-password?...&mode=invite` link lets the first or additional manager choose a private password. |
| Company setup | `https://portal.readyroute.org/setup` | Checklist for manager access, driver access, drivers, vehicles, and the first route. |
| Drivers and manager access | `https://portal.readyroute.org/drivers` | Add/import drivers, invite drivers, resend invitations, reset driver passwords, and invite other managers. |
| Billing | `https://portal.readyroute.org/billing` | Shows the company billing state and controls available to the manager. |

### Driver access

| Page/app | Address | Purpose |
| --- | --- | --- |
| Driver invitation/password | Link sent by email | A single-use `https://portal.readyroute.org/driver-invite?...` link lets a driver choose a private password and optional username. |
| ReadyRoute mobile app | App Store/TestFlight/Android distribution | A driver signs in with their ReadyRoute email and password or an approved 4-digit PIN. |

### ReadyRoute staff

| Page | Address | Purpose |
| --- | --- | --- |
| Staff login | `https://portal.readyroute.org/readyroute/login` | Separate internal ReadyRoute staff sign-in. |
| Companies | `https://portal.readyroute.org/readyroute/companies` | Shows pending public signups, opens company accounts, sends/resends the first manager invitation, and reviews company usage. |
| Support | `https://portal.readyroute.org/readyroute/support` | Internal customer support queue. |

## Current Controlled-Onboarding Journey

1. A company submits `readyroute.org/signup`.
2. The request appears in **ReadyRoute Staff → Companies → New company signups**.
3. ReadyRoute staff reviews the request and selects **Review and onboard**.
4. Staff confirms the company and primary-manager details, then selects **Create and invite manager**.
5. The manager receives a single-use email link and chooses a password of at least 10 characters. ReadyRoute staff cannot see that password.
6. The manager signs in at `portal.readyroute.org/login` and follows the Company Setup checklist.
7. Under Drivers, the manager adds one driver or imports a list. Each driver needs a unique email for that company.
8. The manager sends each driver an invitation. The driver chooses a private password from the email link.
9. The driver installs the ReadyRoute app and signs in. The driver email/password flow and optional PIN flow are already implemented.
10. ReadyRoute runs the controlled field-validation checklist before treating the company as generally live.

## What Is Live and What Is Still Gated

Live now:

- Public website, signup, MVP, policies, and support pages.
- Manager portal login, password reset, company setup, manager invitations, driver creation/import, driver invitations, and driver password reset.
- Separate ReadyRoute staff login and company-account creation.
- Resend-based signup, manager-invite, driver-invite, and password-reset email code.
- Production API health and compatible production database schema.

Still intentionally gated:

- Public self-service company creation is disabled. A staff member approves and opens each account.
- Stripe signup, subscriptions, webhooks, and tax are not enabled in production. Production reports billing in shadow mode.
- FCC automation is paused; companies use the approved manual manifest path.
- General availability should wait for the controlled manager/driver device checks and a successful real route-day pilot in `PHASE1_FINAL_CHECKLIST.md`.
- Mobile distribution still needs a coordinated production build and App Store/TestFlight/Android release decision.

## Launch Order

1. Verify real signup and invitation emails from the production domain.
2. Onboard one controlled company through the staff signup queue.
3. Add two real drivers: one individually and one through import.
4. Confirm manager and driver password creation/reset on real devices.
5. Complete one real route-day pilot and record all failures or friction.
6. Decide whether billing will remain manual/shadow for the pilot or be activated after Stripe, webhook, tax, and approval checks.
7. Release the mobile app to the selected audience.
8. Only after those checks, decide whether to enable public self-service workspace creation.

## Go-Live Rule

Do not confuse “the webpages are public” with “ReadyRoute is ready for unrestricted signup.” The safe near-term release is a controlled launch: anyone can request access, ReadyRoute approves the company, the manager and drivers create private passwords through emailed links, and the company completes a real route-day validation before broader rollout.
