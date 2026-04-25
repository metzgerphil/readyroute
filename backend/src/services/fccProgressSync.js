function normalizeComparisonValue(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractRouteCode(value) {
  const match = String(value || '').match(/\b(\d{3,5})\b/);
  return match ? match[1] : null;
}

function buildStopMatchKey(stop) {
  const sid = String(stop?.sid || '').trim();

  if (sid && sid !== '0') {
    return `sid:${sid}`;
  }

  const address = normalizeComparisonValue([stop?.address, stop?.address_line2].filter(Boolean).join(' '));
  if (address) {
    return `address:${address}`;
  }

  const sequence = Number(stop?.sequence_order || stop?.sequence || 0);
  if (sequence > 0) {
    return `sequence:${sequence}`;
  }

  return null;
}

function buildProgressMatchKey(row) {
  const sid = String(row?.sid || '').trim();

  if (sid && sid !== '0') {
    return `sid:${sid}`;
  }

  const address = normalizeComparisonValue([row?.address, row?.address_line2].filter(Boolean).join(' '));
  if (address) {
    return `address:${address}`;
  }

  const sequence = Number(row?.stop_number || row?.sequence || 0);
  if (sequence > 0) {
    return `sequence:${sequence}`;
  }

  return null;
}

async function recordRouteSyncEvent(supabase, {
  accountId,
  routeId,
  workDate,
  eventType,
  eventStatus = 'info',
  summary,
  details = {},
  managerUserId = null
}) {
  if (!accountId || !routeId || !workDate || !eventType || !summary) {
    return;
  }

  const { error } = await supabase
    .from('route_sync_events')
    .insert({
      account_id: accountId,
      route_id: routeId,
      work_date: workDate,
      event_type: eventType,
      event_status: eventStatus,
      summary,
      details,
      manager_user_id: managerUserId
    });

  if (error) {
    console.error('Route sync event insert failed:', error);
  }
}

async function loadCandidateRoutes(supabase, { accountId, workDate }) {
  const { data, error } = await supabase
    .from('routes')
    .select('id, account_id, work_area_name, date, status, total_stops, completed_stops, dispatch_state, completed_at')
    .eq('account_id', accountId)
    .eq('date', workDate)
    .is('archived_at', null);

  if (error) {
    throw error;
  }

  return data || [];
}

async function loadRouteStops(supabase, routeId) {
  const { data, error } = await supabase
    .from('stops')
    .select('id, route_id, sequence_order, sid, address, address_line2, status, completed_at, scanned_at')
    .eq('route_id', routeId)
    .order('sequence_order');

  if (error) {
    throw error;
  }

  return data || [];
}

function findRouteForSnapshot(routes, snapshot) {
  const targetName = normalizeComparisonValue(snapshot?.work_area_name);
  const targetRouteCode = extractRouteCode(snapshot?.work_area_name);

  return (
    routes.find((route) => normalizeComparisonValue(route.work_area_name) === targetName) ||
    routes.find((route) => {
      const routeCode = extractRouteCode(route.work_area_name);
      return Boolean(targetRouteCode && routeCode && routeCode === targetRouteCode);
    }) ||
    null
  );
}

function deriveRouteStatus({ completedStops, totalStops, currentStatus }) {
  if (totalStops > 0 && completedStops >= totalStops) {
    return 'complete';
  }

  if (completedStops > 0 && (!currentStatus || currentStatus === 'pending')) {
    return 'in_progress';
  }

  return currentStatus || 'pending';
}

function createFccProgressSyncService(options = {}) {
  const { supabase } = options;
  const nowProvider = options.now || (() => new Date());

  if (!supabase) {
    throw new Error('createFccProgressSyncService requires a Supabase client');
  }

  async function applyRouteProgress({
    accountId,
    workDate,
    progressSnapshots = [],
    managerUserId = null,
    source = 'fedex_progress_sync'
  }) {
    const routes = await loadCandidateRoutes(supabase, { accountId, workDate });
    const dispatchedRoutes = routes.filter((route) => route.dispatch_state === 'dispatched');
    const appliedResults = [];
    let totalCompletedUpdates = 0;

    for (const snapshot of progressSnapshots) {
      const route =
        findRouteForSnapshot(dispatchedRoutes, snapshot) ||
        findRouteForSnapshot(routes, snapshot);

      if (!route) {
        appliedResults.push({
          work_area_name: snapshot?.work_area_name || null,
          route_id: null,
          status: 'route_not_found',
          completed_updates: 0,
          matched_rows: 0,
          total_rows: Number(snapshot?.record_count || (snapshot?.rows || []).length || 0)
        });
        continue;
      }

      const stops = await loadRouteStops(supabase, route.id);
      const stopByKey = new Map();
      stops.forEach((stop) => {
        const key = buildStopMatchKey(stop);
        if (key && !stopByKey.has(key)) {
          stopByKey.set(key, stop);
        }
      });

      const completedRows = (snapshot?.rows || []).filter((row) => row?.is_completed);
      const updates = [];
      const existingCompletedStops = stops.reduce((sum, stop) => sum + (stop.completed_at ? 1 : 0), 0);

      for (const row of completedRows) {
        const key = buildProgressMatchKey(row);
        const matchedStop = key ? stopByKey.get(key) : null;

        if (!matchedStop || matchedStop.completed_at) {
          continue;
        }

        updates.push({
          stopId: matchedStop.id,
          completedAt: row?.completed_at || nowProvider().toISOString()
        });
      }

      for (const update of updates) {
        const { error } = await supabase
          .from('stops')
          .update({
            status: 'delivered',
            completed_at: update.completedAt,
            scanned_at: update.completedAt
          })
          .eq('id', update.stopId);

        if (error) {
          throw error;
        }
      }

      const nextCompletedStops = existingCompletedStops + updates.length;
      const routeStatus = deriveRouteStatus({
        completedStops: nextCompletedStops,
        totalStops: Number(route.total_stops || 0),
        currentStatus: route.status
      });
      const completedAt =
        Number(route.total_stops || 0) > 0 && nextCompletedStops >= Number(route.total_stops || 0)
          ? nowProvider().toISOString()
          : route.completed_at || null;

      const { error: routeUpdateError } = await supabase
        .from('routes')
        .update({
          completed_stops: nextCompletedStops,
          status: routeStatus,
          ...(completedAt ? { completed_at: completedAt } : {})
        })
        .eq('id', route.id);

      if (routeUpdateError) {
        throw routeUpdateError;
      }

      if (updates.length > 0) {
        await recordRouteSyncEvent(supabase, {
          accountId,
          routeId: route.id,
          workDate,
          eventType: 'fcc_progress_synced',
          eventStatus: 'info',
          summary: `FCC progress synced ${updates.length} completed stops for route ${route.work_area_name || snapshot?.work_area_name || route.id}`,
          details: {
            source,
            completed_updates: updates.length,
            matched_rows: completedRows.length,
            total_rows: Number(snapshot?.record_count || (snapshot?.rows || []).length || 0),
            visual_completed_rows: completedRows.length,
            delivered_packages: Number(snapshot?.delivered_packages || 0)
          },
          managerUserId
        });
      }

      totalCompletedUpdates += updates.length;
      appliedResults.push({
        work_area_name: snapshot?.work_area_name || route.work_area_name || null,
        route_id: route.id,
        status: updates.length > 0 ? 'updated' : 'no_changes',
        completed_updates: updates.length,
        matched_rows: completedRows.length,
        total_rows: Number(snapshot?.record_count || (snapshot?.rows || []).length || 0)
      });
    }

    return {
      route_count: progressSnapshots.length,
      completed_updates: totalCompletedUpdates,
      has_changes: totalCompletedUpdates > 0,
      routes: appliedResults
    };
  }

  return {
    applyRouteProgress
  };
}

module.exports = {
  createFccProgressSyncService
};
