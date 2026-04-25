const DEFAULT_ROUTE_SYNC_SETTINGS = Object.freeze({
  operations_timezone: process.env.APP_TIME_ZONE || 'America/Los_Angeles',
  dispatch_window_start_hour: 6,
  dispatch_window_end_hour: 11,
  manifest_sync_interval_minutes: 15
});

function getCurrentDateString(now = new Date(), timeZone = process.env.APP_TIME_ZONE || 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function getTimeZoneDateParts(now, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    date: `${lookup.get('year')}-${lookup.get('month')}-${lookup.get('day')}`,
    hour: Number(lookup.get('hour'))
  };
}

function presentRouteSyncSettings(account, selectedDate, now = new Date()) {
  const operationsTimezone = account?.operations_timezone || DEFAULT_ROUTE_SYNC_SETTINGS.operations_timezone;
  const dispatchWindowStartHour = Number(account?.dispatch_window_start_hour ?? DEFAULT_ROUTE_SYNC_SETTINGS.dispatch_window_start_hour);
  const dispatchWindowEndHour = Number(account?.dispatch_window_end_hour ?? DEFAULT_ROUTE_SYNC_SETTINGS.dispatch_window_end_hour);
  const manifestSyncIntervalMinutes = Number(
    account?.manifest_sync_interval_minutes ?? DEFAULT_ROUTE_SYNC_SETTINGS.manifest_sync_interval_minutes
  );

  const localNow = getTimeZoneDateParts(now, operationsTimezone);
  let dispatchWindowState = 'scheduled';

  if (selectedDate < localNow.date) {
    dispatchWindowState = 'historical';
  } else if (selectedDate === localNow.date) {
    if (localNow.hour < dispatchWindowStartHour) {
      dispatchWindowState = 'before_window';
    } else if (localNow.hour >= dispatchWindowEndHour) {
      dispatchWindowState = 'after_window';
    } else {
      dispatchWindowState = 'active_window';
    }
  }

  return {
    operations_timezone: operationsTimezone,
    dispatch_window_start_hour: dispatchWindowStartHour,
    dispatch_window_end_hour: dispatchWindowEndHour,
    manifest_sync_interval_minutes: manifestSyncIntervalMinutes,
    local_today: localNow.date,
    dispatch_window_state: dispatchWindowState
  };
}

