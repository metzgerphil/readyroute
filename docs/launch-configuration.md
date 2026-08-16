# ReadyRoute Launch Configuration

The production backend reports launch modes and capability presence on `/health` without exposing secret values.

## Required Launch Gates

- `ROUTE_BILLING_MODE=shadow` until overage invoicing has completed live Stripe acceptance testing.
- `FEDEX_FCC_AUTOMATION_ENABLED=false` until ReadyRoute has approval to automate FCC.
- `GOOGLE_MAPS_API_KEY` must be present for manifest geocoding.
- Route Optimization uses the Cloud Run runtime service account through Google Application Default Credentials. No downloaded service-account JSON is required in production.
- `STRIPE_SECRET_KEY` may be configured during shadow mode, but no overage can be charged unless the account has current consent, staff explicitly enables billing, and the global live-billing approval gate is enabled.
- `READYROUTE_LIVE_BILLING_APPROVED=false` is the independent kill switch for first-time active-driver subscriptions. Set it to `true` only after Stripe products, webhooks, tax configuration, and a live acceptance test have been reviewed and the product owner explicitly approves charging.

Run `npm run check:launch` in `backend` before a production backend release. Run `npm run check:release` in `driver-app` before any TestFlight or App Store build.

## Real-Device Acceptance

Before launch, verify on a physical iPhone that push registration succeeds, a notification arrives in foreground and background, Always location permission is granted, route updates continue with the screen locked, and tracking stops after clock-out or route completion.
