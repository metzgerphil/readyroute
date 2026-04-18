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
   - `app.readyroute.app`
4. Follow Vercel's DNS instructions to create the required record in your DNS provider.
5. After the domain is active, verify the app loads and route refreshes work at `https://app.readyroute.app`.

## Notes

- The app uses React Router, so `vercel.json` includes a rewrite to `/index.html`.
- Make sure the backend CORS configuration allows the Vercel production origin and the custom domain before testing authenticated pages.