async function loadAccountForSync(supabase, accountId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, company_name, operations_timezone, dispatch_window_start_hour, dispatch_window_end_hour, manifest_sync_interval_minutes')
    .eq('id', accountId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function loadAccountsForScheduledSync(supabase, accountIds = null) {
  let query = supabase
    .from('accounts')
    .select('id, company_name, operations_timezone, dispatch_window_start_hour, dispatch_window_end_hour, manifest_sync_interval_minutes');

  if (Array.isArray(accountIds) && accountIds.length > 0) {
    query = query.in('id', accountIds);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data || [];
}

async function loadConnectedFedexAccount(supabase, accountId) {
  const { data, error } = await supabase
    .from('fedex_accounts')
    .select('id, nickname, account_number, connection_status, is_default, fcc_username, fcc_password_encrypted')
    .eq('account_id', accountId)
    .eq('connection_status', 'connected')
    .is('disconnected_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function loadFedexAccountForInboundDelivery(supabase, { connectionReference = null, accountNumber = null }) {
  let query = supabase
    .from('fedex_accounts')
    .select(
      'id, account_id, nickname, account_number, connection_status, is_default, connection_reference, disconnected_at'
    )
    .eq('connection_status', 'connected')
    .is('disconnected_at', null)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (connectionReference) {
    query = query.eq('connection_reference', connectionReference);
  } else if (accountNumber) {
    query = query.eq('account_number', accountNumber);
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function insertSyncRun(supabase, payload) {
  const { data, error } = await supabase
    .from('fedex_sync_runs')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function updateSyncRun(supabase, runId, payload) {
  const { data, error } = await supabase
    .from('fedex_sync_runs')
    .update(payload)
    .eq('id', runId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function buildSyncResponse({ triggerSource, run, backgroundSyncEnabled }) {
  return {
    message: run.summary || 'FedEx sync finished.',
    background_sync_enabled: backgroundSyncEnabled,
    sync_engine_status: run.run_status,
    trigger: triggerSource,
    run
  };
}

function createFedexSyncService(options = {}) {
  const { supabase, adapter = null, logger = console, manifestIngestService = null } = options;
  const fccProgressSyncService = options.fccProgressSyncService || null;
  const nowProvider = options.now || (() => new Date());

  if (!supabase) {
    throw new Error('createFedexSyncService requires a Supabase client');
  }

  async function executeSync({ account, triggerSource, managerUserId = null, workDate = null }) {
    const now = nowProvider();
    const resolvedWorkDate = workDate || getCurrentDateString(now, account.operations_timezone || DEFAULT_ROUTE_SYNC_SETTINGS.operations_timezone);
    const routeSyncSettings = presentRouteSyncSettings(account, resolvedWorkDate, now);
    const fedexAccount = await loadConnectedFedexAccount(supabase, account.id);

    let run = await insertSyncRun(supabase, {
      account_id: account.id,
      fedex_account_id: fedexAccount?.id || null,
      work_date: resolvedWorkDate,
      trigger_source: triggerSource,
      run_status: 'queued',
      sync_window_state: routeSyncSettings.dispatch_window_state,
      initiated_by_manager_user_id: managerUserId,
      details: {
        route_sync_settings: routeSyncSettings,
        adapter_configured: Boolean(adapter?.pullDailyManifests)
      }
    });

    run = await updateSyncRun(supabase, run.id, {
      run_status: 'running',
      started_at: now.toISOString()
    });

    if (!fedexAccount) {
      run = await updateSyncRun(supabase, run.id, {
        run_status: 'skipped',
        error_summary: 'No connected FedEx account configured.',
        details: {
          ...run.details,
          reason: 'no_connected_fedex_account',
          route_sync_settings: routeSyncSettings
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'No connected FedEx account configured.';
      return buildSyncResponse({
        triggerSource,
        run,
        backgroundSyncEnabled: false
      });
    }

    if (!fedexAccount.fcc_username || !fedexAccount.fcc_password_encrypted) {
      run = await updateSyncRun(supabase, run.id, {
        run_status: 'skipped',
        error_summary: 'FCC credentials are missing for the default FedEx account.',
        details: {
          ...run.details,
          reason: 'fcc_credentials_missing',
          route_sync_settings: routeSyncSettings,
          fedex_account_number: fedexAccount.account_number
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'Save the FCC username and password for the default FedEx account before syncing.';
      return buildSyncResponse({
        triggerSource,
        run,
        backgroundSyncEnabled: false
      });
    }

    if (typeof adapter?.pullDailyManifests !== 'function') {
      run = await updateSyncRun(supabase, run.id, {
        run_status: 'skipped',
        error_summary: 'FedEx sync adapter is not configured yet.',
        details: {
          ...run.details,
          reason: 'adapter_not_configured',
          route_sync_settings: routeSyncSettings,
          fedex_account_number: fedexAccount.account_number
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'FedEx sync worker is ready, but the FCC adapter is not configured yet.';
      return buildSyncResponse({
        triggerSource,
        run,
        backgroundSyncEnabled: false
      });
    }

    try {
      const adapterResult = await adapter.pullDailyManifests({
        account,
        fedexAccount,
        workDate: resolvedWorkDate,
        routeSyncSettings,
        triggerSource
      });

      let changedRouteCount = Number(adapterResult?.changed_route_count || 0);
      let ingestResults = [];
      let progressResult = null;

      if (Array.isArray(adapterResult?.manifest_pairs) && adapterResult.manifest_pairs.length > 0 && manifestIngestService) {
        ingestResults = await Promise.all(
          adapterResult.manifest_pairs.map((pair) =>
            manifestIngestService.stageManifestArtifacts({
              accountId: account.id,
              manifestFile: pair.manifest_file,
              companionGpxFile: pair.companion_gpx_file || null,
              requestedDriverId: pair.driver_id || null,
              requestedDriverName: pair.driver_name || null,
              requestedVehicleId: pair.vehicle_id || null,
              requestedDate: pair.date || resolvedWorkDate,
              requestedWorkAreaName: pair.work_area_name || null,
              source: 'fedex_sync',
              managerUserId
            })
          )
        );

        changedRouteCount = ingestResults.filter((result) => result.sync_state === 'staged_changed').length;
      }

      if (typeof adapter?.pullRouteProgress === 'function' && fccProgressSyncService) {
        const adapterProgressResult = await adapter.pullRouteProgress({
          account,
          fedexAccount,
          workDate: resolvedWorkDate,
          routeSyncSettings,
          triggerSource
        });

        progressResult = await fccProgressSyncService.applyRouteProgress({
          accountId: account.id,
          workDate: resolvedWorkDate,
          progressSnapshots: adapterProgressResult.progress_snapshots || [],
          managerUserId,
          source: 'fedex_progress_sync'
        });
      }

      const manifestCount = Number(adapterResult?.manifest_count || 0);
      const hasChanges = Boolean(adapterResult?.has_changes || changedRouteCount > 0 || progressResult?.has_changes);
      const runStatus = hasChanges ? 'completed_with_changes' : 'completed';

      run = await updateSyncRun(supabase, run.id, {
        run_status: runStatus,
        manifest_count: manifestCount,
        changed_route_count: changedRouteCount,
        details: {
          ...run.details,
          route_sync_settings: routeSyncSettings,
          adapter_result: adapterResult?.details || {},
          progress_result: progressResult || null,
          ingest_results: ingestResults.map((result) => ({
            route_id: result.route_id,
            total_stops: result.total_stops,
            sync_state: result.sync_state,
            merged_into_existing_route: result.merged_into_existing_route
          }))
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary = adapterResult?.summary || `FedEx sync completed for ${manifestCount} manifests.`;
      return buildSyncResponse({
        triggerSource,
        run,
        backgroundSyncEnabled: true
      });
    } catch (error) {
      logger.error('FedEx sync run failed:', error);

      run = await updateSyncRun(supabase, run.id, {
        run_status: 'failed',
        error_summary: String(error?.message || 'FedEx sync failed.'),
        details: {
          ...run.details,
          route_sync_settings: routeSyncSettings,
          reason: 'adapter_error'
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'FedEx sync failed.';
      return buildSyncResponse({
        triggerSource,
        run,
        backgroundSyncEnabled: true
      });
    }
  }

  async function executeProgressSync({ account, managerUserId = null, workDate = null }) {
    const now = nowProvider();
    const resolvedWorkDate = workDate || getCurrentDateString(now, account.operations_timezone || DEFAULT_ROUTE_SYNC_SETTINGS.operations_timezone);
    const routeSyncSettings = presentRouteSyncSettings(account, resolvedWorkDate, now);
    const fedexAccount = await loadConnectedFedexAccount(supabase, account.id);

    let run = await insertSyncRun(supabase, {
      account_id: account.id,
      fedex_account_id: fedexAccount?.id || null,
      work_date: resolvedWorkDate,
      trigger_source: 'progress_sync',
      run_status: 'queued',
      sync_window_state: routeSyncSettings.dispatch_window_state,
      initiated_by_manager_user_id: managerUserId,
      details: {
        route_sync_settings: routeSyncSettings,
        progress_only: true,
        adapter_configured: Boolean(adapter?.pullRouteProgress)
      }
    });

    run = await updateSyncRun(supabase, run.id, {
      run_status: 'running',
      started_at: now.toISOString()
    });

    if (!fedexAccount) {
      run = await updateSyncRun(supabase, run.id, {
        run_status: 'skipped',
        error_summary: 'No connected FedEx account configured.',
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'No connected FedEx account configured.';
      return buildSyncResponse({ triggerSource: 'progress_sync', run, backgroundSyncEnabled: false });
    }

    if (!fedexAccount.fcc_username || !fedexAccount.fcc_password_encrypted) {
      run = await updateSyncRun(supabase, run.id, {
        run_status: 'skipped',
        error_summary: 'FCC credentials are missing for the default FedEx account.',
        details: {
          ...run.details,
          reason: 'fcc_credentials_missing',
          route_sync_settings: routeSyncSettings,
          fedex_account_number: fedexAccount.account_number
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'Save the FCC username and password for the default FedEx account before syncing progress.';
      return buildSyncResponse({ triggerSource: 'progress_sync', run, backgroundSyncEnabled: false });
    }

    if (typeof adapter?.pullRouteProgress !== 'function' || !fccProgressSyncService) {
      run = await updateSyncRun(supabase, run.id, {
        run_status: 'skipped',
        error_summary: 'FedEx progress sync is not configured yet.',
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'FedEx progress sync worker is ready, but the FCC progress adapter is not configured yet.';
      return buildSyncResponse({ triggerSource: 'progress_sync', run, backgroundSyncEnabled: false });
    }

    try {
      const adapterProgressResult = await adapter.pullRouteProgress({
        account,
        fedexAccount,
        workDate: resolvedWorkDate,
        routeSyncSettings,
        triggerSource: 'progress_sync'
      });
      const progressResult = await fccProgressSyncService.applyRouteProgress({
        accountId: account.id,
        workDate: resolvedWorkDate,
        progressSnapshots: adapterProgressResult.progress_snapshots || [],
        managerUserId,
        source: 'fedex_progress_sync'
      });

      const runStatus = progressResult.has_changes ? 'completed_with_changes' : 'completed';
      run = await updateSyncRun(supabase, run.id, {
        run_status: runStatus,
        manifest_count: Number(adapterProgressResult.route_count || 0),
        changed_route_count: Number(progressResult.completed_updates || 0),
        details: {
          ...run.details,
          adapter_result: adapterProgressResult.details || {},
          progress_result: progressResult
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary =
        adapterProgressResult.summary ||
        `FCC progress synced for ${Number(adapterProgressResult.route_count || 0)} work areas.`;
      return buildSyncResponse({ triggerSource: 'progress_sync', run, backgroundSyncEnabled: true });
    } catch (error) {
      logger.error('FedEx progress sync run failed:', error);

      run = await updateSyncRun(supabase, run.id, {
        run_status: 'failed',
        error_summary: String(error?.message || 'FedEx progress sync failed.'),
        details: {
          ...run.details,
          route_sync_settings: routeSyncSettings,
          reason: 'adapter_error'
        },
        finished_at: nowProvider().toISOString()
      });

      run.summary = 'FedEx progress sync failed.';
      return buildSyncResponse({ triggerSource: 'progress_sync', run, backgroundSyncEnabled: true });
    }
  }

  return {
    async triggerManualSync({ accountId, managerUserId = null, workDate = null }) {
      const account = await loadAccountForSync(supabase, accountId);
      return executeSync({
        account,
        triggerSource: 'manual',
        managerUserId,
        workDate
      });
    },

    async syncRouteProgress({ accountId, managerUserId = null, workDate = null }) {
      const account = await loadAccountForSync(supabase, accountId);
      return executeProgressSync({ account, managerUserId, workDate });
    },

    async runScheduledSync({ accountIds = null } = {}) {
      const now = nowProvider();
      const accounts = await loadAccountsForScheduledSync(supabase, accountIds);
      const runs = [];
      let eligibleAccounts = 0;

      for (const account of accounts) {
        const routeSyncSettings = presentRouteSyncSettings(
          account,
          getCurrentDateString(now, account.operations_timezone || DEFAULT_ROUTE_SYNC_SETTINGS.operations_timezone),
          now
        );

        if (routeSyncSettings.dispatch_window_state !== 'active_window') {
          runs.push({
            account_id: account.id,
            company_name: account.company_name,
            work_date: routeSyncSettings.local_today,
            skipped: true,
            reason: 'outside_sync_window',
            sync_window_state: routeSyncSettings.dispatch_window_state
          });
          continue;
        }

        eligibleAccounts += 1;
        runs.push(
          await executeSync({
            account,
            triggerSource: 'scheduled',
            workDate: routeSyncSettings.local_today
          })
        );
      }

      return {
        trigger: 'scheduled',
        processed_accounts: accounts.length,
        eligible_accounts: eligibleAccounts,
        completed_runs: runs.filter((run) => run.run?.run_status === 'completed').length,
        changed_runs: runs.filter((run) => run.run?.run_status === 'completed_with_changes').length,
        skipped_runs: runs.filter((run) => run.run?.run_status === 'skipped' || run.skipped).length,
        failed_runs: runs.filter((run) => run.run?.run_status === 'failed').length,
        runs
      };
    },

    async runScheduledProgressSync({ accountIds = null } = {}) {
      const now = nowProvider();
      const accounts = await loadAccountsForScheduledSync(supabase, accountIds);
      const runs = [];

      for (const account of accounts) {
        const workDate = getCurrentDateString(
          now,
          account.operations_timezone || DEFAULT_ROUTE_SYNC_SETTINGS.operations_timezone
        );

        runs.push(
          await executeProgressSync({
            account,
            workDate
          })
        );
      }

      return {
        trigger: 'progress_sync',
        processed_accounts: accounts.length,
        eligible_accounts: accounts.length,
        completed_runs: runs.filter((run) => run.run?.run_status === 'completed').length,
        changed_runs: runs.filter((run) => run.run?.run_status === 'completed_with_changes').length,
        skipped_runs: runs.filter((run) => run.run?.run_status === 'skipped' || run.skipped).length,
        failed_runs: runs.filter((run) => run.run?.run_status === 'failed').length,
        runs
      };
    },

    async runScheduledAutomationCycle({ accountIds = null } = {}) {
      const manifests = await this.runScheduledSync({ accountIds });
      const progress = await this.runScheduledProgressSync({ accountIds });

      return {
        trigger: 'automation_cycle',
        manifests,
        progress,
        processed_accounts: Math.max(
          Number(manifests.processed_accounts || 0),
          Number(progress.processed_accounts || 0)
        ),
        failed_runs: Number(manifests.failed_runs || 0) + Number(progress.failed_runs || 0),
        changed_runs: Number(manifests.changed_runs || 0) + Number(progress.changed_runs || 0)
      };
    },

    async receiveInboundManifestDelivery({
      connectionReference = null,
      accountNumber = null,
      manifestFile,
      companionGpxFile = null,
      workDate = null,
      workAreaName = null,
      driverId = null,
      vehicleId = null
    }) {
      const fedexAccount = await loadFedexAccountForInboundDelivery(supabase, {
        connectionReference,
        accountNumber
      });

      if (!fedexAccount) {
        const error = new Error('No connected CSA FedEx account matched this inbound delivery.');
        error.statusCode = 404;
        throw error;
      }

      const account = await loadAccountForSync(supabase, fedexAccount.account_id);
      const resolvedWorkDate = workDate || getCurrentDateString(nowProvider(), account.operations_timezone || DEFAULT_ROUTE_SYNC_SETTINGS.operations_timezone);
      const routeSyncSettings = presentRouteSyncSettings(account, resolvedWorkDate, nowProvider());

      let run = await insertSyncRun(supabase, {
        account_id: account.id,
        fedex_account_id: fedexAccount.id,
        work_date: resolvedWorkDate,
        trigger_source: 'scheduled',
        run_status: 'running',
        sync_window_state: routeSyncSettings.dispatch_window_state,
        details: {
          route_sync_settings: routeSyncSettings,
          inbound_delivery: true,
          connection_reference: connectionReference || null,
          account_number: fedexAccount.account_number
        },
        started_at: nowProvider().toISOString()
      });

      try {
        if (!manifestIngestService) {
          throw new Error('Manifest ingest service is not configured.');
        }

        const ingestResult = await manifestIngestService.stageManifestArtifacts({
          accountId: account.id,
          manifestFile,
          companionGpxFile,
          requestedDriverId: driverId,
          requestedVehicleId: vehicleId,
          requestedDate: resolvedWorkDate,
          requestedWorkAreaName: workAreaName,
          source: 'fedex_inbound'
        });

        const runStatus = ingestResult.sync_state === 'staged_changed' ? 'completed_with_changes' : 'completed';
        run = await updateSyncRun(supabase, run.id, {
          run_status: runStatus,
          manifest_count: 1,
          changed_route_count: ingestResult.sync_state === 'staged_changed' ? 1 : 0,
          details: {
            ...run.details,
            ingest_result: {
              route_id: ingestResult.route_id,
              sync_state: ingestResult.sync_state,
              merged_into_existing_route: ingestResult.merged_into_existing_route,
              total_stops: ingestResult.total_stops
            }
          },
          finished_at: nowProvider().toISOString()
        });

        run.summary = `Inbound manifest received for route ${workAreaName || ingestResult.manifest_meta?.work_area_name || '--'}.`;

        return {
          message: 'Inbound manifest received and staged.',
          background_sync_enabled: true,
          sync_engine_status: run.run_status,
          trigger: 'inbound_delivery',
          run,
          ingest_result: ingestResult
        };
      } catch (error) {
        run = await updateSyncRun(supabase, run.id, {
          run_status: 'failed',
          error_summary: String(error?.message || 'Inbound manifest ingest failed.'),
          details: {
            ...run.details,
            reason: 'inbound_ingest_error'
          },
          finished_at: nowProvider().toISOString()
        });

        const wrappedError = new Error(error?.message || 'Inbound manifest ingest failed.');
        wrappedError.statusCode = Number(error?.statusCode || 500);
        wrappedError.run = run;
        throw wrappedError;
      }
    }
  };
}

module.exports = {
  DEFAULT_ROUTE_SYNC_SETTINGS,
  createFedexSyncService,
  getCurrentDateString,
  getTimeZoneDateParts,
  presentRouteSyncSettings
};
