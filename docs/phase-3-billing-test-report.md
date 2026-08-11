# Phase 3 billing test report

Status: local shadow-ledger testing; live charging is disabled.

## Implemented semantics

- Price is exactly $5 USD per driver per UTC calendar month.
- Activation at any instant in a month creates the full-month liability; no proration.
- Deactivation ends access but does not void the accrued month.
- Repeated deactivation/reactivation in the same month cannot create another row because `(account_id, driver_id, billing_month)` is unique.
- The monthly active-driver job is repeatable and uses `ON CONFLICT DO NOTHING`.
- An inactive driver is omitted from later monthly accrual.
- Voided correction rows are excluded from summary totals.
- Provider invoice creation remains disconnected and `live_charging_enabled` remains false.

## Automated coverage

Pure service tests cover zero drivers, one and multiple drivers, first/final instant behavior, exact UTC transition, full-month price, deactivated-current-month retention, voided correction exclusion, same-month idempotency, subsequent-month identity, invalid dates, and missing account/driver identity.

The database integration script covers initial activation, same-day and repeated reactivation, duplicate monthly job execution, next-month accrual, inactive later-month exclusion, unique ledger enforcement, and denial of client access to billing rows/functions. The Phase 2 applied run passed the original idempotency/isolation set. The expanded duplicate-job/inactive-later-month assertions still require a fresh applied run because the local Docker engine stopped responding while the isolated database was being restarted; the pure billing suite remains green.

## Provider-blocked scenarios

Failed payment, expired payment method, subscription cancellation/reactivation, provider webhook retry, invoice retry, and provider idempotency cannot be truthfully completed until payment-provider configuration and rollout authority exist. These remain release blockers; they are not simulated as proof of Stripe behavior.

## Policy item

UTC is the implemented V1 month boundary. Changing the contractual billing timezone is a business-policy decision and requires migration/test updates before any commercial charging.
