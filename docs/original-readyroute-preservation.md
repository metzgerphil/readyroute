# Original Ready Route Product Preservation

## Canonical restore point

The original, full Ready Route software product is preserved in the public GitHub repository:

- Repository: `https://github.com/metzgerphil/readyroute`
- Annotated tag and GitHub release: `readyroute-full-product-v1-2026-08-11`
- Commit: `ec9703e62797e125933a1f7334fd6d3e97200e92`
- Git tree: `c63f6b1e207c647d6a444986386a38f6e5ae0030`
- Snapshot date: 2026-08-11

The tag is the canonical source snapshot. Do not move, replace, or delete it. New answer-quality work must continue on a separate branch and must not redefine this tag.

## What the snapshot contains

The tagged source contains the complete product code and versioned configuration for:

- `readyroute.org` public website (`landing-page/`)
- `portal.readyroute.org` manager portal (`manager-portal/`)
- Ready Route driver application (`driver-app/`)
- `api.readyroute.org` backend (`backend/`)
- Supabase schema and migrations (`supabase/`)
- Google Cloud and deployment infrastructure (`infra/` and `.github/workflows/`)
- Operational knowledge and research assets (`knowledge/` and `research/`)
- Deployment, rollback, verification, and recovery instructions (`DEPLOYMENT.md`, `README.md`, and `docs/`)

Generated dependencies such as `node_modules/` are intentionally excluded; their lockfiles are included so dependencies can be restored.

## Production information and backups

Source control does not contain production secrets or live customer data. Those remain in their secured service accounts.

The production repository runs the `Backup Production Data` workflow daily. It creates and verifies:

- a Supabase public-schema dump;
- a Supabase data dump;
- a copy of private Supabase Storage objects;
- checksums; and
- a disposable database restore test.

Each successful backup is copied to the private Google Cloud Storage backup bucket. The GitHub copy is only a 14-day recovery copy and must not be treated as the long-term archive. The August 11, 2026 GitHub recovery artifact is named `readyroute-production-backup-2026-08-11T09-16-07Z`; its corresponding private Cloud Storage copy is the durable recovery source for that date.

Keep access to these external resources:

- GitHub repository `metzgerphil/readyroute`
- Name.com registration for `readyroute.org`
- Vercel team `phillovesjoy-9153s-projects`
- Vercel projects `landing-page` and `manager-portal`
- Google Cloud project `ready-route-project`
- Cloud Run service `readyroute-api` in `us-west1`
- the private Google Cloud Storage production-backup bucket
- the production Supabase project
- Stripe and Resend production configurations
- Apple/Expo credentials used to build and distribute the driver app
- ImproveMX and the Vercel DNS records for email delivery

Secret values must remain in the relevant secret managers or account vaults and must never be committed to Git.

## How to retrieve the original product

Clone the repository and check out the preservation tag:

```bash
git clone https://github.com/metzgerphil/readyroute.git
cd readyroute
git checkout readyroute-full-product-v1-2026-08-11
```

Confirm the exact restore point:

```bash
git rev-parse HEAD
git rev-parse 'HEAD^{tree}'
```

The expected values are the commit and tree hashes listed above. Follow the tagged `DEPLOYMENT.md` for builds, environment requirements, deployments, smoke tests, and rollback procedures.

## Preservation verification

At the time this record was created:

- `https://readyroute.org` returned HTTP 200;
- `https://portal.readyroute.org` returned HTTP 200;
- `https://api.readyroute.org/health` returned HTTP 200;
- the daily production backup workflow completed successfully on 2026-08-15 and restored the database into a disposable PostgreSQL service; and
- the production repository remained the source of truth for the original full product.

The live backend may run a newer commit. That does not change the preserved original-product tag.
