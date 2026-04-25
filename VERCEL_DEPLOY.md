# ReadyRoute Manager Portal Vercel Deploy

## CLI Setup

1. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. From the repo root, run:
   ```bash
   vercel --cwd manager-portal
   ```
3. Follow the prompts to connect the project to your Vercel account.

## Environment Variables

Set these in the Vercel dashboard for the manager portal project:

- `VITE_API_URL=https://api.readyroute.app`
- `VITE_GOOGLE_MAPS_KEY=<your_production_browser_google_maps_key>`

If you use different preview values, add them for the Preview environment too.

## Custom Domain

1. Open the Vercel project dashboard.
2. Go to `Settings` -> `Domains`.
3. Add the custom domain:
   - `portal.readyroute.org`
4. In Netlify DNS for `readyroute.org`, create the DNS record Vercel shows for the subdomain.
5. Add/update the backend environment so auth links and CORS allow the portal domain:
   - `MANAGER_PORTAL_URL=https://portal.readyroute.org`
6. After the domain is active, verify the app loads and route refreshes work at `https://portal.readyroute.org`.

## Notes

- The app uses React Router, so `vercel.json` includes a rewrite to `/index.html`.
- Make sure the backend CORS configuration allows the Vercel production origin and the custom domain before testing authenticated pages.

## FCC Background Sync

Preferred production setup: run the backend `worker` process from `backend/Procfile` on Railway. The worker runs `npm run fedex:sync:daemon`, which keeps manifest discovery and FCC scanner progress polling alive automatically. In Railway, scale the `worker` process to 1 instance; keeping only the `web` process on will serve the API but will not poll FCC.

Set these backend environment variables:

- `FEDEX_SYNC_MANIFEST_INTERVAL_MS=300000`
- `FEDEX_SYNC_PROGRESS_INTERVAL_MS=90000`
- `FEDEX_SYNC_TICK_INTERVAL_MS=15000`

Set `FEDEX_SYNC_WORKER_SECRET` on the backend. Use a long random value and keep it out of the manager portal frontend.

The backend install step runs `playwright install --with-deps chromium` so the worker has a headless browser available in production.

If the host cannot run a continuous worker process, call this backend endpoint from an external scheduler. This is what ReadyRoute runs automatically; it is not something a manager should run by hand.

```bash
curl -X POST "https://api.readyroute.app/internal/fedex-sync" \
  -H "Authorization: Bearer $FEDEX_SYNC_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"mode":"auto"}'
```

`mode=auto` runs manifest discovery during each CSA account's active dispatch window and runs FCC progress sync so scanner-completed stops can flow into ReadyRoute. For tighter scanner-completion updates, schedule progress-only calls more frequently:

```bash
curl -X POST "https://api.readyroute.app/internal/fedex-sync" \
  -H "Authorization: Bearer $FEDEX_SYNC_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"mode":"progress"}'
```

Recommended cadence:

- `auto`: every 5 minutes from 6:00am-11:00am local operating coverage to discover and update newly plotted FCC routes.
- `progress`: every 60-90 seconds during active delivery hours so FedEx scanner-completed stops flow into ReadyRoute quickly.
- If your scheduler cannot run every 60-90 seconds, use the fastest reliable interval it supports and keep `progress` separate from `auto`.

FCC does not currently push scanner-completion events to this integration as webhooks. Until FedEx provides a CSA-accessible event feed/webhook, ReadyRoute should use frequent progress polling as the real-time bridge.
