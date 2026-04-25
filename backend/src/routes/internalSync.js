const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { createCliFedexFccAdapter } = require('../services/fccDownloader');
const { createFccProgressSyncService } = require('../services/fccProgressSync');
const { createFedexSyncService } = require('../services/fedexSync');
const { createManifestIngestService } = require('../services/manifestIngest');

function getWorkerSecret(options = {}) {
  return String(options.workerSecret || process.env.FEDEX_SYNC_WORKER_SECRET || '').trim();
}

function getProvidedSecret(req) {
  const authorization = String(req.headers.authorization || '').trim();
  const bearerMatch = authorization.match(/^Bearer\s+(.+)$/i);

  return String(
    req.headers['x-readyroute-worker-secret'] ||
      (bearerMatch ? bearerMatch[1] : '') ||
      req.query?.secret ||
      ''
  ).trim();
}

function parseAccountIds(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry || '').trim()).filter(Boolean);
  }

  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getMode(req) {
  return String(req.body?.mode || req.query?.mode || 'auto').trim().toLowerCase();
}

function createInternalSyncRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const now = typeof options.now === 'function' ? options.now : () => new Date();
  const manifestIngestService =
    options.manifestIngestService ||
    createManifestIngestService({
      supabase,
      now
    });
  const fccProgressSyncService =
    options.fccProgressSyncService ||
    createFccProgressSyncService({
      supabase,
      now
    });
  const fedexSyncService =
    options.fedexSyncService ||
    createFedexSyncService({
      supabase,
      now,
      manifestIngestService,
      fccProgressSyncService,
      adapter: options.fedexFccAdapter || createCliFedexFccAdapter()
    });

  async function runSync(req, res) {
    const workerSecret = getWorkerSecret(options);

    if (!workerSecret) {
      return res.status(503).json({ error: 'FedEx sync worker endpoint is not configured.' });
    }

    if (getProvidedSecret(req) !== workerSecret) {
      return res.status(403).json({ error: 'Invalid FedEx sync worker secret.' });
    }

    const mode = getMode(req);
    const accountIds = parseAccountIds(req.body?.account_ids || req.query?.account_ids);

    try {
      if (mode === 'auto') {
        const result = await fedexSyncService.runScheduledAutomationCycle({
          accountIds: accountIds.length > 0 ? accountIds : null
        });
        return res.status(202).json({ mode, ...result });
      }

      if (mode === 'manifests') {
        const result = await fedexSyncService.runScheduledSync({
          accountIds: accountIds.length > 0 ? accountIds : null
        });
        return res.status(202).json({ mode, manifests: result });
      }

      if (mode === 'progress') {
        const result = await fedexSyncService.runScheduledProgressSync({
          accountIds: accountIds.length > 0 ? accountIds : null
        });
        return res.status(202).json({ mode, progress: result });
      }

      if (mode === 'both') {
        const manifests = await fedexSyncService.runScheduledSync({
          accountIds: accountIds.length > 0 ? accountIds : null
        });
        const progress = await fedexSyncService.runScheduledProgressSync({
          accountIds: accountIds.length > 0 ? accountIds : null
        });
        return res.status(202).json({ mode, manifests, progress });
      }

      return res.status(400).json({ error: 'mode must be one of: auto, manifests, progress, both' });
    } catch (error) {
      console.error('Internal FedEx sync worker failed:', error);
      return res.status(500).json({ error: 'FedEx sync worker failed' });
    }
  }

  router.post('/fedex-sync', runSync);
  router.get('/fedex-sync', runSync);

  return router;
}

module.exports = {
  createInternalSyncRouter,
  getProvidedSecret,
  parseAccountIds
};
