const crypto = require('crypto');
const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { requireDriver, requireManager } = require('../middleware/auth');
const { createCliFedexFccAdapter } = require('../services/fccDownloader');
const { createFccProgressSyncService } = require('../services/fccProgressSync');
const { createFedexSyncService } = require('../services/fedexSync');
const { createManifestIngestService } = require('../services/manifestIngest');
const {
  detectManifestFormat,
  detectBusinessContact,
  detectApartmentUnitStop,
  detectSecondaryAddressType,
  extractUnitLikeValue,
  extractBuildingLabel,
  extractFloorLabel,
  inferLocationType,
  parseGPXManifest,
  parseXLSManifest
} = require('../services/manifestParser');
const { mergeManifestMeta, mergeManifestStops, normalizeMergedStopSequences } = require('../services/manifestMerge');
const {
  attachApartmentIntelligence,
  attachApartmentIntelligenceToStops,
  bootstrapApartmentRecords,
  confirmApartmentFloor
} = require('../services/apartmentIntelligence');
const { attachPropertyIntel, attachPropertyIntelToStops } = require('../services/propertyIntel');
const {
  applyLocationCorrectionsToStops,
  attachLocationCorrection,
  saveLocationCorrection
} = require('../services/locationCorrections');
const { enrichManifestStopsWithGeocoding } = require('../services/manifestGeocoding');
const { attachStopNotesToStops, loadStopNote, saveStopNote } = require('../services/stopNotes');
const {
  detectSuspiciousCoordinateClusters,
  isUsableCoordinate,
  normalizeCoordinatePair,
  summarizeCoordinateHealth
} = require('../services/coordinates');

function parseMultipartForm(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);

  if (!contentType.startsWith('multipart/form-data') || !boundaryMatch) {
    return res.status(400).json({ error: 'multipart/form-data with a boundary is required' });
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const chunks = [];

  req.on('data', (chunk) => {
    chunks.push(chunk);
  });

  req.on('end', () => {
    try {
      const bodyBuffer = Buffer.concat(chunks);
      const body = bodyBuffer.toString('latin1');
      const parts = body.split(boundary).slice(1, -1);
      const fields = {};
      let file = null;
      const files = {};

      for (const part of parts) {
        const trimmedPart = part.replace(/^\r\n/, '').replace(/\r\n$/, '');
        if (!trimmedPart) {
          continue;
        }

        const separatorIndex = trimmedPart.indexOf('\r\n\r\n');
        if (separatorIndex === -1) {
          continue;
        }

        const rawHeaders = trimmedPart.slice(0, separatorIndex);
        const rawContent = trimmedPart.slice(separatorIndex + 4);
        const disposition = rawHeaders.match(/name="([^"]+)"(?:; filename="([^"]+)")?/i);

        if (!disposition) {
          continue;
        }

        const fieldName = disposition[1];
        const filename = disposition[2];
        const content = rawContent.replace(/\r\n$/, '');

        if (filename) {
          const parsedFile = {
            fieldname: fieldName,
            originalname: filename,
            mimetype: (rawHeaders.match(/content-type:\s*([^\r\n]+)/i) || [])[1] || 'application/octet-stream',
            buffer: Buffer.from(content, 'latin1')
          };
          if (fieldName === 'file' || !file) {
            file = parsedFile;
          }
          files[fieldName] = parsedFile;
        } else {
          fields[fieldName] = content;
        }
      }

      req.body = fields;
      req.file = file;
      req.files = files;
      next();
    } catch (error) {
      next(error);
    }
  });

  req.on('error', (error) => {
    next(error);
  });
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(concurrency, items.length || 1);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

