const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { createCliFedexFccAdapter } = require('../services/fccDownloader');
const { createFccProgressSyncService } = require('../services/fccProgressSync');
const { createFedexSyncService } = require('../services/fedexSync');
const { createManifestIngestService } = require('../services/manifestIngest');

function getWorkerSecret(options = {}) {
  return String(options.workerSecret || process.env.FEDEX_SYNC_WORKER_SECRET || '').trim();
}

function getLifecycleWorkerSecret(options = {}) {
  return String(
    options.accountLifecycleWorkerSecret ||
    process.env.READYROUTE_INTERNAL_WORKER_SECRET ||
    options.workerSecret ||
    process.env.FEDEX_SYNC_WORKER_SECRET ||
    ''
  ).trim();
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

  router.post('/account-retention-sweep', async (req, res) => {
    const workerSecret = getLifecycleWorkerSecret(options);

    if (!workerSecret) {
      return res.status(503).json({ error: 'Account lifecycle worker endpoint is not configured.' });
    }

    if (getProvidedSecret(req) !== workerSecret) {
      return res.status(403).json({ error: 'Invalid account lifecycle worker secret.' });
    }

    try {
      const nowIso = now().toISOString();
      const { data: accounts, error: accountsError } = await supabase
        .from('accounts')
        .select('id, account_status, service_ends_at, retention_ends_at')
        .in('account_status', ['canceling', 'retained']);

      if (accountsError) {
        throw accountsError;
      }

      const transitionedAccountIds = [];
      const purgeEligibleAccountIds = [];

      for (const account of accounts || []) {
        const serviceEnded = account.service_ends_at && new Date(account.service_ends_at).getTime() <= new Date(nowIso).getTime();
        const retentionEnded = account.retention_ends_at && new Date(account.retention_ends_at).getTime() <= new Date(nowIso).getTime();

        if (account.account_status === 'canceling' && serviceEnded) {
          const { error: updateError } = await supabase
            .from('accounts')
            .update({ account_status: 'retained', canceled_at: nowIso })
            .eq('id', account.id);

          if (updateError) {
            throw updateError;
          }

          const { error: eventError } = await supabase
            .from('account_cancellation_events')
            .insert({
              account_id: account.id,
              event_type: 'retained',
              metadata: { transitioned_at: nowIso }
            });

          if (eventError) {
            console.error('Account retained event write failed:', eventError);
          }

          transitionedAccountIds.push(account.id);
        }

        if (retentionEnded) {
          purgeEligibleAccountIds.push(account.id);
        }
      }

      return res.status(200).json({
        checked_at: nowIso,
        transitioned_to_retained: transitionedAccountIds.length,
        transition_account_ids: transitionedAccountIds,
        purge_eligible: purgeEligibleAccountIds.length,
        purge_eligible_account_ids: purgeEligibleAccountIds,
        automatic_purge_enabled: false
      });
    } catch (error) {
      console.error('Account retention sweep failed:', error);
      return res.status(500).json({ error: 'Account retention sweep failed.' });
    }
  });

  return router;
}

module.exports = {
  createInternalSyncRouter,
  getLifecycleWorkerSecret,
  getProvidedSecret,
  parseAccountIds
};
