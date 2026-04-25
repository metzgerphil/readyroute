const crypto = require('crypto');

const {
  detectManifestFormat,
  parseGPXManifest,
  parseXLSManifest
} = require('./manifestParser');
const { mergeManifestMeta, mergeManifestStops, normalizeMergedStopSequences } = require('./manifestMerge');
const { normalizeRouteWorkAreaName } = require('./routeIdentity');
const { bootstrapApartmentRecords } = require('./apartmentIntelligence');
const { applyLocationCorrectionsToStops } = require('./locationCorrections');
const { enrichManifestStopsWithGeocoding } = require('./manifestGeocoding');
const {
  detectSuspiciousCoordinateClusters,
  summarizeCoordinateHealth
} = require('./coordinates');

function normalizeComparisonValue(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getManifestSchemaError(error) {
  const message = String(error?.message || error?.details || error?.hint || '');

  if (
    /column .* does not exist/i.test(message) ||
    /could not find the .*column/i.test(message) ||
    /schema cache/i.test(message)
  ) {
    return 'Database is missing the FedEx manifest columns. Run the latest ALTER TABLE migration for stops and routes in Supabase, then try again.';
  }

  return null;
}

function getManifestUploadError(error, { workAreaName, date }) {
  const schemaError = getManifestSchemaError(error);

  if (schemaError) {
    return schemaError;
  }

  const message = String(error?.message || '');
  const details = String(error?.details || '');
  const combined = `${message} ${details}`;

  if (
    error?.code === '23505' &&
    /routes_work_area_date_account/i.test(combined)
  ) {
    return `Route ${workAreaName || 'this work area'} for ${date || 'this date'} already exists. Open the existing route below instead of uploading the same manifest again.`;
  }

  return null;
}

function getManifestPackageCount(stops = []) {
  return (stops || []).reduce((sum, stop) => sum + Math.max(1, Number(stop?.package_count || 1)), 0);
}

function buildManifestSyncFingerprint({ manifestMeta = {}, stops = [] }) {
  const normalizedStops = (stops || []).map((stop) => ({
    sequence: Number(stop.sequence || stop.sequence_order || 0),
    address: String(stop.address || '').trim(),
    address_line2: String(stop.address_line2 || '').trim(),
    sid: String(stop.sid || '').trim(),
    type: String(stop.type || stop.stop_type || '').trim(),
    package_count: Math.max(1, Number(stop.package_count || 1)),
    ready_time: stop.ready_time || null,
    close_time: stop.close_time || null,
    lat: stop.lat == null ? null : Number(stop.lat),
    lng: stop.lng == null ? null : Number(stop.lng)
  }));

  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        date: manifestMeta.date || null,
        work_area_name: manifestMeta.work_area_name || null,
        driver_name: manifestMeta.driver_name || null,
        vehicle_number: manifestMeta.vehicle_number || null,
        stops: normalizedStops
      })
    )
    .digest('hex');
}

function buildRouteSyncMetadata({ manifestMeta = {}, routeStops = [], previousRoute = null, syncedAt = new Date().toISOString() }) {
  const manifestFingerprint = buildManifestSyncFingerprint({ manifestMeta, stops: routeStops });
  const previousFingerprint = previousRoute?.manifest_fingerprint || null;
  const hasChanged = previousFingerprint !== manifestFingerprint;

  return {
    sync_state: hasChanged ? 'staged_changed' : 'staged_stable',
    last_manifest_sync_at: syncedAt,
    last_manifest_change_at: hasChanged ? syncedAt : previousRoute?.last_manifest_change_at || syncedAt,
    manifest_stop_count: routeStops.length,
    manifest_package_count: getManifestPackageCount(routeStops),
    manifest_fingerprint: manifestFingerprint,
    last_manifest_sync_error: null
  };
}

function createAddressHash(address) {
  return crypto
    .createHash('md5')
    .update(String(address || '').trim().toLowerCase())
    .digest('hex');
}