function getCurrentDateString(now = new Date(), timeZone = process.env.APP_TIME_ZONE || 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function getUtcTimestamp() {
  return new Date().toISOString();
}

function roundToSingleDecimal(value) {
  return Math.round(value * 10) / 10;
}

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

function getStopsPerHour({ completedStops, firstScan, currentTime }) {
  if (!completedStops || !firstScan) {
    return null;
  }

  const firstScanTime = new Date(firstScan).getTime();
  const currentTimeMs = currentTime.getTime();

  if (!Number.isFinite(firstScanTime) || currentTimeMs <= firstScanTime) {
    return null;
  }

  const hoursWorked = (currentTimeMs - firstScanTime) / (1000 * 60 * 60);

  if (hoursWorked <= 0) {
    return null;
  }

  return roundToSingleDecimal(completedStops / hoursWorked);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function createAddressHash(address) {
  return crypto
    .createHash('md5')
    .update(String(address || '').trim().toLowerCase())
    .digest('hex');
}

function normalizeRoadFlagType(flagType) {
  return 'hazard';
}

function normalizePackageRows(packages) {
  return (packages || []).map((pkg) => ({
    id: pkg.id,
    tracking_number: pkg.tracking_number,
    requires_signature: pkg.requires_signature,
    requires_adult_signature: pkg.requires_adult_signature,
    hazmat: pkg.hazmat
  }));
}

function getStoredStopStatus(status) {
  if (status === 'attempted' || status === 'pickup_complete' || status === 'pickup_attempted') {
    return 'delivered';
  }

  return status;
}

function getStoredRouteStatus(status, currentStatus) {
  if (status === 'complete') {
    return currentStatus || 'in_progress';
  }

  return status;
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

function presentRouteStatus(route) {
  if (!route) {
    return route;
  }

  const totalStops = Number(route.total_stops || 0);
  const completedStops = Number(route.completed_stops || 0);

  if (route.completed_at || (totalStops > 0 && completedStops >= totalStops)) {
    return {
      ...route,
      status: 'complete'
    };
  }

  return route;
}

function presentStopStatus(stop) {
  if (!stop) {
    return stop;
  }

  const derivedIsBusiness = detectBusinessContact(stop.contact_name, stop.address_line2, stop.stop_type);
  const secondaryAddressType = detectSecondaryAddressType(stop.address_line2);
  const unitLikeValue = extractUnitLikeValue(stop.address_line2);
  const buildingLabel = extractBuildingLabel(stop.address_line2);
  const floorLabel = extractFloorLabel(stop.address_line2);
  const enrichedStop = {
    ...stop,
    is_business:
      stop.is_business != null
        ? derivedIsBusiness
        : derivedIsBusiness,
    is_apartment_unit:
      stop.is_apartment_unit != null
        ? detectApartmentUnitStop({
            ...stop,
            is_business: derivedIsBusiness
          })
        : detectApartmentUnitStop({
            ...stop,
            is_business: derivedIsBusiness
          }),
    secondary_address_type: secondaryAddressType,
    unit_label: secondaryAddressType === 'unit' ? unitLikeValue : null,
    suite_label: secondaryAddressType === 'suite' ? unitLikeValue : null,
    building_label: buildingLabel,
    floor_label: floorLabel,
    location_type: inferLocationType({
      ...stop,
      is_business: derivedIsBusiness
    })
  };

  if (enrichedStop.status === 'attempted' || enrichedStop.status === 'pickup_attempted' || enrichedStop.status === 'pickup_complete') {
    return enrichedStop;
  }

  if (enrichedStop.is_pickup && enrichedStop.status === 'delivered') {
    return {
      ...enrichedStop,
      status: enrichedStop.exception_code ? 'pickup_attempted' : 'pickup_complete'
    };
  }

  if (enrichedStop.exception_code && enrichedStop.status === 'delivered' && !enrichedStop.delivery_type_code) {
    return {
      ...enrichedStop,
      status: 'attempted'
    };
  }

  return enrichedStop;
}

function getRouteCenterFromStops(stops) {
  const mappableStops = (stops || []).filter(
    (stop) => isUsableCoordinate(stop.lat, stop.lng)
  );

  if (!mappableStops.length) {
    return null;
  }

  const latitudeSum = mappableStops.reduce((sum, stop) => sum + Number(stop.lat), 0);
  const longitudeSum = mappableStops.reduce((sum, stop) => sum + Number(stop.lng), 0);

  return {
    lat: Number((latitudeSum / mappableStops.length).toFixed(6)),
    lng: Number((longitudeSum / mappableStops.length).toFixed(6))
  };
}

function decodeBase64Image(imageBase64) {
  const normalized = String(imageBase64 || '').trim();
  const cleaned = normalized.includes(',') ? normalized.split(',').pop() : normalized;
  return Buffer.from(cleaned, 'base64');
}

function isMissingBucketError(error) {
  const message = String(error?.message || error?.error || '');
  return /bucket/i.test(message) && /(not found|does not exist|missing)/i.test(message);
}

async function loadDriverRoute(supabase, { driverId, accountId, routeId, date }) {
  let query = supabase
    .from('routes')
    .select('id, date, work_area_name, status, dispatch_state, dispatched_at, sync_state, last_manifest_change_at, total_stops, completed_stops, completed_at')
    .eq('driver_id', driverId)
    .eq('account_id', accountId)
    .eq('dispatch_state', 'dispatched');

  if (routeId) {
    query = query.eq('id', routeId);
  }

  if (date) {
    query = query.eq('date', date);
  }

  query = query.order('date', { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();

  return { data, error };
}

async function loadDriverAssignedRoutePreview(supabase, { driverId, accountId, date }) {
  const { data, error } = await supabase
    .from('routes')
    .select(
      'id, date, work_area_name, status, dispatch_state, sync_state, last_manifest_sync_at, last_manifest_change_at, total_stops, completed_stops'
    )
    .eq('driver_id', driverId)
    .eq('account_id', accountId)
    .eq('date', date)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

async function loadAuthorizedStop(supabase, { stopId, driverId, accountId }) {
  const { data, error } = await supabase
    .from('stops')
    .select(
      'id, route_id, sequence_order, address, status, completed_at, routes!inner(id, driver_id, account_id, dispatch_state, total_stops, completed_stops, status)'
    )
    .eq('id', stopId)
    .eq('routes.driver_id', driverId)
    .eq('routes.account_id', accountId)
    .eq('routes.dispatch_state', 'dispatched')
    .maybeSingle();

  if (!data) {
    return { data: null, error };
  }

  const route = Array.isArray(data.routes) ? data.routes[0] : data.routes;

  return {
    data: {
      ...data,
      route
    },
    error
  };
}

async function loadExistingManifestRoute(supabase, { accountId, date, workAreaName }) {
  const { data, error } = await supabase
    .from('routes')
    .select('id, status, dispatch_state, completed_stops, completed_at, driver_id, vehicle_id, manifest_fingerprint, last_manifest_change_at')
    .eq('account_id', accountId)
    .eq('date', date)
    .eq('work_area_name', workAreaName)
    .is('archived_at', null)
    .maybeSingle();

  return { data, error };
}

function canReplaceExistingManifestRoute(route) {
  if (!route) {
    return false;
  }

  const completedStops = Number(route.completed_stops || 0);

  // Allow manifest refreshes until the route has actual worked-stop history.
  // Dispatch may mark a route in progress before any stops are completed.
  return completedStops === 0 && !route.completed_at && route.status !== 'complete' && route.dispatch_state !== 'dispatched';
}

function hasRouteChangedAfterDispatch(route) {
  if (!route?.dispatched_at || !route?.last_manifest_change_at) {
    return false;
  }

  return new Date(route.last_manifest_change_at).getTime() > new Date(route.dispatched_at).getTime();
}

function getPostDispatchChangePolicy(route) {
  if (!hasRouteChangedAfterDispatch(route)) {
    return {
      code: 'none',
      label: 'No post-dispatch change',
      tone: 'neutral',
      should_notify_driver: false,
      requires_manager_review: false
    };
  }

  const completedStops = Number(route?.completed_stops || 0);
  const hasStartedWork = completedStops > 0 || route?.status === 'in_progress' || route?.status === 'complete';

  if (hasStartedWork) {
    return {
      code: 'manager_review_required',
      label: 'Manager review required',
      tone: 'urgent',
      should_notify_driver: true,
      requires_manager_review: true
    };
  }

  return {
    code: 'driver_warning',
    label: 'Driver warning',
    tone: 'warning',
    should_notify_driver: true,
    requires_manager_review: false
  };
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

function createRoutesRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const nowProvider = options.now || (() => new Date());
  const inboundIngestSecret = options.inboundIngestSecret || process.env.FEDEX_INGEST_SHARED_SECRET || '';
  const manifestIngestService =
    options.manifestIngestService ||
    createManifestIngestService({
      supabase,
      now: nowProvider
    });
  const fccProgressSyncService =
    options.fccProgressSyncService ||
    createFccProgressSyncService({
      supabase,
      now: nowProvider
    });
  const fedexSyncService =
    options.fedexSyncService ||
    createFedexSyncService({
      supabase,
      now: nowProvider,
      manifestIngestService,
      fccProgressSyncService,
      adapter: options.fedexFccAdapter || createCliFedexFccAdapter()
    });

  router.post('/pull-fedex', requireManager, async (req, res) => {
    try {
      const result = await fedexSyncService.triggerManualSync({
        accountId: req.account.account_id,
        managerUserId: req.account.manager_user_id || null,
        workDate: req.body?.date || null
      });

      return res.status(202).json(result);
    } catch (error) {
      console.error('Manual FedEx sync trigger failed:', error);
      return res.status(500).json({ error: 'Failed to start FedEx sync' });
    }
  });

  router.post('/pull-fedex-progress', requireManager, async (req, res) => {
    try {
      const result = await fedexSyncService.syncRouteProgress({
        accountId: req.account.account_id,
        managerUserId: req.account.manager_user_id || null,
        workDate: req.body?.date || null
      });

      return res.status(202).json(result);
    } catch (error) {
      console.error('Manual FedEx progress sync trigger failed:', error);
      return res.status(500).json({ error: 'Failed to start FedEx progress sync' });
    }
  });

  router.post('/receive-fedex-manifest', parseMultipartForm, async (req, res) => {
    if (!inboundIngestSecret) {
      return res.status(503).json({ error: 'Inbound FedEx ingest is not configured on this server yet.' });
    }

    const providedSecret = String(req.headers['x-readyroute-ingest-secret'] || '').trim();

    if (!providedSecret || providedSecret !== inboundIngestSecret) {
      return res.status(403).json({ error: 'Invalid inbound ingest secret.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Manifest file is required' });
    }

    try {
      const result = await fedexSyncService.receiveInboundManifestDelivery({
        connectionReference: String(req.body?.connection_reference || '').trim() || null,
        accountNumber: String(req.body?.account_number || '').trim() || null,
        manifestFile: req.file,
        companionGpxFile: req.files?.gpx_file || null,
        workDate: String(req.body?.date || '').trim() || null,
        workAreaName: String(req.body?.work_area_name || '').trim() || null,
        driverId: String(req.body?.driver_id || '').trim() || null,
        vehicleId: String(req.body?.vehicle_id || '').trim() || null
      });

      return res.status(202).json(result);
    } catch (error) {
      console.error('Inbound FedEx manifest ingest failed:', error);
      return res.status(Number(error?.statusCode || 500)).json({
        error: error?.message || 'Failed to ingest inbound FedEx manifest',
        ...(error?.run ? { run: error.run } : {})
      });
    }
  });

  async function handleManifestUpload(req, res) {
    const { driver_id: requestedDriverId, vehicle_id: requestedVehicleId, date, work_area_name: workAreaName } = req.body || {};

    if (!req.file) {
      return res.status(400).json({ error: 'Manifest file is required' });
    }

    try {
      const result = await manifestIngestService.stageManifestArtifacts({
        accountId: req.account.account_id,
        managerUserId: req.account.manager_user_id || null,
        manifestFile: req.file,
        companionGpxFile: req.files?.gpx_file || null,
        requestedDriverId,
        requestedVehicleId,
        requestedDate: date,
        requestedWorkAreaName: workAreaName,
        source: 'manifest_upload'
      });

      return res.status(201).json(result);
    } catch (error) {
      console.error('Manifest upload failed:', error);
      const statusCode = Number(error?.statusCode || 500);
      const message = error?.message || 'Failed to upload manifest';
      const response = { error: message };

      if (error?.route_health) {
        response.route_health = error.route_health;
      }

      if (error?.coordinate_integrity) {
        response.coordinate_integrity = error.coordinate_integrity;
      }

      if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
        response.debug = {
          message: error?.message || null,
          details: error?.details || null,
          hint: error?.hint || null,
          stack: error?.stack || null
        };
      }

      return res.status(statusCode).json(response);
    }
  }

  router.post('/upload-manifest', requireManager, parseMultipartForm, handleManifestUpload);
  router.post('/upload-gpx', requireManager, parseMultipartForm, handleManifestUpload);

  router.patch('/:route_id/assign', requireManager, async (req, res) => {
    const routeId = req.params.route_id;
    const { driver_id: driverId, vehicle_id: vehicleId } = req.body || {};

    if (driverId === undefined && vehicleId === undefined) {
      return res.status(400).json({ error: 'driver_id or vehicle_id is required' });
    }

    try {
      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('id, account_id, driver_id, vehicle_id, work_area_name, total_stops, completed_stops, status')
        .eq('id', routeId)
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (routeError) {
        console.error('Route assignment lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load route for assignment' });
      }

      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }

      if (driverId) {
        const { data: driver, error: driverError } = await supabase
          .from('drivers')
          .select('id')
          .eq('id', driverId)
          .eq('account_id', req.account.account_id)
          .eq('is_active', true)
          .maybeSingle();

        if (driverError) {
          console.error('Route assignment driver lookup failed:', driverError);
          return res.status(500).json({ error: 'Failed to validate driver assignment' });
        }

        if (!driver) {
          return res.status(400).json({ error: 'Driver is not available for this account' });
        }
      }

      if (vehicleId) {
        const { data: vehicle, error: vehicleError } = await supabase
          .from('vehicles')
          .select('id')
          .eq('id', vehicleId)
          .eq('account_id', req.account.account_id)
          .maybeSingle();

        if (vehicleError) {
          console.error('Route assignment vehicle lookup failed:', vehicleError);
          return res.status(500).json({ error: 'Failed to validate vehicle assignment' });
        }

        if (!vehicle) {
          return res.status(400).json({ error: 'Vehicle is not available for this account' });
        }
      }

      const updatePayload = {};

      if (driverId !== undefined) {
        updatePayload.driver_id = driverId || null;
      }

      if (vehicleId !== undefined) {
        updatePayload.vehicle_id = vehicleId || null;
      }

      const { data: updatedRoute, error: updateError } = await supabase
        .from('routes')
        .update(updatePayload)
        .eq('id', routeId)
        .select('id, driver_id, vehicle_id, work_area_name, total_stops, completed_stops, status')
        .single();

      if (updateError) {
        console.error('Route assignment update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update route assignment' });
      }

      return res.status(200).json({ route: updatedRoute });
    } catch (error) {
      console.error('Route assignment endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update route assignment' });
    }
  });


  router.get('/status-codes', requireDriver, async (_req, res) => {
    try {
      const { data: codes, error } = await supabase
        .from('fedex_status_codes')
        .select(
          'id, code, description, category, category_label, affects_service_score, requires_warning, is_pickup_code, created_at'
        )
        .order('category')
        .order('code');

      if (error) {
        console.error('Status code lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load FedEx status codes' });
      }

      return res.status(200).json({ codes: codes || [] });
    } catch (error) {
      console.error('Status code endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load FedEx status codes' });
    }
  });

  router.get('/today', requireDriver, async (req, res) => {
    try {
      const currentDate = getCurrentDateString();
      const { data: route, error: routeError } = await loadDriverRoute(supabase, {
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id,
        date: currentDate
      });

      if (routeError) {
        console.error('Today route lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load today route' });
      }

      if (!route) {
        const { data: stagedRoute, error: stagedRouteError } = await loadDriverAssignedRoutePreview(supabase, {
          driverId: req.driver.driver_id,
          accountId: req.driver.account_id,
          date: currentDate
        });

        if (stagedRouteError) {
          console.error('Today staged route lookup failed:', stagedRouteError);
          return res.status(500).json({ error: 'Failed to load driver dispatch status' });
        }

        return res.status(200).json({
          route: null,
          driver_day: stagedRoute
            ? {
                status: 'awaiting_dispatch',
                route_preview: {
                  id: stagedRoute.id,
                  date: stagedRoute.date,
                  work_area_name: stagedRoute.work_area_name,
                  total_stops: Number(stagedRoute.total_stops || 0),
                  completed_stops: Number(stagedRoute.completed_stops || 0),
                  sync_state: stagedRoute.sync_state || 'sync_pending',
                  dispatch_state: stagedRoute.dispatch_state || 'staged',
                  last_manifest_sync_at: stagedRoute.last_manifest_sync_at || null,
                  last_manifest_change_at: stagedRoute.last_manifest_change_at || null
                }
              }
            : {
                status: 'unassigned'
              }
        });
      }

      const { data: stops, error: stopsError } = await supabase
        .from('stops')
        .select(
          'id, route_id, sequence_order, address, contact_name, address_line2, sid, ready_time, close_time, has_time_commit, stop_type, has_pickup, has_delivery, is_business, has_note, geocode_source, geocode_accuracy, lat, lng, status, exception_code, delivery_type_code, signer_name, signature_url, age_confirmed, is_pickup, pod_photo_url, pod_signature_url, scanned_at, completed_at'
        )
        .eq('route_id', route.id)
        .order('sequence_order');

      if (stopsError) {
        console.error('Today stop lookup failed:', stopsError);
        return res.status(500).json({ error: 'Failed to load route stops' });
      }

      const stopIds = (stops || []).map((stop) => stop.id);
      let packagesByStopId = new Map();

      if (stopIds.length > 0) {
        const { data: packages, error: packagesError } = await supabase
          .from('packages')
          .select('id, stop_id, tracking_number, requires_signature, requires_adult_signature, hazmat')
          .in('stop_id', stopIds)
          .order('id');

        if (packagesError) {
          console.error('Today package lookup failed:', packagesError);
          return res.status(500).json({ error: 'Failed to load route packages' });
        }

        packagesByStopId = (packages || []).reduce((map, pkg) => {
          const current = map.get(pkg.stop_id) || [];
          current.push({
            id: pkg.id,
            tracking_number: pkg.tracking_number,
            requires_signature: pkg.requires_signature,
            hazmat: pkg.hazmat
          });
          map.set(pkg.stop_id, current);
          return map;
        }, new Map());
      }

      const notedStops = await attachStopNotesToStops(
        supabase,
        req.driver.account_id,
        (stops || []).map((stop) => presentStopStatus({
          ...stop,
          packages: normalizePackageRows(packagesByStopId.get(stop.id))
        })),
        createAddressHash
      );
      const correctedStops = await applyLocationCorrectionsToStops(
        supabase,
        req.driver.account_id,
        notedStops
      );
      const apartmentStops = await attachApartmentIntelligenceToStops(
        supabase,
        req.driver.account_id,
        correctedStops
      );
      const routeStops = await attachPropertyIntelToStops(
        supabase,
        req.driver?.account_id || req.account?.account_id,
        apartmentStops
      );
      const postDispatchChangePolicy = getPostDispatchChangePolicy(route);

      return res.status(200).json({
        route: {
          id: route.id,
          date: route.date,
          work_area_name: route.work_area_name || null,
          status: presentRouteStatus(route).status,
          dispatch_state: route.dispatch_state || 'dispatched',
          dispatched_at: route.dispatched_at || null,
          sync_state: route.sync_state || 'staged_stable',
          last_manifest_change_at: route.last_manifest_change_at || null,
          manifest_changed_after_dispatch: hasRouteChangedAfterDispatch(route),
          post_dispatch_change_policy: postDispatchChangePolicy,
          total_stops: Number(route.total_stops || 0),
          completed_stops: Number(route.completed_stops || 0),
          stops_per_hour: getStopsPerHour({
            completedStops: Number(route.completed_stops || 0),
            firstScan: (stops || [])
              .filter((stop) => stop.completed_at)
              .reduce((earliest, stop) => {
                if (!earliest) {
                  return stop.completed_at;
                }

                return new Date(stop.completed_at).getTime() < new Date(earliest).getTime()
                  ? stop.completed_at
                  : earliest;
              }, null),
            currentTime: new Date()
          }),
          stops: routeStops,
          coordinate_recovery: {
            attempted: 0,
            recovered: 0,
            unresolved: 0,
            status: 'disabled'
          }
        },
        driver_day: {
          status: 'dispatched',
          manifest_changed_after_dispatch: hasRouteChangedAfterDispatch(route),
          post_dispatch_change_policy: postDispatchChangePolicy,
          dispatched_at: route.dispatched_at || null,
          last_manifest_change_at: route.last_manifest_change_at || null
        }
      });
    } catch (error) {
      console.error('Today route endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load today route' });
    }
  });

  router.post('/position', requireDriver, async (req, res) => {
    const { lat, lng, route_id: routeId } = req.body || {};
    const parsedLat = toNumber(lat);
    const parsedLng = toNumber(lng);
    const coordinates = normalizeCoordinatePair(parsedLat, parsedLng);

    if (!coordinates || !routeId) {
      return res.status(400).json({ error: 'lat, lng, and route_id are required' });
    }

    try {
      const { data: route, error: routeError } = await loadDriverRoute(supabase, {
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id,
        routeId
      });

      if (routeError) {
        console.error('Driver route lookup for position failed:', routeError);
        return res.status(500).json({ error: 'Failed to validate driver route' });
      }

      if (!route) {
        return res.status(403).json({ error: 'Route not assigned to this driver' });
      }

      const { error: insertError } = await supabase
        .from('driver_positions')
        .insert({
          route_id: routeId,
          driver_id: req.driver.driver_id,
          account_id: req.driver.account_id,
          lat: coordinates.lat,
          lng: coordinates.lng
        });

      if (insertError) {
        console.error('Driver position insert failed:', insertError);
        return res.status(500).json({ error: 'Failed to save driver position' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Driver position endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save driver position' });
    }
  });

  router.patch('/:route_id/status', requireDriver, async (req, res) => {
    const routeId = req.params.route_id;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    try {
      const { data: route, error: routeError } = await loadDriverRoute(supabase, {
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id,
        routeId
      });

      if (routeError) {
        console.error('Route status lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to validate driver route' });
      }

      if (!route) {
        return res.status(403).json({ error: 'Route not assigned to this driver' });
      }

      const { error: updateError } = await supabase
        .from('routes')
        .update({ status })
        .eq('id', routeId);

      if (updateError) {
        console.error('Route status update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update route status' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Route status endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update route status' });
    }
  });

  router.get('/stops/:stop_id', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('Stop detail lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to load stop detail' });
      }

      if (!stop) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      const { data: stopRecord, error: recordError } = await supabase
        .from('stops')
        .select(
          'id, route_id, sequence_order, address, contact_name, address_line2, sid, ready_time, close_time, has_time_commit, stop_type, has_pickup, has_delivery, lat, lng, status, notes, exception_code, delivery_type_code, signer_name, signature_url, age_confirmed, is_pickup, pod_photo_url, pod_signature_url, scanned_at, completed_at'
        )
        .eq('id', stopId)
        .maybeSingle();

      if (recordError) {
        console.error('Stop record detail lookup failed:', recordError);
        return res.status(500).json({ error: 'Failed to load stop detail' });
      }

      const { data: packages, error: packagesError } = await supabase
        .from('packages')
        .select('id, stop_id, tracking_number, requires_signature, requires_adult_signature, hazmat')
        .eq('stop_id', stopId)
        .order('id');

      if (packagesError) {
        console.error('Stop detail package lookup failed:', packagesError);
        return res.status(500).json({ error: 'Failed to load stop packages' });
      }

      let noteRecord = null;

      try {
        noteRecord = await loadStopNote(supabase, req.driver.account_id, stopRecord, createAddressHash);
      } catch (noteError) {
        console.error('Stop detail note lookup failed:', noteError);
        return res.status(500).json({ error: 'Failed to load stop notes' });
      }

      const { data: siblingStops, error: siblingStopsError } = await supabase
        .from('stops')
        .select('id, route_id, sequence_order, address, contact_name, address_line2, status, notes')
        .eq('route_id', stopRecord.route_id)
        .order('sequence_order');

      if (siblingStopsError) {
        console.error('Stop detail sibling lookup failed:', siblingStopsError);
        return res.status(500).json({ error: 'Failed to load nearby stop context' });
      }

      const enrichedStop = await attachApartmentIntelligence(
        supabase,
        req.driver.account_id,
        await attachLocationCorrection(supabase, req.driver.account_id, presentStopStatus({
          ...stopRecord,
          packages: normalizePackageRows(packages),
          note_text: noteRecord?.note_text || null
        }))
      );

      const enrichedSiblings = await attachApartmentIntelligenceToStops(
        supabase,
        req.driver.account_id,
        (siblingStops || []).filter((siblingStop) => siblingStop.id !== stopId)
      );

      return res.status(200).json({
        stop: await attachPropertyIntel(
          supabase,
          req.driver?.account_id || req.account?.account_id,
          enrichedStop,
          enrichedSiblings
        )
      });
    } catch (error) {
      console.error('Stop detail endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load stop detail' });
    }
  });

  router.patch('/stops/:stop_id/confirm-floor', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;
    const actualFloor = Number(req.body?.actual_floor);

    if (!Number.isInteger(actualFloor) || actualFloor <= 0) {
      return res.status(400).json({ error: 'actual_floor must be a positive whole number' });
    }

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('Apartment floor authorization lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop assignment' });
      }

      if (!stop) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      const { data: stopRecord, error: recordError } = await supabase
        .from('stops')
        .select('id, address, address_line2, contact_name, is_business')
        .eq('id', stopId)
        .maybeSingle();

      if (recordError) {
        console.error('Apartment floor stop lookup failed:', recordError);
        return res.status(500).json({ error: 'Failed to load stop detail' });
      }

      if (!stopRecord || !detectApartmentUnitStop(stopRecord)) {
        return res.status(400).json({ error: 'This stop is not marked as an apartment or unit delivery' });
      }

      const apartmentIntelligence = await confirmApartmentFloor(
        supabase,
        req.driver.account_id,
        stopRecord,
        actualFloor
      );

      return res.status(200).json({
        ok: true,
        apartment_intelligence: apartmentIntelligence
      });
    } catch (error) {
      console.error('Apartment floor confirmation failed:', error);
      return res.status(500).json({ error: 'Failed to confirm apartment floor' });
    }
  });

  router.patch('/stops/:stop_id/correct-location', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;
    const parsedLat = toNumber(req.body?.lat);
    const parsedLng = toNumber(req.body?.lng);
    const label = req.body?.label;
    const coordinates = normalizeCoordinatePair(parsedLat, parsedLng);

    if (!coordinates) {
      return res.status(400).json({ error: 'lat and lng are required' });
    }

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('Location correction authorization lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop assignment' });
      }

      if (!stop) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      const { data: stopRecord, error: recordError } = await supabase
        .from('stops')
        .select('id, address, address_line2')
        .eq('id', stopId)
        .maybeSingle();

      if (recordError) {
        console.error('Location correction stop lookup failed:', recordError);
        return res.status(500).json({ error: 'Failed to load stop detail' });
      }

      const correction = await saveLocationCorrection(
        supabase,
        req.driver.account_id,
        req.driver.driver_id,
        stopRecord,
        {
          lat: coordinates.lat,
          lng: coordinates.lng,
          label
        }
      );

      const { error: updateError } = await supabase
        .from('stops')
        .update({
          lat: coordinates.lat,
          lng: coordinates.lng,
          geocode_source: 'driver_verified',
          geocode_accuracy: 'point'
        })
        .eq('id', stopId);

      if (updateError) {
        console.error('Stop location correction update failed:', updateError);
        return res.status(500).json({ error: 'Failed to save corrected location on stop' });
      }

      return res.status(200).json({
        ok: true,
        location_correction: correction
      });
    } catch (error) {
      console.error('Location correction failed:', error);
      return res.status(500).json({ error: 'Failed to save corrected stop location' });
    }
  });

  router.patch('/stops/:stop_id/complete', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;
    const {
      status,
      exception_code: exceptionCode,
      pod_photo_url: podPhotoUrl,
      pod_signature_url: podSignatureUrl,
      scanned_at: scannedAt,
      delivery_type_code: deliveryTypeCode,
      signer_name: signerName,
      age_confirmed: ageConfirmed
    } = req.body || {};

    const allowedStatuses = new Set(['delivered', 'attempted', 'pickup_complete', 'pickup_attempted', 'incomplete']);

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    if (!allowedStatuses.has(status)) {
      return res.status(400).json({ error: 'status must be delivered, attempted, pickup_complete, pickup_attempted, or incomplete' });
    }

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('Authorized stop lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop assignment' });
      }

      if (!stop || !stop.route) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      const completedAt = getUtcTimestamp();
      const storedStatus = getStoredStopStatus(status);
      const stopUpdate = {
        status: storedStatus,
        exception_code: exceptionCode || null,
        completed_at: completedAt
      };

      if (deliveryTypeCode !== undefined) {
        stopUpdate.delivery_type_code = deliveryTypeCode || null;
      }

      if (signerName !== undefined) {
        stopUpdate.signer_name = signerName || null;
      }

      if (podSignatureUrl !== undefined) {
        stopUpdate.signature_url = podSignatureUrl || null;
        stopUpdate.pod_signature_url = podSignatureUrl || null;
      }

      if (typeof ageConfirmed === 'boolean') {
        stopUpdate.age_confirmed = ageConfirmed;
      }

      if (podPhotoUrl !== undefined) {
        stopUpdate.pod_photo_url = podPhotoUrl || null;
      }

      if (scannedAt !== undefined) {
        stopUpdate.scanned_at = scannedAt || null;
      }

      const { error: updateStopError } = await supabase
        .from('stops')
        .update(stopUpdate)
        .eq('id', stopId);

      if (updateStopError) {
        console.error('Stop completion update failed:', updateStopError);
        return res.status(500).json({ error: 'Failed to update stop' });
      }

      const alreadyCounted = Boolean(stop.completed_at);
      const nextCompletedStops = alreadyCounted
        ? stop.route.completed_stops
        : Number(stop.route.completed_stops || 0) + 1;

      const routeUpdate = {
        completed_stops: nextCompletedStops
      };

      if (Number(stop.route.total_stops || 0) > 0 && nextCompletedStops >= Number(stop.route.total_stops)) {
        routeUpdate.status = getStoredRouteStatus('complete', stop.route.status);
        routeUpdate.completed_at = completedAt;
      }

      const { error: updateRouteError } = await supabase
        .from('routes')
        .update(routeUpdate)
        .eq('id', stop.route.id);

      if (updateRouteError) {
        console.error('Route completion update failed:', updateRouteError);
        return res.status(500).json({ error: 'Failed to update route progress' });
      }

      const { data: nextStop, error: nextStopError } = await supabase
        .from('stops')
        .select('id, route_id, sequence_order, address, lat, lng, status')
        .eq('route_id', stop.route.id)
        .eq('status', 'pending')
        .gt('sequence_order', stop.sequence_order)
        .order('sequence_order')
        .limit(1)
        .maybeSingle();

      if (nextStopError) {
        console.error('Next stop lookup failed:', nextStopError);
        return res.status(500).json({ error: 'Failed to load next stop' });
      }

      return res.status(200).json({ next_stop: nextStop || null });
    } catch (error) {
      console.error('Stop completion endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to complete stop' });
    }
  });

  router.post('/stops/:stop_id/pod-photo', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;
    const { image_base64: imageBase64 } = req.body || {};

    if (!imageBase64) {
      return res.status(400).json({ error: 'image_base64 is required' });
    }

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('POD photo stop lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop assignment' });
      }

      if (!stop) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      const filePath = `${req.driver.account_id}/${req.driver.driver_id}/${stopId}-${Date.now()}.jpg`;
      const imageBuffer = decodeBase64Image(imageBase64);
      const { error: uploadError } = await supabase.storage
        .from('pod-photos')
        .upload(filePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('POD photo upload failed:', uploadError);
        return res.status(500).json({ error: 'Failed to upload proof of delivery photo' });
      }

      const { data: publicUrlData } = supabase.storage
        .from('pod-photos')
        .getPublicUrl(filePath);

      return res.status(201).json({
        ok: true,
        pod_photo_url: publicUrlData.publicUrl
      });
    } catch (error) {
      console.error('POD photo endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to upload proof of delivery photo' });
    }
  });

  router.post('/stops/:stop_id/signature', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;
    const {
      image_base64: imageBase64,
      signer_name: signerName,
      age_confirmed: ageConfirmed
    } = req.body || {};

    if (!imageBase64 || !signerName) {
      return res.status(400).json({ error: 'image_base64 and signer_name are required' });
    }

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('Signature stop lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop assignment' });
      }

      if (!stop) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      const filePath = `${req.driver.account_id}/${req.driver.driver_id}/${stopId}-sig-${Date.now()}.jpg`;
      const imageBuffer = decodeBase64Image(imageBase64);
      const { error: uploadError } = await supabase.storage
        .from('signatures')
        .upload(filePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Signature upload failed:', uploadError);

        if (isMissingBucketError(uploadError)) {
          return res.status(500).json({ error: 'Supabase Storage bucket "signatures" does not exist. Create it before uploading signatures.' });
        }

        return res.status(500).json({ error: 'Failed to upload signature image' });
      }

      const { data: publicUrlData } = supabase.storage
        .from('signatures')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('stops')
        .update({
          signature_url: publicUrlData.publicUrl,
          signer_name: signerName,
          age_confirmed: typeof ageConfirmed === 'boolean' ? ageConfirmed : false,
          pod_signature_url: publicUrlData.publicUrl
        })
        .eq('id', stopId);

      if (updateError) {
        console.error('Signature stop update failed:', updateError);
        return res.status(500).json({ error: 'Failed to save signature data on stop record' });
      }

      return res.status(201).json({
        ok: true,
        signature_url: publicUrlData.publicUrl
      });
    } catch (error) {
      console.error('Signature endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to upload signature image' });
    }
  });

  router.post('/stops/:stop_id/flag-road', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;
    const {
      lat_start: latStart,
      lng_start: lngStart,
      lat_end: latEnd,
      lng_end: lngEnd,
      flag_type: flagType,
      notes
    } = req.body || {};

    const parsedLatStart = toNumber(latStart);
    const parsedLngStart = toNumber(lngStart);
    const parsedLatEnd = toNumber(latEnd);
    const parsedLngEnd = toNumber(lngEnd);

    if (
      !isFiniteNumber(parsedLatStart) ||
      !isFiniteNumber(parsedLngStart) ||
      !isFiniteNumber(parsedLatEnd) ||
      !isFiniteNumber(parsedLngEnd) ||
      !flagType
    ) {
      return res.status(400).json({
        error: 'lat_start, lng_start, lat_end, lng_end, and flag_type are required'
      });
    }

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('Road flag stop lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop assignment' });
      }

      if (!stop) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      const { data: insertedRule, error: insertError } = await supabase
        .from('road_rules')
        .insert({
          account_id: req.driver.account_id,
          lat_start: parsedLatStart,
          lng_start: parsedLngStart,
          lat_end: parsedLatEnd,
          lng_end: parsedLngEnd,
          flag_type: normalizeRoadFlagType(flagType),
          notes: notes || `Driver-selected flag: ${flagType}`
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Road flag insert failed:', insertError);
        return res.status(500).json({ error: 'Failed to flag road segment' });
      }

      return res.status(201).json({ ok: true, rule_id: insertedRule.id });
    } catch (error) {
      console.error('Road flag endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to flag road segment' });
    }
  });

  router.patch('/stops/:stop_id/note', requireDriver, async (req, res) => {
    const stopId = req.params.stop_id;
    const { note_text: noteText } = req.body || {};
    const normalizedNoteText = String(noteText || '').trim();

    try {
      const { data: stop, error: stopError } = await loadAuthorizedStop(supabase, {
        stopId,
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id
      });

      if (stopError) {
        console.error('Stop note lookup failed:', stopError);
        return res.status(500).json({ error: 'Failed to validate stop assignment' });
      }

      if (!stop) {
        return res.status(403).json({ error: 'Stop not assigned to this driver' });
      }

      try {
        await saveStopNote(supabase, req.driver.account_id, stop, normalizedNoteText, createAddressHash);
      } catch (noteSaveError) {
        console.error('Stop note save failed:', noteSaveError);
        return res.status(500).json({ error: 'Failed to save stop note' });
      }

      const { error: stopUpdateError } = await supabase
        .from('stops')
        .update({ has_note: Boolean(normalizedNoteText) })
        .eq('id', stopId);

      if (stopUpdateError) {
        console.error('Stop has_note update failed:', stopUpdateError);
        return res.status(500).json({ error: 'Failed to save stop note' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Stop note endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save stop note' });
    }
  });

  return router;
}

module.exports = createRoutesRouter();
module.exports.createRoutesRouter = createRoutesRouter;
