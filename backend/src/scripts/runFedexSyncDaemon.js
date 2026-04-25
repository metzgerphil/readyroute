#!/usr/bin/env node

require('dotenv').config();

const supabase = require('../lib/supabase');
const { createCliFedexFccAdapter } = require('../services/fccDownloader');
const { createFccProgressSyncService } = require('../services/fccProgressSync');
const { createFedexSyncService } = require('../services/fedexSync');
const { createManifestIngestService } = require('../services/manifestIngest');

function readIntervalMs(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function summarizeResult(label, result) {
  return {
    label,
    processed_accounts: Number(result?.processed_accounts || 0),
    eligible_accounts: Number(result?.eligible_accounts || 0),
    completed_runs: Number(result?.completed_runs || 0),
    changed_runs: Number(result?.changed_runs || 0),
    skipped_runs: Number(result?.skipped_runs || 0),
    failed_runs: Number(result?.failed_runs || 0)
  };
}

function createService() {
  return createFedexSyncService({
    supabase,
    adapter: createCliFedexFccAdapter(),
    manifestIngestService: createManifestIngestService({ supabase }),
    fccProgressSyncService: createFccProgressSyncService({ supabase })
  });
}

async function main() {
  const service = createService();
  const manifestIntervalMs = readIntervalMs('FEDEX_SYNC_MANIFEST_INTERVAL_MS', 5 * 60 * 1000);
  const progressIntervalMs = readIntervalMs('FEDEX_SYNC_PROGRESS_INTERVAL_MS', 90 * 1000);
  const tickIntervalMs = Math.min(
    readIntervalMs('FEDEX_SYNC_TICK_INTERVAL_MS', 15 * 1000),
    manifestIntervalMs,
    progressIntervalMs
  );
  let nextManifestAt = 0;
  let nextProgressAt = 0;
  let running = false;
  let stopped = false;

  console.log(JSON.stringify({
    message: 'FedEx sync daemon started.',
    manifest_interval_ms: manifestIntervalMs,
    progress_interval_ms: progressIntervalMs,
    tick_interval_ms: tickIntervalMs
  }));

  async function runDueWork() {
    if (running || stopped) {
      return;
    }

    const now = Date.now();
    const shouldRunManifests = now >= nextManifestAt;
    const shouldRunProgress = now >= nextProgressAt;

    if (!shouldRunManifests && !shouldRunProgress) {
      return;
    }

    running = true;

    try {
      if (shouldRunManifests) {
        nextManifestAt = Date.now() + manifestIntervalMs;
        const result = await service.runScheduledSync();
        console.log(JSON.stringify({
          ...summarizeResult('manifests', result),
          finished_at: new Date().toISOString()
        }));
      }

      if (shouldRunProgress) {
        nextProgressAt = Date.now() + progressIntervalMs;
        const result = await service.runScheduledProgressSync();
        console.log(JSON.stringify({
          ...summarizeResult('progress', result),
          finished_at: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error('FedEx sync daemon cycle failed:', error);
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    runDueWork().catch((error) => {
      console.error('FedEx sync daemon tick failed:', error);
    });
  }, tickIntervalMs);

  function shutdown(signal) {
    stopped = true;
    clearInterval(timer);
    console.log(JSON.stringify({
      message: 'FedEx sync daemon stopping.',
      signal,
      stopped_at: new Date().toISOString()
    }));
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  await runDueWork();
}

main().catch((error) => {
  console.error('FedEx sync daemon failed to start:', error);
  process.exitCode = 1;
});