async function loadExistingManifestRoute(supabase, { accountId, date, workAreaName }) {
  const { data, error } = await supabase
    .from('routes')
    .select('id, work_area_name, status, dispatch_state, completed_stops, completed_at, driver_id, vehicle_id, manifest_fingerprint, last_manifest_change_at')
    .eq('account_id', accountId)
    .eq('date', date)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) {
    return { data: null, error };
  }

  const normalizedTarget = normalizeRouteWorkAreaName(workAreaName);
  const route = (data || []).find(
    (entry) => normalizeRouteWorkAreaName(entry.work_area_name) === normalizedTarget
  ) || null;

  return { data: route, error: null };
}

function canReplaceExistingManifestRoute(route) {
  if (!route) {
    return false;
  }

  const completedStops = Number(route.completed_stops || 0);
  return completedStops === 0 && !route.completed_at && route.status !== 'complete' && route.dispatch_state !== 'dispatched';
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

function buildPendingManifestStopKey(stop, fallbackKey) {
  const sid = String(stop?.sid || '').trim();

  if (sid && sid !== '0') {
    return `sid:${sid}`;
  }

  const normalizedAddress = normalizeComparisonValue(
    [stop?.address || stop?.address_line1 || '', stop?.address_line2 || '', stop?.type || stop?.stop_type || 'delivery']
      .filter(Boolean)
      .join(' ')
  );

  if (normalizedAddress) {
    return `address:${normalizedAddress}`;
  }

  return fallbackKey;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toManifestStopFromExistingRouteStop(stop, packageCount = 1) {
  const sequence = Number(stop?.sequence_order || stop?.sequence || 0) || 1;
  const stopType = stop?.stop_type || (stop?.is_pickup ? 'pickup' : 'delivery');
  const hasPickup = Boolean(stop?.has_pickup || stop?.is_pickup || stopType === 'pickup' || stopType === 'combined');
  const hasDelivery = stop?.has_delivery === false ? false : stopType !== 'pickup';

  return {
    id: stop?.id || null,
    sequence,
    stop_number: sequence,
    address: stop?.address || '',
    address_line2: stop?.address_line2 || null,
    contact_name: stop?.contact_name || null,
    lat: toNumber(stop?.lat),
    lng: toNumber(stop?.lng),
    is_pickup: Boolean(stop?.is_pickup),
    is_business: Boolean(stop?.is_business),
    sid: stop?.sid || null,
    ready_time: stop?.ready_time || null,
    close_time: stop?.close_time || null,
    has_time_commit: Boolean(stop?.has_time_commit),
    type: stopType,
    has_pickup: hasPickup,
    has_delivery: hasDelivery,
    geocode_source: stop?.geocode_source || 'manifest',
    geocode_accuracy: stop?.geocode_accuracy || 'manifest',
    package_count: Math.max(1, Number(packageCount || 1))
  };
}

function mergePendingManifestStops(existingStops = [], incomingStops = []) {
  const mergedStops = new Map();

  existingStops.forEach((stop, index) => {
    mergedStops.set(
      buildPendingManifestStopKey(stop, `existing:${stop?.id || stop?.sequence || index}`),
      stop
    );
  });

  incomingStops.forEach((stop, index) => {
    mergedStops.set(
      buildPendingManifestStopKey(stop, `incoming:${stop?.sequence || index}`),
      stop
    );
  });

  return normalizeMergedStopSequences(Array.from(mergedStops.values()));
}

function createManifestIngestService(options = {}) {
  const { supabase } = options;
  const nowProvider = options.now || (() => new Date());

  if (!supabase) {
    throw new Error('createManifestIngestService requires a Supabase client');
  }

  async function stageManifestArtifacts({
    accountId,
    managerUserId = null,
    manifestFile,
    companionGpxFile = null,
    requestedDriverId = null,
    requestedDriverName = null,
    requestedVehicleId = null,
    requestedDate = null,
    requestedWorkAreaName = null,
    source = 'fedex_sync'
  }) {
    if (!manifestFile?.buffer) {
      throw new Error('Manifest file is required');
    }

    const manifestFormat = detectManifestFormat(manifestFile.buffer, manifestFile.originalname);

    if (manifestFormat === 'unknown') {
      throw new Error('Unsupported manifest file type. Use .xls, .xlsx, or .gpx.');
    }

    let manifest =
      manifestFormat === 'xls'
        ? parseXLSManifest(manifestFile.buffer)
        : await parseGPXManifest(manifestFile.buffer);
    let parsedStops = manifest?.stops || [];
    let manifestMeta = manifest?.manifest_meta || {};

    if (companionGpxFile) {
      const gpxFormat = detectManifestFormat(companionGpxFile.buffer, companionGpxFile.originalname);

      if (gpxFormat !== 'gpx') {
        throw new Error('Optional companion file must be a .gpx file.');
      }

      const gpxManifest = await parseGPXManifest(companionGpxFile.buffer);
      parsedStops = mergeManifestStops(parsedStops, gpxManifest?.stops || []);
      parsedStops = normalizeMergedStopSequences(parsedStops);
      manifestMeta = mergeManifestMeta(manifestMeta, gpxManifest?.manifest_meta || null);
    }

    if (!parsedStops.length) {
      throw new Error('No stops found in manifest file');
    }

    const resolvedDate = requestedDate || manifestMeta.date;
    const resolvedWorkAreaName = normalizeRouteWorkAreaName(requestedWorkAreaName || manifestMeta.work_area_name || '');
    const requestedDriverNameCandidate = String(requestedDriverName || '').trim();
    let resolvedDriverId = requestedDriverId || null;
    let resolvedVehicleId = requestedVehicleId || null;
    let autoMatchedDriver = false;
    let autoMatchedVehicle = false;
    let unmatchedDriverName = null;
    let matchedDriverName = null;

    if (manifestFormat === 'xls') {
      if (!resolvedDate || !resolvedWorkAreaName) {
        throw new Error('Manifest is missing required date or work area information');
      }

      const manifestDriverName = String(manifestMeta.driver_name || requestedDriverNameCandidate || '').trim();
      const manifestVehicleNumber = String(manifestMeta.vehicle_number || '').trim();

      if (manifestDriverName) {
        const { data: drivers, error: driversError } = await supabase
          .from('drivers')
          .select('id, name')
          .eq('account_id', accountId);

        if (driversError) {
          throw new Error('Failed to match manifest driver');
        }

        const matchedDriver = (drivers || []).find(
          (driver) => normalizeComparisonValue(driver.name) === normalizeComparisonValue(manifestDriverName)
        );

        if (matchedDriver) {
          resolvedDriverId = matchedDriver.id;
          autoMatchedDriver = true;
          matchedDriverName = matchedDriver.name;
        } else {
          resolvedDriverId = null;
          unmatchedDriverName = manifestDriverName;
        }
      }

      if (manifestVehicleNumber) {
        const { data: vehicles, error: vehiclesError } = await supabase
          .from('vehicles')
          .select('id, name')
          .eq('account_id', accountId);

        if (vehiclesError) {
          throw new Error('Failed to match manifest vehicle');
        }

        const matchedVehicle = (vehicles || []).find(
          (vehicle) => normalizeComparisonValue(vehicle.name) === normalizeComparisonValue(manifestVehicleNumber)
        );

        if (matchedVehicle) {
          resolvedVehicleId = matchedVehicle.id;
          autoMatchedVehicle = true;
        } else {
          resolvedVehicleId = null;
        }
      }
    } else if (!resolvedDriverId || !resolvedVehicleId || !resolvedDate || !resolvedWorkAreaName) {
      throw new Error('driver_id, vehicle_id, date, and work_area_name are required');
    }

    const manifestStops = parsedStops.map((stop) => ({
      ...stop,
      geocode_source: stop.geocode_source || 'manifest',
      geocode_accuracy: stop.geocode_accuracy || 'manifest'
    }));
    const addressWarnings = [];
    const correctedStops = await applyLocationCorrectionsToStops(supabase, accountId, manifestStops);
    const geocodedManifest = await enrichManifestStopsWithGeocoding(supabase, accountId, correctedStops);
    let routeStops = normalizeMergedStopSequences(geocodedManifest.stops);

    const { data: existingRoute, error: existingRouteError } = await loadExistingManifestRoute(supabase, {
      accountId,
      date: resolvedDate,
      workAreaName: resolvedWorkAreaName
    });

    if (existingRouteError) {
      throw new Error('Failed to check for an existing route before upload');
    }

    let routeId = null;
    let mergedIntoExistingRoute = false;
    let routeSyncMetadata = null;

    if (existingRoute) {
      if (!canReplaceExistingManifestRoute(existingRoute)) {
        const conflictError = new Error(
          `Route ${resolvedWorkAreaName || 'this work area'} for ${resolvedDate || 'this date'} already exists and has already started. Open the existing route below instead of uploading the same manifest again.`
        );
        conflictError.statusCode = 409;
        throw conflictError;
      }

      const { data: existingStops, error: existingStopsError } = await supabase
        .from('stops')
        .select(
          'id, sequence_order, address, address_line2, contact_name, lat, lng, is_pickup, is_business, sid, ready_time, close_time, has_time_commit, stop_type, has_pickup, has_delivery, geocode_source, geocode_accuracy'
        )
        .eq('route_id', existingRoute.id)
        .order('sequence_order');

      if (existingStopsError) {
        throw new Error('Failed to load the existing route before applying the new manifest');
      }

      const existingStopIds = (existingStops || []).map((stop) => stop.id);
      const packageCountByStopId = new Map();

      if (existingStopIds.length) {
        const { data: existingPackages, error: existingPackagesError } = await supabase
          .from('packages')
          .select('id, stop_id')
          .in('stop_id', existingStopIds);

        if (existingPackagesError) {
          throw new Error('Failed to load the existing route packages before applying the new manifest');
        }

        for (const pkg of existingPackages || []) {
          packageCountByStopId.set(pkg.stop_id, (packageCountByStopId.get(pkg.stop_id) || 0) + 1);
        }
      }

      const existingManifestStops = (existingStops || []).map((stop) =>
        toManifestStopFromExistingRouteStop(stop, packageCountByStopId.get(stop.id) || 1)
      );

      routeStops = mergePendingManifestStops(existingManifestStops, routeStops);
      resolvedDriverId = resolvedDriverId || existingRoute.driver_id || null;
      resolvedVehicleId = resolvedVehicleId || existingRoute.vehicle_id || null;

      if (existingStopIds.length) {
        const { error: deletePackagesError } = await supabase
          .from('packages')
          .delete()
          .in('stop_id', existingStopIds);

        if (deletePackagesError) {
          throw new Error('Failed to clear the old package placeholders before applying the new manifest');
        }
      }

      const { error: deleteStopsError } = await supabase
        .from('stops')
        .delete()
        .eq('route_id', existingRoute.id);

      if (deleteStopsError) {
        throw new Error('Failed to clear the old route stops before applying the new manifest');
      }

      routeSyncMetadata = buildRouteSyncMetadata({
        manifestMeta,
        routeStops,
        previousRoute: existingRoute,
        syncedAt: nowProvider().toISOString()
      });

      const { data: updatedRoute, error: updateRouteError } = await supabase
        .from('routes')
        .update({
          driver_id: resolvedDriverId,
          vehicle_id: resolvedVehicleId,
          work_area_name: resolvedWorkAreaName,
          dispatch_state: 'staged',
          dispatched_at: null,
          dispatched_by_manager_user_id: null,
          ...routeSyncMetadata,
          sa_number: manifestMeta.sa_number || null,
          contractor_name: manifestMeta.contractor_name || null,
          source,
          total_stops: routeStops.length,
          completed_stops: 0,
          status: 'pending'
        })
        .eq('id', existingRoute.id)
        .eq('account_id', accountId)
        .select('id')
        .single();

      if (updateRouteError) {
        throw new Error('Failed to update the existing route with the new manifest data');
      }

      routeId = updatedRoute.id;
      mergedIntoExistingRoute = true;
    } else {
      routeSyncMetadata = buildRouteSyncMetadata({
        manifestMeta,
        routeStops,
        previousRoute: existingRoute,
        syncedAt: nowProvider().toISOString()
      });

      const { data: routeRecord, error: routeError } = await supabase
        .from('routes')
        .insert({
          account_id: accountId,
          driver_id: resolvedDriverId,
          vehicle_id: resolvedVehicleId,
          work_area_name: resolvedWorkAreaName,
          date: resolvedDate,
          dispatch_state: 'staged',
          dispatched_at: null,
          dispatched_by_manager_user_id: null,
          ...routeSyncMetadata,
          sa_number: manifestMeta.sa_number || null,
          contractor_name: manifestMeta.contractor_name || null,
          source,
          total_stops: routeStops.length,
          completed_stops: 0,
          status: 'pending'
        })
        .select('id')
        .single();

      if (routeError) {
        const friendlyError = getManifestUploadError(routeError, {
          workAreaName: resolvedWorkAreaName,
          date: resolvedDate
        });
        const error = new Error(friendlyError || 'Failed to create route from manifest');
        error.statusCode = routeError?.code === '23505' ? 409 : 500;
        throw error;
      }

      routeId = routeRecord.id;
    }

    const stopInsertPayload = routeStops.map((stop) => ({
      route_id: routeId,
      sequence_order: stop.sequence,
      address: stop.address,
      address_line2: stop.address_line2 || null,
      contact_name: stop.contact_name || null,
      lat: stop.lat,
      lng: stop.lng,
      status: 'pending',
      is_pickup: Boolean(stop.is_pickup),
      is_business: Boolean(stop.is_business),
      has_note: Boolean(stop.warning),
      sid: stop.sid || null,
      ready_time: stop.ready_time || null,
      close_time: stop.close_time || null,
      has_time_commit: Boolean(stop.has_time_commit),
      stop_type: stop.type || 'delivery',
      has_pickup: Boolean(stop.has_pickup),
      has_delivery: stop.has_delivery !== false,
      geocode_source: stop.geocode_source || 'manifest',
      geocode_accuracy: stop.geocode_accuracy || 'manifest',
      notes: stop.warning ? stop.warning : null
    }));

    const { data: insertedStops, error: stopsError } = await supabase
      .from('stops')
      .insert(stopInsertPayload)
      .select('id, sequence_order');

    if (stopsError) {
      if (!mergedIntoExistingRoute) {
        await supabase.from('routes').delete().eq('id', routeId);
      }
      const error = new Error(getManifestSchemaError(stopsError) || 'Failed to save stops from manifest');
      error.statusCode = 500;
      throw error;
    }

    const stopIdBySequence = new Map(insertedStops.map((stop) => [stop.sequence_order, stop.id]));

    const packageInsertPayload = routeStops.flatMap((stop) => {
      const packageCount = Math.max(1, Number(stop.package_count || 1));
      const stopId = stopIdBySequence.get(stop.sequence);
      const packageKeyBase = stop.sid && stop.sid !== '0'
        ? `RR-${routeId.slice(0, 8)}-STOPID-${stopId}-SID-${stop.sid}`
        : `RR-${routeId.slice(0, 8)}-STOPID-${stopId}`;

      return Array.from({ length: packageCount }, (_, index) => ({
        stop_id: stopId,
        tracking_number: `${packageKeyBase}-${index + 1}`,
        requires_signature: false,
        hazmat: false
      }));
    });

    const { error: packagesError } = await supabase
      .from('packages')
      .insert(packageInsertPayload);

    if (packagesError) {
      if (!mergedIntoExistingRoute) {
        await supabase.from('routes').delete().eq('id', routeId);
      }
      const error = new Error('Failed to save package placeholders');
      error.statusCode = 500;
      throw error;
    }

    const deliveryCount = routeStops.filter((stop) => stop.type === 'delivery').length;
    const pickupCount = routeStops.filter((stop) => stop.type === 'pickup').length;
    const combinedCount = routeStops.filter((stop) => stop.type === 'combined').length;
    const timeCommitCount = routeStops.filter((stop) => stop.has_time_commit).length;
    const coordinateHealth = summarizeCoordinateHealth(routeStops);
    const coordinateIntegrity = detectSuspiciousCoordinateClusters(routeStops);

    if (coordinateIntegrity.suspicious_cluster_count > 0) {
      if (!mergedIntoExistingRoute) {
        await supabase.from('routes').delete().eq('id', routeId);
      }

      const error = new Error(
        'Manifest upload was blocked because too many different stop addresses collapsed onto the same map pin. Please re-check the manifest/GPX pair before dispatch.'
      );
      error.statusCode = 422;
      error.route_health = coordinateHealth;
      error.coordinate_integrity = coordinateIntegrity;
      throw error;
    }

    const insertedStopsForEnrichment = routeStops.map((stop) => ({
      ...stop,
      id: stopIdBySequence.get(stop.sequence)
    }));

    try {
      await bootstrapApartmentRecords(supabase, accountId, insertedStopsForEnrichment);
    } catch (apartmentError) {
      console.warn('Apartment intelligence bootstrap failed during manifest ingest:', apartmentError);
    }

    await recordRouteSyncEvent(supabase, {
      accountId,
      routeId,
      workDate: resolvedDate,
      eventType: mergedIntoExistingRoute ? 'manifest_updated' : 'manifest_staged',
      eventStatus:
        routeSyncMetadata?.sync_state === 'staged_changed'
          ? 'warning'
          : coordinateHealth.status === 'needs_pins'
            ? 'warning'
            : 'info',
      summary: mergedIntoExistingRoute
        ? `Manifest refreshed for route ${resolvedWorkAreaName}`
        : `Manifest staged for route ${resolvedWorkAreaName}`,
      details: {
        upload_mode: companionGpxFile ? 'spreadsheet_gpx' : manifestFormat,
        total_stops: routeStops.length,
        manifest_stop_count: routeSyncMetadata?.manifest_stop_count || routeStops.length,
        manifest_package_count: routeSyncMetadata?.manifest_package_count || packageInsertPayload.length,
        sync_state: routeSyncMetadata?.sync_state || null,
        auto_matched_driver: autoMatchedDriver,
        auto_matched_vehicle: autoMatchedVehicle,
        merged_into_existing_route: mergedIntoExistingRoute,
        coordinate_status: coordinateHealth.status
      },
      managerUserId
    });

    return {
      route_id: routeId,
      total_stops: routeStops.length,
      delivery_count: deliveryCount,
      pickup_count: pickupCount,
      combined_count: combinedCount,
      time_commit_count: timeCommitCount,
      merged_into_existing_route: mergedIntoExistingRoute,
      auto_matched_driver: autoMatchedDriver,
      ...(matchedDriverName ? { matched_driver_name: matchedDriverName } : {}),
      ...(unmatchedDriverName ? { unmatched_driver_name: unmatchedDriverName } : {}),
      auto_matched_vehicle: autoMatchedVehicle,
      manifest_meta: manifestMeta,
      geocoding: {
        status: geocodedManifest.summary.status,
        attempted: geocodedManifest.summary.attempted,
        geocoded: geocodedManifest.summary.geocoded,
        failed: geocodedManifest.summary.failed
      },
      route_health: coordinateHealth,
      coordinate_integrity: coordinateIntegrity,
      address_warnings: addressWarnings,
      manifest_stop_count: routeSyncMetadata?.manifest_stop_count || routeStops.length,
      manifest_package_count: routeSyncMetadata?.manifest_package_count || packageInsertPayload.length,
      sync_state: routeSyncMetadata?.sync_state || 'sync_pending'
    };
  }

  return {
    stageManifestArtifacts
  };
}

module.exports = {
  createManifestIngestService
};
