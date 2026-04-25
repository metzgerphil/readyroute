#!/usr/bin/env node

const supabase = require('../lib/supabase');
const { createCliFedexFccAdapter } = require('../services/fccDownloader');
const { createFccProgressSyncService } = require('../services/fccProgressSync');
const { createFedexSyncService } = require('../services/fedexSync');
const { createManifestIngestService } = require('../services/manifestIngest');

function getSyncMode() {
  const mode = String(process.env.FEDEX_SYNC_MODE || 'both').trim().toLowerCase();
  if (['auto', 'both', 'manifests', 'progress'].includes(mode)) {
    return mode;
  }

  throw new Error('FEDEX_SYNC_MODE must be one of: auto, both, manifests, progress');
}

async function main() {
  const service = createFedexSyncService({
    supabase,
    adapter: createCliFedexFccAdapter(),
    manifestIngestService: createManifestIngestService({ supabase }),
    fccProgressSyncService: createFccProgressSyncService({ supabase })
  });
  const mode = getSyncMode();
  const summary = {
    mode,
    auto: null,
    manifests: null,
    progress: null
  };

  if (mode === 'auto') {
    summary.auto = await service.runScheduledAutomationCycle();
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (mode === 'both' || mode === 'manifests') {
    summary.manifests = await service.runScheduledSync();
  }

  if (mode === 'both' || mode === 'progress') {
    summary.progress = await service.runScheduledProgressSync();
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error('FedEx sync worker failed:', error);
  process.exitCode = 1;
});
