const crypto = require('crypto');
const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { requireDriver, requireManager } = require('../middleware/auth');
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
    .select('id, date, status, total_stops, completed_stops, completed_at')
    .eq('driver_id', driverId)
    .eq('account_id', accountId);

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

async function loadAuthorizedStop(supabase, { stopId, driverId, accountId }) {
  const { data, error } = await supabase
    .from('stops')
    .select(
      'id, route_id, sequence_order, address, status, completed_at, routes!inner(id, driver_id, account_id, total_stops, completed_stops, status)'
    )
    .eq('id', stopId)
    .eq('routes.driver_id', driverId)
    .eq('routes.account_id', accountId)
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
    .select('id, status, completed_stops, completed_at, driver_id, vehicle_id')
    .eq('account_id', accountId)
    .eq('date', date)
    .eq('work_area_name', workAreaName)
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
  return completedStops === 0 && !route.completed_at && route.status !== 'complete';
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

  router.post('/pull-fedex', requireManager, async (_req, res) => {
    return res.status(200).json({ message: 'FedEx Integrator approval pending' });
  });

  async function handleManifestUpload(req, res) {
    const { driver_id: requestedDriverId, vehicle_id: requestedVehicleId, date, work_area_name: workAreaName } = req.body || {};

    if (!req.file) {
      return res.status(400).json({ error: 'Manifest file is required' });
    }

    try {
      const manifestFormat = detectManifestFormat(req.file.buffer, req.file.originalname);

      if (manifestFormat === 'unknown') {
        return res.status(400).json({ error: 'Unsupported manifest file type. Use .xls, .xlsx, or .gpx.' });
      }

      const manifest =
        manifestFormat === 'xls'
          ? parseXLSManifest(req.file.buffer)
          : await parseGPXManifest(req.file.buffer);
      let parsedStops = manifest?.stops || [];
      let manifestMeta = manifest?.manifest_meta || {};

      const optionalGpxFile = req.files?.gpx_file || null;
      if (optionalGpxFile) {
        const gpxFormat = detectManifestFormat(optionalGpxFile.buffer, optionalGpxFile.originalname);

        if (gpxFormat !== 'gpx') {
          return res.status(400).json({ error: 'Optional companion file must be a .gpx file.' });
        }

        const gpxManifest = await parseGPXManifest(optionalGpxFile.buffer);
        parsedStops = mergeManifestStops(parsedStops, gpxManifest?.stops || []);
        manifestMeta = mergeManifestMeta(manifestMeta, gpxManifest?.manifest_meta || null);
      }

      if (!parsedStops.length) {
        return res.status(400).json({ error: 'No stops found in manifest file' });
      }

      const resolvedDate = date || manifestMeta.date;
      const resolvedWorkAreaName = String(workAreaName || manifestMeta.work_area_name || '').trim();
      let resolvedDriverId = requestedDriverId || null;
      let resolvedVehicleId = requestedVehicleId || null;
      let autoMatchedDriver = false;
      let autoMatchedVehicle = false;
      let unmatchedDriverName = null;
      let matchedDriverName = null;

      if (manifestFormat === 'xls') {
        if (!resolvedDate || !resolvedWorkAreaName) {
          return res.status(400).json({ error: 'Manifest is missing required date or work area information' });
        }

        const manifestDriverName = String(manifestMeta.driver_name || '').trim();
        const manifestVehicleNumber = String(manifestMeta.vehicle_number || '').trim();

        if (manifestDriverName) {
          const { data: drivers, error: driversError } = await supabase
            .from('drivers')
            .select('id, name')
            .eq('account_id', req.account.account_id);

          if (driversError) {
            console.error('Driver lookup failed during manifest upload:', driversError);
            return res.status(500).json({ error: 'Failed to match manifest driver' });
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
            .eq('account_id', req.account.account_id);

          if (vehiclesError) {
            console.error('Vehicle lookup failed during manifest upload:', vehiclesError);
            return res.status(500).json({ error: 'Failed to match manifest vehicle' });
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
      } else {
        if (!resolvedDriverId || !resolvedVehicleId || !resolvedDate || !resolvedWorkAreaName) {
          return res.status(400).json({ error: 'driver_id, vehicle_id, date, and work_area_name are required' });
        }
      }


      const manifestStops = parsedStops.map((stop) => ({
        ...stop,
        geocode_source: stop.geocode_source || 'manifest',
        geocode_accuracy: stop.geocode_accuracy || 'manifest'
      }));
      const addressWarnings = [];
      const correctedStops = await applyLocationCorrectionsToStops(
        supabase,
        req.account.account_id,
        manifestStops
      );
      const geocodedManifest = await enrichManifestStopsWithGeocoding(
        supabase,
        req.account.account_id,
        correctedStops
      );
      let routeStops = normalizeMergedStopSequences(geocodedManifest.stops);

      const { data: existingRoute, error: existingRouteError } = await loadExistingManifestRoute(supabase, {
        accountId: req.account.account_id,
        date: resolvedDate,
        workAreaName: resolvedWorkAreaName
      });

      if (existingRouteError) {
        console.error('Existing route lookup failed during manifest upload:', existingRouteError);
        return res.status(500).json({ error: 'Failed to check for an existing route before upload' });
      }

      let routeId = null;
      let mergedIntoExistingRoute = false;

      if (existingRoute) {
        if (!canReplaceExistingManifestRoute(existingRoute)) {
          return res.status(409).json({
            error: `Route ${resolvedWorkAreaName || 'this work area'} for ${resolvedDate || 'this date'} already exists and has already started. Open the existing route below instead of uploading the same manifest again.`
          });
        }

        const { data: existingStops, error: existingStopsError } = await supabase
          .from('stops')
          .select(
            'id, sequence_order, address, address_line2, contact_name, lat, lng, is_pickup, is_business, sid, ready_time, close_time, has_time_commit, stop_type, has_pickup, has_delivery, geocode_source, geocode_accuracy'
          )
          .eq('route_id', existingRoute.id)
          .order('sequence_order');

        if (existingStopsError) {
          console.error('Existing route stop lookup failed during manifest upload:', existingStopsError);
          return res.status(500).json({ error: 'Failed to load the existing route before applying the new manifest' });
        }
        const existingStopIds = (existingStops || []).map((stop) => stop.id);
        const packageCountByStopId = new Map();

        if (existingStopIds.length) {
          const { data: existingPackages, error: existingPackagesError } = await supabase
            .from('packages')
            .select('id, stop_id')
            .in('stop_id', existingStopIds);

          if (existingPackagesError) {
            console.error('Existing route package lookup failed during manifest upload:', existingPackagesError);
            return res.status(500).json({ error: 'Failed to load the existing route packages before applying the new manifest' });
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
            console.error('Existing route package cleanup failed during manifest upload:', deletePackagesError);
            return res.status(500).json({ error: 'Failed to clear the old package placeholders before applying the new manifest' });
          }
        }

        const { error: deleteStopsError } = await supabase
          .from('stops')
          .delete()
          .eq('route_id', existingRoute.id);

        if (deleteStopsError) {
          console.error('Existing route stop cleanup failed during manifest upload:', deleteStopsError);
          return res.status(500).json({ error: 'Failed to clear the old route stops before applying the new manifest' });
        }

        const { data: updatedRoute, error: updateRouteError } = await supabase
          .from('routes')
          .update({
            driver_id: resolvedDriverId,
            vehicle_id: resolvedVehicleId,
            sa_number: manifestMeta.sa_number || null,
            contractor_name: manifestMeta.contractor_name || null,
            source: 'manifest_upload',
            total_stops: routeStops.length,
            completed_stops: 0,
            status: 'pending'
          })
          .eq('id', existingRoute.id)
          .eq('account_id', req.account.account_id)
          .select('id')
          .single();

        if (updateRouteError) {
          console.error('Existing route update failed during manifest upload:', updateRouteError);
          return res.status(500).json({ error: 'Failed to update the existing route with the new manifest data' });
        }

        routeId = updatedRoute.id;
        mergedIntoExistingRoute = true;
      } else {
        const { data: routeRecord, error: routeError } = await supabase
          .from('routes')
          .insert({
            account_id: req.account.account_id,
            driver_id: resolvedDriverId,
            vehicle_id: resolvedVehicleId,
            work_area_name: resolvedWorkAreaName,
            date: resolvedDate,
            sa_number: manifestMeta.sa_number || null,
            contractor_name: manifestMeta.contractor_name || null,
            source: 'manifest_upload',
            total_stops: routeStops.length,
            completed_stops: 0,
            status: 'pending'
          })
          .select('id')
          .single();

        if (routeError) {
          console.error('Route creation failed:', routeError);
          const friendlyError = getManifestUploadError(routeError, {
            workAreaName: resolvedWorkAreaName,
            date: resolvedDate
          });
          return res.status(routeError?.code === '23505' ? 409 : 500).json({
            error: friendlyError || 'Failed to create route from manifest'
          });
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
        console.error('Stop insertion failed:', stopsError);
        if (!mergedIntoExistingRoute) {
          await supabase.from('routes').delete().eq('id', routeId);
        }
        return res.status(500).json({
          error: getManifestSchemaError(stopsError) || 'Failed to save stops from manifest',
          ...(process.env.NODE_ENV !== 'production'
            ? {
                debug: {
                  code: stopsError.code || null,
                  message: stopsError.message || null,
                  details: stopsError.details || null,
                  hint: stopsError.hint || null
                }
              }
            : {})
        });
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
        console.error('Package insertion failed:', packagesError);
        if (!mergedIntoExistingRoute) {
          await supabase.from('routes').delete().eq('id', routeId);
        }
        return res.status(500).json({ error: 'Failed to save package placeholders' });
      }

      const deliveryCount = routeStops.filter((stop) => stop.type === 'delivery').length;
      const pickupCount = routeStops.filter((stop) => stop.type === 'pickup').length;
      const combinedCount = routeStops.filter((stop) => stop.type === 'combined').length;
      const timeCommitCount = routeStops.filter((stop) => stop.has_time_commit).length;
      const coordinateHealth = summarizeCoordinateHealth(routeStops);
      const coordinateIntegrity = detectSuspiciousCoordinateClusters(routeStops);

      if (coordinateIntegrity.suspicious_cluster_count > 0) {
        console.error('Manifest upload rejected due to suspicious coordinate collapse:', {
          account_id: req.account.account_id,
          work_area_name: resolvedWorkAreaName,
          date: resolvedDate,
          suspicious_clusters: coordinateIntegrity.suspicious_clusters
        });

        if (!mergedIntoExistingRoute) {
          await supabase.from('routes').delete().eq('id', routeId);
        }

        return res.status(422).json({
          error: 'Manifest upload was blocked because too many different stop addresses collapsed onto the same map pin. Please re-check the manifest/GPX pair before dispatch.',
          route_health: coordinateHealth,
          coordinate_integrity: coordinateIntegrity
        });
      }

      const insertedStopsForEnrichment = routeStops.map((stop) => ({
        ...stop,
        id: stopIdBySequence.get(stop.sequence)
      }));

      try {
        await bootstrapApartmentRecords(supabase, req.account.account_id, insertedStopsForEnrichment);
      } catch (apartmentError) {
        console.warn('Apartment intelligence bootstrap failed during manifest upload:', apartmentError);
      }

      return res.status(201).json({
        route_id: routeId,
        total_stops: routeStops.length,
        delivery_count: deliveryCount,
        pickup_count: pickupCount,
        combined_count: combinedCount,
        time_commit_count: timeCommitCount,
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
        merged_into_existing_route: mergedIntoExistingRoute,
        route_health: coordinateHealth,
        address_warnings: addressWarnings
      });
    } catch (error) {
      console.error('Manifest upload failed:', error);
      const message = error?.message || 'Failed to upload manifest';

      if (/unsupported manifest file type/i.test(message)) {
        return res.status(400).json({ error: message });
      }

      return res.status(500).json({
        error: 'Failed to upload manifest',
        ...(process.env.NODE_ENV !== 'production'
          ? {
              debug: {
                message: error?.message || null,
                details: error?.details || null,
                hint: error?.hint || null,
                stack: error?.stack || null
              }
            }
          : {})
      });
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
      const { data: route, error: routeError } = await loadDriverRoute(supabase, {
        driverId: req.driver.driver_id,
        accountId: req.driver.account_id,
        date: getCurrentDateString()
      });

      if (routeError) {
        console.error('Today route lookup failed:', routeError);
        return res.status(500).json({ error: 'Failed to load today route' });
      }

      if (!route) {
        return res.status(200).json({ route: null });
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

      return res.status(200).json({
        route: {
          id: route.id,
          date: route.date,
          status: presentRouteStatus(route).status,
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
