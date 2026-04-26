const { namesLookLikeMatch, parseFccWorkAreaIdentity } = require('./routeIdentity');

function normalizeComparisonValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function extractRouteCode(value) {
  const match = String(value || '').match(/\b(\d{3,5})\b/);
  return match ? match[1] : null;
}

function pushUnique(keys, key) {
  if (key && !keys.includes(key)) {
    keys.push(key);
  }
}

function buildStopMatchKeys(stop) {
  const keys = [];
  const sid = String(stop?.sid || '').trim();

  if (sid && sid !== '0') {
    pushUnique(keys, `sid:${sid}`);
  }

  const fullAddress = normalizeComparisonValue([stop?.address, stop?.address_line2].filter(Boolean).join(' '));
  pushUnique(keys, fullAddress ? `address:${fullAddress}` : null);

  const primaryAddress = normalizeComparisonValue(stop?.address);
  pushUnique(keys, primaryAddress ? `address:${primaryAddress}` : null);

  const sequence = Number(stop?.sequence_order || stop?.sequence || 0);
  if (sequence > 0) {
    pushUnique(keys, `sequence:${sequence}`);
  }

  return keys;
}

function buildProgressMatchKeys(row) {
  const keys = [];
  const sid = String(row?.sid || '').trim();

  if (sid && sid !== '0') {
    pushUnique(keys, `sid:${sid}`);
  }

  const fullAddress = normalizeComparisonValue([row?.address, row?.address_line2].filter(Boolean).join(' '));
  pushUnique(keys, fullAddress ? `address:${fullAddress}` : null);

  const primaryAddress = normalizeComparisonValue(row?.address);
  pushUnique(keys, primaryAddress ? `address:${primaryAddress}` : null);

  const sequence = Number(row?.stop_number || row?.sequence || 0);
  if (sequence > 0) {
    pushUnique(keys, `sequence:${sequence}`);
  }

  return keys;
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
    .select('id, account_id, work_area_name, date, status, total_stops, manifest_stop_count, manifest_package_count, completed_stops, dispatch_state, completed_at, driver_id')
    .eq('account_id', accountId)
    .eq('date', workDate)
    .is('archived_at', null);

  if (error) {
    throw error;
  }

  return data || [];
}

async function loadAccountDrivers(supabase, accountId) {
  const { data, error } = await supabase
    .from('drivers')
    .select('id, name')
    .eq('account_id', accountId);

  if (error) {
    throw error;
  }

  return data || [];
}

async function loadRouteStops(supabase, routeId) {
  const { data, error } = await supabase
    .from('stops')
    .select('id, route_id, sequence_order, sid, address, address_line2, contact_name, lat, lng, status, exception_code, completed_at, scanned_at, ready_time, close_time, has_time_commit, stop_type, has_pickup, has_delivery, is_pickup, is_business, geocode_source, geocode_accuracy')
    .eq('route_id', routeId)
    .order('sequence_order');

  if (error) {
    throw error;
  }

  return data || [];
}

function normalizeProgressPackageCount(row) {
  const packageCount = Number(row?.package_count || row?.packages || 1);
  return Number.isFinite(packageCount) && packageCount > 0 ? Math.floor(packageCount) : 1;
}

function getProgressStopType(row) {
  const rawType = normalizeComparisonValue(row?.delivery_pickup || row?.type || row?.stop_type);
  const hasPickup = rawType.includes('pickup');
  const hasDelivery = rawType.includes('delivery') || rawType.includes('deliv');

  if (hasPickup && hasDelivery) {
    return 'combined';
  }

  if (hasPickup) {
    return 'pickup';
  }

  return 'delivery';
}

function getProgressStopPayload(row, index, routeId, existingStop = null) {
  const sequence = Number(row?.stop_number || row?.sequence || index + 1) || index + 1;
  const stopType = getProgressStopType(row);
  const hasPickup = stopType === 'pickup' || stopType === 'combined';
  const hasDelivery = stopType === 'delivery' || stopType === 'combined';
  const readyTime = row?.ready_time || existingStop?.ready_time || null;
  const closeTime = row?.close_time || existingStop?.close_time || null;

  return {
    route_id: routeId,
    sequence_order: sequence,
    sid: row?.sid ? String(row.sid).trim() : null,
    address: String(row?.address || existingStop?.address || `Stop ${sequence}`).trim(),
    address_line2: row?.address_line2 || existingStop?.address_line2 || null,
    contact_name: row?.contact_name || existingStop?.contact_name || null,
    lat: existingStop?.lat || null,
    lng: existingStop?.lng || null,
    status: 'pending',
    exception_code: null,
    completed_at: null,
    scanned_at: null,
    ready_time: readyTime,
    close_time: closeTime,
    has_time_commit: Boolean(readyTime || closeTime),
    stop_type: stopType,
    has_pickup: hasPickup,
    has_delivery: hasDelivery,
    is_pickup: stopType === 'pickup',
    is_business: Boolean(existingStop?.is_business),
    geocode_source: existingStop?.geocode_source || null,
    geocode_accuracy: existingStop?.geocode_accuracy || null
  };
}

