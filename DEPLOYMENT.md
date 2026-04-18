# ReadyRoute Deployment Checklist

## Railway Environment Variables

Set these in the Railway backend service before the first deploy:

- `PORT`
- `NODE_ENV=production`
- `VITE_MANAGER_PORTAL_URL=https://manager.readyroute.app`
- `APP_TIME_ZONE=America/Los_Angeles`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID`
- `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`
- `GOOGLE_APPLICATION_CREDENTIALS` (optional alternative to `GOOGLE_SERVICE_ACCOUNT_KEY_PATH`)
- `GOOGLE_CLOUD_PROJECT` or `GOOGLE_PROJECT_ID` (optional fallback for route optimization)
- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Database migration steps to keep production auth current:

1. Run `/Users/phillipmetzger/readyroute/backend/src/scripts/fx12_manager_users.sql`
2. Run `/Users/phillipmetzger/readyroute/backend/src/scripts/fx13_manager_user_invites.sql`
3. `fx12` creates `manager_users`
4. `fx12` also backfills existing legacy `accounts.manager_email` logins into the new table
5. `fx13` enables pending invites so additional managers can set their own password from an invite link

To add an additional manager under an existing account after the migrations:

- Preferred flow: use the Manager Portal `Drivers` page → `Manager Access`
- That flow emails a self-serve invite so the manager can set their own password
- If `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are not set yet, the portal falls back to showing the invite link manually

Legacy terminal fallback:

```bash
cd /Users/phillipmetzger/readyroute/backend
npm run seed:manager
```

Recommended frontend environment values:

- Driver app: `EXPO_PUBLIC_API_URL=https://api.readyroute.app`
- Manager portal: `VITE_API_URL=https://api.readyroute.app`
- Manager portal: `VITE_GOOGLE_MAPS_KEY=<your_google_maps_browser_key>`
- Driver app: `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=<your_google_maps_mobile_key>`

## Railway + GitHub Setup

1. Push the latest `readyroute` repo to GitHub.
2. In Railway, create a new project and choose `Deploy from GitHub repo`.
3. Select the repository and point the service root to `/backend`.
4. Confirm Railway detects the start command from `Procfile` as `web: node src/index.js`.
5. Add the environment variables above in the Railway service settings.
6. Trigger the first deploy and confirm the deploy logs show the app listening on Railway's assigned port.
7. Verify `https://<railway-generated-domain>/health` returns `{"status":"ok",...}`.

## Custom Domain Setup

1. In Railway, open the backend service and add a custom domain such as `api.readyroute.app`.
2. Copy the DNS target Railway provides.
3. In your DNS provider, create the required `CNAME` or `ALIAS/ANAME` record for `api.readyroute.app`.
4. Wait for Railway TLS issuance to complete.
5. Re-test `https://api.readyroute.app/health`.
6. Update frontend env values so both apps point at `https://api.readyroute.app`.

## Supabase RLS Policies To Verify

ReadyRoute currently uses the Supabase service-role key from the backend, so client apps should not access operational tables directly. Verify these protections are active:

- RLS is enabled on `accounts`
- RLS is enabled on `drivers`
- RLS is enabled on `vehicles`
- RLS is enabled on `routes`
- RLS is enabled on `stops`
- RLS is enabled on `packages`
- RLS is enabled on `driver_positions`
- RLS is enabled on `timecards`
- RLS is enabled on `road_rules`
- RLS is enabled on `stop_notes`
- `anon` has no direct read/write policy on operational tables
- `authenticated` has no direct read/write policy on operational tables unless explicitly required for an admin tool
- Storage bucket `pod-photos` only allows access patterns you intend to support in production

## Stripe Webhook

Register this production webhook URL in Stripe after the custom domain is live:

- `https://yourdomain.com/billing/webhook`

For ReadyRoute production, that should become:

- `https://api.readyroute.app/billing/webhook`
