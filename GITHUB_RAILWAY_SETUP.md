# GitHub + Railway Backend Setup

This is the long-term production flow for the ReadyRoute backend:

1. Push code to GitHub
2. GitHub Actions runs backend tests
3. Merge to `main`
4. Railway deploys the backend automatically from `main`

## What is already in the repo

- GitHub remote:
  - `https://github.com/metzgerphil/readyroute.git`
- Backend CI workflow:
  - `.github/workflows/backend-ci.yml`

The workflow runs when:
- a pull request changes backend files
- `main` receives backend changes

## One-time GitHub setup

### 1. Push the latest repo state

From the repo root:

```bash
git status
git add .
git commit -m "Add backend CI workflow"
git push origin main
```

If you prefer PRs first, push a branch and merge through GitHub instead of pushing directly to `main`.

### 2. Confirm GitHub Actions is enabled

In GitHub:

1. Open the repo:
   - `metzgerphil/readyroute`
2. Open the `Actions` tab
3. Confirm the `Backend CI` workflow appears
4. Let the workflow run once and confirm it passes

## One-time Railway setup

### 3. Connect Railway backend service to GitHub

In Railway:

1. Open the ReadyRoute backend service
2. Open the service settings/source settings
3. Connect the service to the GitHub repo:
   - `metzgerphil/readyroute`
4. Set the production branch to:
   - `main`

If Railway asks for a root directory, use the backend service root that matches the current live backend setup.

### 4. Verify backend runtime settings in Railway

Confirm these are already configured correctly in Railway:

- install command
- start command
- environment variables

Important environment variables live in Railway, not GitHub:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `JWT_SECRET`
- Stripe env vars
- Resend env vars
- any other backend secrets

### 5. Turn on automatic deploys

In Railway, make sure automatic deploys from the connected GitHub branch are enabled for the backend service.

## Recommended GitHub protection

### 6. Protect `main`

In GitHub repo settings:

1. Open `Settings`
2. Open `Branches`
3. Add a branch protection rule for `main`
4. Require:
   - pull request before merge
   - passing status checks before merge

Recommended required check:
- `Test Backend`

## How production should work after setup

Normal release flow:

1. create a branch
2. push branch to GitHub
3. open PR
4. GitHub Actions runs backend tests
5. merge PR to `main`
6. Railway auto-deploys backend
7. verify:
   - `https://readyroute-backend-production.up.railway.app/health`

## What this replaces

This should replace the habit of manually running:

```bash
npx @railway/cli login
npm run release:backend
```

Manual CLI deploys should become fallback only, not the normal production workflow.

## Suggested follow-up

Once GitHub and Railway are connected:

1. make one harmless backend change
2. push to a branch
3. open PR
4. confirm `Backend CI` passes
5. merge to `main`
6. confirm Railway deploys automatically
7. hit `/health` to verify the release is live
