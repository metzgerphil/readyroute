# ReadyRoute Deployment

ReadyRoute production is split across Vercel, Google Cloud Run, Supabase, and Resend. Local deploys are useful in an emergency, but production changes should still land through Git so the deployed source can be reproduced.

## Production Targets

- Landing page: `https://readyroute.org` on Vercel
- Manager portal: `https://portal.readyroute.org` on Vercel
- Backend API: `https://api.readyroute.org` on Google Cloud Run service `readyroute-api`
- Database/auth/data: Supabase
- Email: Resend

## Vercel Manager Portal

Configure the Vercel project with Git integration:

- Repository: `metzgerphil/readyroute`
- Root directory: `manager-portal`
- Production branch: `main`
- Build command: `npm run build`
- Output directory: `dist`
- Production environment variable: `VITE_API_URL=https://api.readyroute.org`
- Production domain: `portal.readyroute.org`

## Google Cloud Run Backend

Cloud Run service:

- Project ID: `ready-route-project`
- Region: `us-west1`
- Service: `readyroute-api`
- Public domain: `https://api.readyroute.org`
- Health endpoint: `/health`
- Runtime identity: `readyroute-api-runtime@ready-route-project.iam.gserviceaccount.com`

The API runtime identity is separate from the GitHub deployment identity and from the
default Compute Engine account. It has Secret Manager accessor only on
`RESEND_API_KEY`. The default Compute Engine account keeps `roles/run.builder` for
source builds and must not regain the project-wide Editor role.

Runtime secrets/config stay in Google Cloud, not in GitHub:

- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_ROUTE_OPTIMIZATION_PROJECT_ID`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- Stripe, Google, FedEx, and map provider secrets as needed

## RRA quality-first answer policy

Production backend releases enforce `READYROUTE_DRIVER_HELP_AI_INTERPRETATION_MODE=ACTIVE`
and use `gpt-5.6-luna` with medium reasoning effort to interpret every non-exact
free-form driver question. Luna may select only a locally shortlisted,
publication-ready record and an approved branch. Local validation rejects any
selection outside that bounded schema. A no-match or invalid response fails
closed; a provider failure receives one retry and then fails closed.

The approved canonical answer is rendered directly after selection. RRA does
not make a second AI call to compose answer prose, so the model cannot add or
change an operational step, code, warning, restriction, or escalation.

Answer Memory is analytics-only. It may collect repeated-wording and feedback
signals, but it cannot select, serve, or reuse an answer. The database reuse RPCs
raise an error if legacy code attempts to call them.

`scripts/release-backend.sh` blocks deployment unless unit tests, the canonical
knowledge release validator, the record-by-record gold gate, and the repeated
closed-loop stability gate all pass.

ReadyRoute staff accounts are provisioned by an authenticated staff owner or admin.
The original `/staff/bootstrap` endpoint is retired and no bootstrap secret should be
configured in Cloud Run.

Supabase Storage buckets containing operational files must remain private. The backend
uploads with the service role after ReadyRoute authorization and returns short-lived
signed URLs to authorized users. Do not store new public object URLs or mark these
buckets public: `driver-documents`, `vehicle-inspection-photos`, `pod-photos`, and
the retired legacy `signatures` bucket.

The API uses security headers, strict production CORS, bounded request parsing, and
tiered rate limits. Driver GPS posting remains every five seconds and has a separate
per-driver allowance of 30 updates per minute. Configure limits with the `RATE_LIMIT_*`
environment variables documented in `backend/.env.example`; do not apply the stricter
login or public-form limits to `/routes/position`.

## Release Flow

1. Open a pull request.
2. Backend CI, Portal CI, and Mobile CI must pass.
3. Merge to `main`.
4. Vercel deploys the web surfaces.
5. The production workflow applies migrations and deploys the merge commit to Cloud Run.
6. Production smoke runs against the deployed commit.

## Resend

Resend does not deploy code from GitHub. Keep it stable through configuration and smoke tests:

- DNS records live in Vercel DNS
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` live in Google Cloud Secret Manager / Cloud Run env
- Production smoke never sends password-reset email. Password recovery is covered by automated route tests so production checks do not contact real users.
