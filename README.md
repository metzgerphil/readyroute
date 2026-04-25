# readyroute

## Planning Docs

- [FCC dispatch sync plan](./FCC_DISPATCH_SYNC_PLAN.md)
- [FCC dispatch sync spec](./FCC_DISPATCH_SYNC_SPEC.md)

## FedEx FCC Sync Worker

ReadyRoute's backend has a continuous FCC sync daemon for production:

```bash
cd backend
npm run fedex:sync:daemon
```

The daemon runs manifest discovery every `FEDEX_SYNC_MANIFEST_INTERVAL_MS` and FCC scanner progress every `FEDEX_SYNC_PROGRESS_INTERVAL_MS`. Defaults:

- `FEDEX_SYNC_MANIFEST_INTERVAL_MS=300000` (5 minutes)
- `FEDEX_SYNC_PROGRESS_INTERVAL_MS=90000` (90 seconds)
- `FEDEX_SYNC_TICK_INTERVAL_MS=15000` (15 seconds)

On Railway, run this as a separate `worker` process from `backend/Procfile`. The web process still serves the API, and the worker process keeps FCC polling alive. Make sure the Railway `worker` process is scaled to 1 instance; the `web` process alone will not run the FCC daemon.

ReadyRoute also has one single-run worker entrypoint for manual checks:

```bash
cd backend
npm run fedex:sync
```

`FEDEX_SYNC_MODE` controls what the worker does:

- `both` runs morning manifest discovery/downloads and FCC completion progress checks. This is the default.
- `manifests` only pulls `.xls` and `.gpx` route manifests during each CSA's configured dispatch sync window.
- `progress` only checks FCC Combined Manifest progress and marks ReadyRoute stops complete when FCC shows completed green rows.

Recommended scheduler setup:

- Prefer the continuous daemon on a dedicated backend worker process.
- If the host cannot run a worker process, call `/internal/fedex-sync` from an external scheduler.
- Each CSA is evaluated in its own `operations_timezone`, so the worker should be scheduled often globally instead of assuming one national dispatch time.
- The backend `postinstall` step installs Chromium with Playwright so the daemon can run FCC automation in Railway/Linux.

Before enabling the worker against a live database, apply:

```text
backend/src/scripts/fx29_fedex_sync_live_schema_patch.sql
```

That patch catches the live database up to the manifest sync, FCC credential, sync run, route event, and FCC progress completion schema.