function valuesDiffer(left, right) {
  return String(left ?? '') !== String(right ?? '');
}

function getStagedStopUpdatePayload(existingStop, nextStop) {
  const payload = {};
  const keys = [
    'sequence_order',
    'sid',
    'address',
    'address_line2',
    'contact_name',
    'status',
    'exception_code',
    'completed_at',
    'scanned_at',
    'ready_time',
    'close_time',
    'has_time_commit',
    'stop_type',
    'has_pickup',
    'has_delivery',
    'is_pickup'
  ];

  for (const key of keys) {
    if (valuesDiffer(existingStop?.[key], nextStop?.[key])) {
      payload[key] = nextStop[key];
    }
  }

  return payload;
}

function buildPackagePlaceholders(stopId, packageCount) {
  return Array.from({ length: packageCount }, (_, index) => ({
    stop_id: stopId,
    tracking_number: `FCC-PROGRESS-${stopId}-${index + 1}`
  }));
}

function buildStopKeyIndex(stops) {
  const stopByKey = new Map();
  stops.forEach((stop) => {
    for (const key of buildStopMatchKeys(stop)) {
      if (key && !stopByKey.has(key)) {
        stopByKey.set(key, stop);
      }
    }
  });
  return stopByKey;
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

function normalizeExceptionCode(value) {
  const raw = String(value || '').trim();

  if (!raw) {
    return null;
  }

  const prefixedPickupCode = raw.match(/\b(P\d{1,3})\b/i);
  if (prefixedPickupCode) {
    return prefixedPickupCode[1].toUpperCase();
  }

  const numericCode = raw.match(/\b(?:code\s*)?(\d{1,3})\b/i);
  if (!numericCode) {
    return raw.toUpperCase();
  }

  return Number(numericCode[1]) > 0 ? numericCode[1].padStart(2, '0') : null;
}

function getProgressRowTimestamp(row, nowProvider) {
  return (
    row?.completed_at ||
    row?.scanned_at ||
    row?.scan_time ||
    row?.status_time ||
    nowProvider().toISOString()
  );
}

function getProgressRowUpdate(row, nowProvider) {
  if (row?.is_completed) {
    return {
      status: 'delivered',
      exceptionCode: null,
      timestamp: getProgressRowTimestamp(row, nowProvider),
      type: 'completed'
    };
  }

  const exceptionCode = normalizeExceptionCode(row?.exception_code || row?.status_code || row?.scan_code);
  if (row?.is_exception || exceptionCode) {
    return {
      status: row?.status === 'incomplete' ? 'incomplete' : 'attempted',
      exceptionCode,
      timestamp: getProgressRowTimestamp(row, nowProvider),
      type: 'exception'
    };
  }

  return null;
}

async function resetStopPackages(supabase, stopId, packageCount) {
  const { error: deleteError } = await supabase
    .from('packages')
    .delete()
    .eq('stop_id', stopId);

  if (deleteError) {
    throw deleteError;
  }

  const packagePayload = buildPackagePlaceholders(stopId, packageCount);
  if (packagePayload.length === 0) {
    return;
  }

  const { error: insertError } = await supabase
    .from('packages')
    .insert(packagePayload);

  if (insertError) {
    throw insertError;
  }
}

async function reconcileStagedRouteFromSnapshot({
  supabase,
  accountId,
  route,
  snapshot,
  workDate,
  source,
  managerUserId,
  fccDriverName,
  matchedDriver
}) {
  const rows = (snapshot?.rows || []).filter((row) => row && (row.address || row.sid || row.stop_number));
  const totalRows = Number(snapshot?.record_count || rows.length || 0);
  const shouldClearStaleDriver = Boolean(fccDriverName && !matchedDriver && route.driver_id);
  const driverUpdatePayload = matchedDriver
    ? { driver_id: matchedDriver.id }
    : shouldClearStaleDriver
      ? { driver_id: null }
      : {};

  if (rows.length === 0) {
    if (matchedDriver || shouldClearStaleDriver) {
      const { error } = await supabase
        .from('routes')
        .update(driverUpdatePayload)
        .eq('id', route.id);

      if (error) {
        throw error;
      }
    }

    return {
      status: (matchedDriver || shouldClearStaleDriver) ? 'updated' : 'route_not_dispatched',
      changed: Boolean(matchedDriver || shouldClearStaleDriver),
      stop_count: 0,
      package_count: 0,
      inserted_stop_count: 0,
      updated_stop_count: 0,
      removed_stop_count: 0
    };
  }

  const existingStops = await loadRouteStops(supabase, route.id);
  const stopByKey = buildStopKeyIndex(existingStops);
  const matchedStopIds = new Set();
  const nextStopIds = [];
  let insertedStopCount = 0;
  let updatedStopCount = 0;
  let packageCount = 0;

  for (const [index, row] of rows.entries()) {
    const matchedStop =
      buildProgressMatchKeys(row)
        .map((key) => stopByKey.get(key))
        .find((stop) => stop && !matchedStopIds.has(stop.id)) || null;
    const nextStop = getProgressStopPayload(row, index, route.id, matchedStop);
    const nextPackageCount = normalizeProgressPackageCount(row);
    packageCount += nextPackageCount;

    if (matchedStop) {
      matchedStopIds.add(matchedStop.id);
      nextStopIds.push(matchedStop.id);

      const updatePayload = getStagedStopUpdatePayload(matchedStop, nextStop);
      if (Object.keys(updatePayload).length > 0) {
        const { error } = await supabase
          .from('stops')
          .update(updatePayload)
          .eq('id', matchedStop.id);

        if (error) {
          throw error;
        }

        updatedStopCount += 1;
      }

      await resetStopPackages(supabase, matchedStop.id, nextPackageCount);
      continue;
    }

    const { data: insertedStop, error: insertError } = await supabase
      .from('stops')
      .insert(nextStop)
      .select('id')
      .single();

    if (insertError) {
      throw insertError;
    }

    if (!insertedStop?.id) {
      throw new Error('Failed to insert reconciled FCC progress stop');
    }

    nextStopIds.push(insertedStop.id);
    insertedStopCount += 1;
    await resetStopPackages(supabase, insertedStop.id, nextPackageCount);
  }

  const staleStops = existingStops.filter((stop) => !matchedStopIds.has(stop.id) && !nextStopIds.includes(stop.id));
  for (const staleStop of staleStops) {
    const { error: packageDeleteError } = await supabase
      .from('packages')
      .delete()
      .eq('stop_id', staleStop.id);

    if (packageDeleteError) {
      throw packageDeleteError;
    }

    const { error: stopDeleteError } = await supabase
      .from('stops')
      .delete()
      .eq('id', staleStop.id);

    if (stopDeleteError) {
      throw stopDeleteError;
    }
  }

  const routeUpdatePayload = {
    total_stops: rows.length,
    manifest_stop_count: rows.length,
    manifest_package_count: packageCount,
    completed_stops: 0,
    status: 'pending',
    completed_at: null,
    ...driverUpdatePayload
  };
  const routeChanged =
    Number(route.total_stops || 0) !== rows.length ||
    Number(route.manifest_stop_count || route.total_stops || 0) !== rows.length ||
    Number(route.manifest_package_count || 0) !== packageCount ||
    Number(route.completed_stops || 0) !== 0 ||
    route.status !== 'pending' ||
    Boolean(route.completed_at) ||
    Boolean(matchedDriver && route.driver_id !== matchedDriver.id) ||
    shouldClearStaleDriver;

  if (routeChanged) {
    const { error: routeUpdateError } = await supabase
      .from('routes')
      .update(routeUpdatePayload)
      .eq('id', route.id);

    if (routeUpdateError) {
      throw routeUpdateError;
    }
  }

  const changed = routeChanged || insertedStopCount > 0 || updatedStopCount > 0 || staleStops.length > 0;
  if (changed) {
    await recordRouteSyncEvent(supabase, {
      accountId,
      routeId: route.id,
      workDate,
      eventType: 'fcc_progress_synced',
      eventStatus: 'info',
      summary: `FCC staged manifest reconciled ${rows.length} stops for route ${route.work_area_name || snapshot?.work_area_name || route.id}`,
      details: {
        source,
        total_rows: totalRows,
        previous_total_stops: Number(route.total_stops || 0),
        next_total_stops: rows.length,
        next_package_count: packageCount,
        inserted_stop_count: insertedStopCount,
        updated_stop_count: updatedStopCount,
        removed_stop_count: staleStops.length,
        fcc_driver_name: fccDriverName || null,
        matched_driver_name: matchedDriver?.name || null
      },
      managerUserId
    });
  }

  return {
    status: changed ? 'staged_reconciled' : 'route_not_dispatched',
    changed,
    stop_count: rows.length,
    package_count: packageCount,
    inserted_stop_count: insertedStopCount,
    updated_stop_count: updatedStopCount,
    removed_stop_count: staleStops.length
  };
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
    let drivers = null;
    let totalCompletedUpdates = 0;
    let totalExceptionUpdates = 0;
    let totalDriverAssignments = 0;

    async function getDrivers() {
      if (!drivers) {
        drivers = await loadAccountDrivers(supabase, accountId);
      }

      return drivers;
    }

    for (const snapshot of progressSnapshots) {
      const route = findRouteForSnapshot(dispatchedRoutes, snapshot);

      if (!route) {
        const stagedRoute = findRouteForSnapshot(routes, snapshot);
        const fccDriverName = parseFccWorkAreaIdentity(snapshot?.work_area_name).driverName;
        const matchedDriver =
          stagedRoute && fccDriverName
            ? (await getDrivers()).find((driver) => namesLookLikeMatch(driver.name, fccDriverName)) || null
            : null;

        if (stagedRoute) {
          const stagedResult = await reconcileStagedRouteFromSnapshot({
            supabase,
            accountId,
            route: stagedRoute,
            snapshot,
            workDate,
            source,
            managerUserId,
            fccDriverName,
            matchedDriver
          });

          totalDriverAssignments += matchedDriver && stagedRoute.driver_id !== matchedDriver.id ? 1 : 0;
          appliedResults.push({
            work_area_name: snapshot?.work_area_name || stagedRoute.work_area_name || null,
            route_id: stagedRoute.id,
            status: stagedResult.status,
            completed_updates: 0,
            exception_updates: 0,
            worked_updates: 0,
            matched_driver_name: matchedDriver?.name || null,
            fcc_driver_name: fccDriverName || null,
            matched_rows: 0,
            total_rows: Number(snapshot?.record_count || (snapshot?.rows || []).length || 0),
            reconciled_stop_count: stagedResult.stop_count,
            reconciled_package_count: stagedResult.package_count,
            inserted_stop_count: stagedResult.inserted_stop_count,
            updated_stop_count: stagedResult.updated_stop_count,
            removed_stop_count: stagedResult.removed_stop_count
          });

          continue;
        }

        appliedResults.push({
          work_area_name: snapshot?.work_area_name || null,
          route_id: null,
          status: 'route_not_found',
          completed_updates: 0,
          exception_updates: 0,
          worked_updates: 0,
          matched_rows: 0,
          total_rows: Number(snapshot?.record_count || (snapshot?.rows || []).length || 0)
        });
        continue;
      }

      const stops = await loadRouteStops(supabase, route.id);
      const stopByKey = new Map();
      stops.forEach((stop) => {
        for (const key of buildStopMatchKeys(stop)) {
          if (key && !stopByKey.has(key)) {
            stopByKey.set(key, stop);
          }
        }
      });

      const actionableRows = (snapshot?.rows || [])
        .map((row) => ({
          row,
          update: getProgressRowUpdate(row, nowProvider)
        }))
        .filter((entry) => entry.update);
      const updates = [];
      const existingCompletedStops = stops.reduce((sum, stop) => sum + (stop.completed_at ? 1 : 0), 0);

      for (const { row, update } of actionableRows) {
        const matchedStop =
          buildProgressMatchKeys(row)
            .map((key) => stopByKey.get(key))
            .find(Boolean) || null;

        if (!matchedStop) {
          continue;
        }

        const nextExceptionCode = update.exceptionCode || null;
        const alreadyHasSameTerminalState =
          Boolean(matchedStop.completed_at) &&
          matchedStop.status === update.status &&
          String(matchedStop.exception_code || '') === String(nextExceptionCode || '');

        if (alreadyHasSameTerminalState) {
          continue;
        }

        updates.push({
          stopId: matchedStop.id,
          status: update.status,
          exceptionCode: nextExceptionCode,
          completedAt: update.timestamp,
          scannedAt: update.timestamp,
          type: update.type,
          wasAlreadyCompleted: Boolean(matchedStop.completed_at)
        });
      }

      for (const update of updates) {
        const { error } = await supabase
          .from('stops')
          .update({
            status: update.status,
            exception_code: update.exceptionCode,
            completed_at: update.completedAt,
            scanned_at: update.scannedAt
          })
          .eq('id', update.stopId);

        if (error) {
          throw error;
        }
      }

      const newlyCompletedUpdates = updates.filter((update) => !update.wasAlreadyCompleted).length;
      const completedUpdates = updates.filter((update) => update.type === 'completed').length;
      const exceptionUpdates = updates.filter((update) => update.type === 'exception').length;
      const nextCompletedStops = existingCompletedStops + newlyCompletedUpdates;
      const routeStatus = deriveRouteStatus({
        completedStops: nextCompletedStops,
        totalStops: Number(route.total_stops || 0),
        currentStatus: route.status
      });
      const completedAt =
        Number(route.total_stops || 0) > 0 && nextCompletedStops >= Number(route.total_stops || 0)
          ? nowProvider().toISOString()
          : route.completed_at || null;
      const fccDriverName = parseFccWorkAreaIdentity(snapshot?.work_area_name).driverName;
      const matchedDriver =
        !route.driver_id && fccDriverName
          ? (await getDrivers()).find((driver) => namesLookLikeMatch(driver.name, fccDriverName)) || null
          : null;
      const routeUpdatePayload = {
        completed_stops: nextCompletedStops,
        status: routeStatus,
        ...(completedAt ? { completed_at: completedAt } : {}),
        ...(matchedDriver ? { driver_id: matchedDriver.id } : {})
      };

      const { error: routeUpdateError } = await supabase
        .from('routes')
        .update(routeUpdatePayload)
        .eq('id', route.id);

      if (routeUpdateError) {
        throw routeUpdateError;
      }

      if (updates.length > 0 || matchedDriver) {
        await recordRouteSyncEvent(supabase, {
          accountId,
          routeId: route.id,
          workDate,
          eventType: 'fcc_progress_synced',
          eventStatus: 'info',
          summary: `FCC progress synced ${updates.length} worked stops for route ${route.work_area_name || snapshot?.work_area_name || route.id}`,
          details: {
            source,
            completed_updates: completedUpdates,
            exception_updates: exceptionUpdates,
            worked_updates: updates.length,
            matched_rows: actionableRows.length,
            total_rows: Number(snapshot?.record_count || (snapshot?.rows || []).length || 0),
            visual_completed_rows: actionableRows.filter((entry) => entry.update.type === 'completed').length,
            visual_exception_rows: actionableRows.filter((entry) => entry.update.type === 'exception').length,
            delivered_packages: Number(snapshot?.delivered_packages || 0),
            fcc_driver_name: fccDriverName || null,
            matched_driver_name: matchedDriver?.name || null
          },
          managerUserId
        });
      }

      totalCompletedUpdates += updates.length;
      totalExceptionUpdates += exceptionUpdates;
      totalDriverAssignments += matchedDriver ? 1 : 0;
      appliedResults.push({
        work_area_name: snapshot?.work_area_name || route.work_area_name || null,
        route_id: route.id,
        status: updates.length > 0 || matchedDriver ? 'updated' : 'no_changes',
        completed_updates: completedUpdates,
        exception_updates: exceptionUpdates,
        worked_updates: updates.length,
        matched_driver_name: matchedDriver?.name || null,
        fcc_driver_name: fccDriverName || null,
        matched_rows: actionableRows.length,
        total_rows: Number(snapshot?.record_count || (snapshot?.rows || []).length || 0)
      });
    }

    return {
      route_count: progressSnapshots.length,
      completed_updates: totalCompletedUpdates,
      exception_updates: totalExceptionUpdates,
      driver_assignments: totalDriverAssignments,
      has_changes: totalCompletedUpdates > 0 || totalDriverAssignments > 0 || appliedResults.some((route) => route.status === 'staged_reconciled'),
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
