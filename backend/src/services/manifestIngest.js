const crypto = require('crypto');

const {
  detectManifestFormat,
  parseGPXManifest,
  parseXLSManifest
} = require('./manifestParser');
const { mergeManifestMeta, mergeManifestStops, normalizeMergedStopSequences } = require('./manifestMerge');
const { namesLookLikeMatch, normalizeRouteWorkAreaName } = require('./routeIdentity');
const { bootstrapApartmentRecords } = require('./apartmentIntelligence');
const { applyLocationCorrectionsToStops } = require('./locationCorrections');
const { enrichManifestStopsWithGeocoding } = require('./manifestGeocoding');
const { recordBillableManifestImport } = require('./routeBilling');
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

function canRetryPackageInsertWithoutDetailColumns(error) {
  const message = String(error?.message || error?.details || error?.hint || '');
  return (
    /service_code/i.test(message) ||
    /schema cache/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /could not find the .*column/i.test(message)
  );
}

function stripOptionalPackageDetailColumns(packageRows = []) {
  return (packageRows || []).map(({ service_code, ...row }) => row);
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
    .select('id, work_area_name, status, dispatch_state, dispatched_at, dispatched_by_manager_user_id, completed_stops, completed_at, driver_id, vehicle_id, manifest_fingerprint, last_manifest_change_at')
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

  return route.dispatch_state !== 'dispatched' && !route.completed_at;
}

function isWorkedStopStatus(status) {
  return Boolean(status && status !== 'pending');
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

async function recordManifestImportForBilling(input) {
  try {
    return await recordBillableManifestImport(input);
  } catch (error) {
    console.warn('Route billing ledger record failed after manifest import:', error);
    return null;
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

function getManifestStopSid(stop) {
  const sid = String(stop?.sid || '').trim();
  return sid && sid !== '0' ? sid : null;
}

function buildDuplicateManifestSidSet(...stopGroups) {
  const sidCounts = new Map();

  for (const stops of stopGroups) {
    for (const stop of stops || []) {
      const sid = getManifestStopSid(stop);
      if (!sid) {
        continue;
      }

      sidCounts.set(sid, (sidCounts.get(sid) || 0) + 1);
    }
  }

  return new Set(
    [...sidCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([sid]) => sid)
  );
}

function buildPendingManifestStopKeyWithDuplicateSids(stop, fallbackKey, duplicateSids = new Set()) {
  const sid = getManifestStopSid(stop);

  if (sid && !duplicateSids.has(sid)) {
    return `sid:${sid}`;
  }

  const hasPickup = Boolean(stop?.has_pickup || stop?.is_pickup || stop?.type === 'pickup' || stop?.stop_type === 'pickup' || stop?.type === 'combined' || stop?.stop_type === 'combined');
  const hasDelivery = stop?.has_delivery !== false && stop?.type !== 'pickup' && stop?.stop_type !== 'pickup';
  const scope = hasDelivery ? 'delivery' : hasPickup ? 'pickup' : 'generic';
  const addressAlias = hasDelivery
    ? buildStopAddressAlias(stop, 'delivery-address')
    : hasPickup
      ? buildStopAddressAlias(stop, 'pickup-address')
      : buildStopAddressAlias(stop);

  return addressAlias ? `${scope}:${addressAlias}` : fallbackKey;
}

function normalizeStopStreetAlias(value) {
  return normalizeComparisonValue(value)
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bdrive\b/g, 'dr')
    .replace(/\bplace\b/g, 'pl')
    .replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct')
    .replace(/\bboulevard\b/g, 'blvd')
    .replace(/\bparkway\b/g, 'pkwy')
    .replace(/\bbl\b/g, 'blvd')
    .replace(/^(\d+)\s*-\s*\d+\b/, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildStopAddressAlias(stop, slice = '') {
  const streetCandidate = String(stop?.address_line1 || stop?.address || '')
    .split(',')[0]
    .trim();
  const includeSecondary = slice !== 'pickup-address';
  const normalizedAddress = normalizeStopStreetAlias(
    includeSecondary
      ? [streetCandidate, stop?.address_line2 || ''].filter(Boolean).join(' ')
      : streetCandidate
  );

  if (!normalizedAddress) {
    return null;
  }

  return `${slice || 'address'}:${normalizedAddress}`;
}

function toNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const CONTACT_FIELDS = [
  'contact_name',
  'business_name',
  'company_name',
  'primary_phone',
  'alternate_phone',
  'email',
  'customer_instructions',
  'delivery_instructions',
  'consignee',
  'shipper',
  'contact_source',
  'contact_last_imported_at'
];

function hasContactValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function mergeRawContactMetadata(primaryMetadata, fallbackMetadata) {
  const merged = {};

  for (const metadata of [fallbackMetadata, primaryMetadata]) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      continue;
    }

    for (const [key, value] of Object.entries(metadata)) {
      if (key && hasContactValue(value)) {
        merged[key] = value;
      }
    }
  }

  return Object.keys(merged).length ? merged : null;
}

function mergeStopContactFields(primaryStop = {}, fallbackStop = {}) {
  const merged = {};

  for (const field of CONTACT_FIELDS) {
    merged[field] = hasContactValue(primaryStop?.[field])
      ? primaryStop[field]
      : fallbackStop?.[field] ?? null;
  }

  const rawContactMetadata = mergeRawContactMetadata(primaryStop?.raw_contact_metadata, fallbackStop?.raw_contact_metadata);
  if (rawContactMetadata) {
    merged.raw_contact_metadata = rawContactMetadata;
  }

  return merged;
}

function toManifestStopFromExistingRouteStop(stop, packageCount = 1) {
  const sequence = Number(stop?.sequence_order || stop?.sequence || 0) || 1;
  const stopType = stop?.stop_type || (stop?.is_pickup ? 'pickup' : 'delivery');
  const hasPickup = Boolean(stop?.has_pickup || stop?.is_pickup || stopType === 'pickup' || stopType === 'combined');
  const hasDelivery = stop?.has_delivery === false ? false : stopType !== 'pickup';
  const normalizedPackageCount = Math.max(1, Number(packageCount || 1));

  return {
    id: stop?.id || null,
    sequence,
    stop_number: sequence,
    address: stop?.address || '',
    address_line2: stop?.address_line2 || null,
    contact_name: stop?.contact_name || null,
    business_name: stop?.business_name || null,
    company_name: stop?.company_name || null,
    primary_phone: stop?.primary_phone || null,
    alternate_phone: stop?.alternate_phone || null,
    email: stop?.email || null,
    customer_instructions: stop?.customer_instructions || null,
    delivery_instructions: stop?.delivery_instructions || null,
    consignee: stop?.consignee || null,
    shipper: stop?.shipper || null,
    contact_source: stop?.contact_source || null,
    contact_last_imported_at: stop?.contact_last_imported_at || null,
    raw_contact_metadata: stop?.raw_contact_metadata || null,
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
    delivery_package_count: hasDelivery ? normalizedPackageCount : 0,
    pickup_package_count: hasPickup && !hasDelivery ? normalizedPackageCount : 0,
    geocode_source: stop?.geocode_source || 'manifest',
    geocode_accuracy: stop?.geocode_accuracy || 'manifest',
    package_count: normalizedPackageCount
  };
}

function getStopSlicePackageCount(stop = {}, slice) {
  const explicitField = slice === 'delivery' ? 'delivery_package_count' : 'pickup_package_count';
  const explicitCount = Number(stop?.[explicitField]);
  if (Number.isFinite(explicitCount) && explicitCount > 0) {
    return explicitCount;
  }

  const hasSlice = slice === 'delivery' ? stop?.has_delivery !== false : Boolean(stop?.has_pickup || stop?.is_pickup);
  const hasOtherSlice = slice === 'delivery' ? Boolean(stop?.has_pickup || stop?.is_pickup) : stop?.has_delivery !== false;

  if (hasSlice && !hasOtherSlice) {
    return Math.max(0, Number(stop?.package_count || 0));
  }

  return 0;
}

function mergePackageDetails(primaryPackages = [], fallbackPackages = []) {
  const merged = [];
  const seenTrackingNumbers = new Set();

  for (const pkg of [...(fallbackPackages || []), ...(primaryPackages || [])]) {
    const trackingNumber = String(pkg?.tracking_number || '').trim();
    if (!trackingNumber || seenTrackingNumbers.has(trackingNumber)) {
      continue;
    }

    seenTrackingNumbers.add(trackingNumber);
    merged.push({
      tracking_number: trackingNumber,
      service_code: pkg.service_code || null,
      hazmat: Boolean(pkg.hazmat)
    });
  }

  return merged;
}

function getStopPackageTrackingNumbers(stop = {}) {
  if (!Array.isArray(stop?.packages)) {
    return [];
  }

  return stop.packages
    .map((pkg) => String(pkg?.tracking_number || '').trim())
    .filter(Boolean);
}

function dedupePackageRows(packageRows = []) {
  const seenTrackingNumbers = new Set();
  const dedupedRows = [];

  for (const row of packageRows || []) {
    const trackingNumber = String(row?.tracking_number || '').trim();
    if (!trackingNumber || seenTrackingNumbers.has(trackingNumber)) {
      continue;
    }

    seenTrackingNumbers.add(trackingNumber);
    dedupedRows.push({
      ...row,
      tracking_number: trackingNumber
    });
  }

  return dedupedRows;
}

function mergeLayeredManifestStop(primaryStop = {}, fallbackStop = {}) {
  const contactFields = mergeStopContactFields(primaryStop, fallbackStop);
  const primaryIsPickupOnly = Boolean(primaryStop?.has_pickup || primaryStop?.is_pickup || primaryStop?.type === 'pickup' || primaryStop?.stop_type === 'pickup') &&
    primaryStop?.has_delivery === false;
  const fallbackHasDelivery = fallbackStop?.has_delivery !== false && fallbackStop?.type !== 'pickup' && fallbackStop?.stop_type !== 'pickup';

  if (primaryIsPickupOnly && fallbackHasDelivery && hasContactValue(fallbackStop?.contact_name)) {
    contactFields.contact_name = fallbackStop.contact_name;
  }

  const hasDelivery = Boolean(primaryStop?.has_delivery || fallbackStop?.has_delivery);
  const hasPickup = Boolean(primaryStop?.has_pickup || fallbackStop?.has_pickup || primaryStop?.is_pickup || fallbackStop?.is_pickup);
  const packages = mergePackageDetails(primaryStop?.packages, fallbackStop?.packages);
  const primaryDeliveryCount = getStopSlicePackageCount(primaryStop, 'delivery');
  const fallbackDeliveryCount = getStopSlicePackageCount(fallbackStop, 'delivery');
  const primaryPickupCount = getStopSlicePackageCount(primaryStop, 'pickup');
  const fallbackPickupCount = getStopSlicePackageCount(fallbackStop, 'pickup');
  const deliveryPackageCount = hasDelivery
    ? primaryDeliveryCount || fallbackDeliveryCount || (packages.length && !hasPickup ? packages.length : 0)
    : 0;
  const pickupPackageCount = hasPickup ? primaryPickupCount || fallbackPickupCount : 0;
  const packageCountFromSlices = deliveryPackageCount + pickupPackageCount;
  const packageCount = Math.max(
    packages.length,
    packageCountFromSlices,
    Number(primaryStop?.package_count || 0),
    Number(fallbackStop?.package_count || 0),
    1
  );
  const stopType = hasDelivery && hasPickup ? 'combined' : hasPickup ? 'pickup' : 'delivery';

  return {
    ...fallbackStop,
    ...primaryStop,
    ...contactFields,
    packages: packages.length ? packages : primaryStop?.packages || fallbackStop?.packages || [],
    package_count: packageCount,
    delivery_package_count: deliveryPackageCount,
    pickup_package_count: pickupPackageCount,
    type: stopType,
    stop_type: stopType,
    has_delivery: hasDelivery,
    has_pickup: hasPickup,
    is_pickup: !hasDelivery && hasPickup,
    ready_time: primaryStop?.ready_time || fallbackStop?.ready_time || null,
    close_time: primaryStop?.close_time || fallbackStop?.close_time || null,
    pickup_ready_time: primaryStop?.pickup_ready_time || fallbackStop?.pickup_ready_time || null,
    pickup_close_time: primaryStop?.pickup_close_time || fallbackStop?.pickup_close_time || null,
    has_time_commit: Boolean(primaryStop?.has_time_commit || fallbackStop?.has_time_commit),
    lat: toNumber(primaryStop?.lat) ?? toNumber(fallbackStop?.lat),
    lng: toNumber(primaryStop?.lng) ?? toNumber(fallbackStop?.lng),
    geocode_source: primaryStop?.geocode_source || fallbackStop?.geocode_source || 'manifest',
    geocode_accuracy: primaryStop?.geocode_accuracy || fallbackStop?.geocode_accuracy || 'manifest',
    sid: primaryStop?.sid || fallbackStop?.sid || null
  };
}

function mergePendingManifestStops(existingStops = [], incomingStops = []) {
  const mergedStops = new Map();
  const aliasToPrimaryKey = new Map();
  const primaryKeys = [];
  const duplicateSids = buildDuplicateManifestSidSet(existingStops, incomingStops);

  function rememberStopAliases(primaryKey, stop) {
    const hasPickup = Boolean(stop?.has_pickup || stop?.is_pickup || stop?.type === 'pickup' || stop?.stop_type === 'pickup' || stop?.type === 'combined' || stop?.stop_type === 'combined');
    const hasDelivery = stop?.has_delivery !== false && stop?.type !== 'pickup' && stop?.stop_type !== 'pickup';
    const genericAddressAlias = buildStopAddressAlias(stop);

    if (genericAddressAlias && !aliasToPrimaryKey.has(`generic:${genericAddressAlias}`)) {
      aliasToPrimaryKey.set(`generic:${genericAddressAlias}`, primaryKey);
    }

    if (hasPickup) {
      const pickupAlias = buildStopAddressAlias(stop, 'pickup-address');
      if (pickupAlias && !aliasToPrimaryKey.has(`pickup:${pickupAlias}`)) {
        aliasToPrimaryKey.set(`pickup:${pickupAlias}`, primaryKey);
      }
    }

    if (hasDelivery) {
      const deliveryAlias = buildStopAddressAlias(stop, 'delivery-address');
      if (deliveryAlias && !aliasToPrimaryKey.has(`delivery:${deliveryAlias}`)) {
        aliasToPrimaryKey.set(`delivery:${deliveryAlias}`, primaryKey);
      }
    }

    for (const trackingNumber of getStopPackageTrackingNumbers(stop)) {
      const trackingAlias = `package:${trackingNumber}`;
      if (!aliasToPrimaryKey.has(trackingAlias)) {
        aliasToPrimaryKey.set(trackingAlias, primaryKey);
      }
    }
  }

  function findExistingPrimaryKey(stop, fallbackKey) {
    const primaryKey = buildPendingManifestStopKeyWithDuplicateSids(stop, fallbackKey, duplicateSids);
    if (mergedStops.has(primaryKey)) {
      return primaryKey;
    }

    for (const trackingNumber of getStopPackageTrackingNumbers(stop)) {
      const matchedPrimaryKey = aliasToPrimaryKey.get(`package:${trackingNumber}`);
      if (matchedPrimaryKey && mergedStops.has(matchedPrimaryKey)) {
        return matchedPrimaryKey;
      }
    }

    const hasPickup = Boolean(stop?.has_pickup || stop?.is_pickup || stop?.type === 'pickup' || stop?.stop_type === 'pickup' || stop?.type === 'combined' || stop?.stop_type === 'combined');
    const hasDelivery = stop?.has_delivery !== false && stop?.type !== 'pickup' && stop?.stop_type !== 'pickup';
    const sliceAliases = [
      hasPickup ? ['pickup', buildStopAddressAlias(stop, 'pickup-address')] : null,
      hasDelivery ? ['delivery', buildStopAddressAlias(stop, 'delivery-address')] : null,
      ['generic', buildStopAddressAlias(stop)]
    ].filter(Boolean);

    for (const [scope, alias] of sliceAliases) {
      const matchedPrimaryKey = alias ? aliasToPrimaryKey.get(`${scope}:${alias}`) : null;
      if (matchedPrimaryKey && mergedStops.has(matchedPrimaryKey)) {
        return matchedPrimaryKey;
      }
    }

    return primaryKey;
  }

  existingStops.forEach((stop, index) => {
    const primaryKey = buildPendingManifestStopKeyWithDuplicateSids(stop, `existing:${stop?.id || stop?.sequence || index}`, duplicateSids);
    mergedStops.set(primaryKey, stop);
    primaryKeys.push(primaryKey);
    rememberStopAliases(primaryKey, stop);
  });

  incomingStops.forEach((stop, index) => {
    const key = findExistingPrimaryKey(stop, `incoming:${stop?.sequence || index}`);
    const existingStop = mergedStops.get(key) || null;
    mergedStops.set(key, existingStop ? mergeLayeredManifestStop(stop, existingStop) : stop);
    if (!primaryKeys.includes(key)) {
      primaryKeys.push(key);
    }
    rememberStopAliases(key, mergedStops.get(key));
  });

  return normalizeMergedStopSequences(primaryKeys.map((key) => mergedStops.get(key)).filter(Boolean));
}

function hasManifestFile(file) {
  return Boolean(file?.buffer);
}

function getManifestFileLabel(file, fallback = 'manifest') {
  return file?.originalname || fallback;
}

function countStopsWithContact(stops = []) {
  return (stops || []).filter((stop) => (
    hasContactValue(stop?.primary_phone) ||
    hasContactValue(stop?.alternate_phone) ||
    hasContactValue(stop?.email) ||
    hasContactValue(stop?.business_name) ||
    hasContactValue(stop?.company_name) ||
    hasContactValue(stop?.customer_instructions) ||
    hasContactValue(stop?.delivery_instructions) ||
    hasContactValue(stop?.consignee) ||
    hasContactValue(stop?.shipper)
  )).length;
}

function countExplicitPackages(stops = []) {
  return (stops || []).reduce((sum, stop) => {
    const explicitPackages = Array.isArray(stop?.packages)
      ? stop.packages.filter((pkg) => String(pkg?.tracking_number || '').trim())
      : [];
    return sum + explicitPackages.length;
  }, 0);
}

function countServiceCodes(stops = []) {
  return (stops || []).reduce((sum, stop) => {
    const explicitPackages = Array.isArray(stop?.packages) ? stop.packages : [];
    return sum + explicitPackages.filter((pkg) => hasContactValue(pkg?.service_code)).length;
  }, 0);
}

function summarizeManifestLayer(layer) {
  const stops = layer?.stops || [];
  return {
    key: layer?.key || 'manifest',
    label: layer?.label || layer?.key || 'Manifest',
    file_name: getManifestFileLabel(layer?.file, layer?.key || 'manifest'),
    companion_gpx_name: layer?.companionGpxFile?.originalname || null,
    format: layer?.format || 'unknown',
    stop_count: stops.length,
    pickup_stop_count: stops.filter((stop) => stop?.has_pickup || stop?.is_pickup || stop?.type === 'pickup' || stop?.type === 'combined').length,
    delivery_stop_count: stops.filter((stop) => stop?.has_delivery !== false && stop?.type !== 'pickup').length,
    contact_stop_count: countStopsWithContact(stops),
    explicit_package_count: countExplicitPackages(stops),
    service_code_count: countServiceCodes(stops),
    mapped_stop_count: stops.filter((stop) => toNumber(stop?.lat) !== null && toNumber(stop?.lng) !== null).length
  };
}

function buildManifestLayers({
  manifestFile,
  companionGpxFile,
  combinedManifestFile,
  combinedGpxFile,
  deliveryManifestFile,
  deliveryGpxFile,
  pickupManifestFile
}) {
  const namedLayers = [
    { key: 'combined', label: 'Combined manifest', file: combinedManifestFile, companionGpxFile: combinedGpxFile || companionGpxFile || null },
    { key: 'delivery', label: 'Delivery manifest', file: deliveryManifestFile, companionGpxFile: deliveryGpxFile || null },
    { key: 'pickup', label: 'Pickup manifest', file: pickupManifestFile, companionGpxFile: null }
  ].filter((layer) => hasManifestFile(layer.file));

  if (namedLayers.length) {
    return namedLayers;
  }

  return hasManifestFile(manifestFile)
    ? [{ key: 'primary', label: 'Manifest', file: manifestFile, companionGpxFile: companionGpxFile || null }]
    : [];
}

async function parseManifestLayer(layer) {
  const manifestFormat = detectManifestFormat(layer.file.buffer, layer.file.originalname);

  if (manifestFormat === 'unknown') {
    throw new Error(`Unsupported ${layer.label || 'manifest'} file type. Use .xls, .xlsx, or .gpx.`);
  }

  const manifest =
    manifestFormat === 'xls'
      ? parseXLSManifest(layer.file.buffer)
      : await parseGPXManifest(layer.file.buffer);

  let parsedStops = manifest?.stops || [];
  let manifestMeta = manifest?.manifest_meta || {};

  if (hasManifestFile(layer.companionGpxFile)) {
    const gpxFormat = detectManifestFormat(layer.companionGpxFile.buffer, layer.companionGpxFile.originalname);

    if (gpxFormat !== 'gpx') {
      throw new Error(`${layer.label || 'Manifest'} companion file must be a .gpx file.`);
    }

    const gpxManifest = await parseGPXManifest(layer.companionGpxFile.buffer);
    parsedStops = mergeManifestStops(parsedStops, gpxManifest?.stops || []);
    parsedStops = normalizeMergedStopSequences(parsedStops);
    manifestMeta = mergeManifestMeta(manifestMeta, gpxManifest?.manifest_meta || null);
  }

  return {
    ...layer,
    format: manifestFormat,
    stops: parsedStops,
    manifest_meta: manifestMeta || {}
  };
}

function mergeParsedManifestLayers(parsedLayers = []) {
  if (!parsedLayers.length) {
    return {
      parsedStops: [],
      manifestMeta: {},
      manifestFormat: 'unknown',
      manifestLayerSummary: []
    };
  }

  const parsedStops = parsedLayers.reduce((mergedStops, layer) => {
    if (!mergedStops.length) {
      return normalizeMergedStopSequences(layer.stops || []);
    }

    return mergePendingManifestStops(mergedStops, layer.stops || []);
  }, []);

  const manifestMeta = parsedLayers.reduce(
    (mergedMeta, layer) => mergeManifestMeta(mergedMeta, layer.manifest_meta || null),
    null
  ) || {};

  return {
    parsedStops,
    manifestMeta,
    manifestFormat: parsedLayers.some((layer) => layer.format === 'xls') ? 'xls' : parsedLayers[0]?.format || 'unknown',
    manifestLayerSummary: parsedLayers.map(summarizeManifestLayer)
  };
}

function validateManifestPackageTracking(routeStops = []) {
  const seen = new Map();
  const duplicates = [];

  for (const stop of routeStops || []) {
    for (const pkg of stop?.packages || []) {
      const trackingNumber = String(pkg?.tracking_number || '').trim();
      if (!trackingNumber) {
        continue;
      }

      if (seen.has(trackingNumber)) {
        duplicates.push({
          tracking_number: trackingNumber,
          first_sequence: seen.get(trackingNumber),
          duplicate_sequence: stop?.sequence || null
        });
      } else {
        seen.set(trackingNumber, stop?.sequence || null);
      }
    }
  }

  if (duplicates.length) {
    const error = new Error(
      `Manifest has ${duplicates.length} duplicate package tracking number${duplicates.length === 1 ? '' : 's'} after merging. Check duplicate addresses/suites before saving this route.`
    );
    error.statusCode = 422;
    error.duplicate_packages = duplicates.slice(0, 10);
    throw error;
  }
}

function getPackageSaveError(error) {
  const schemaError = getManifestSchemaError(error);
  if (schemaError) {
    return schemaError;
  }

  const message = String(error?.message || error?.details || error?.hint || '').trim();
  if (/duplicate key|unique constraint/i.test(message)) {
    return 'Package save failed because duplicate tracking numbers were detected after manifest merge. Check for duplicate stop addresses, suites, or repeated manifest files.';
  }

  return 'Failed to save packages from manifest. The route was not fully updated; retry the upload or contact support before dispatching.';
}

function isMissingAtomicRouteRpcError(error) {
  const message = String(error?.message || error?.details || error?.hint || '');
  return (
    /replace_manifest_route_atomic/i.test(message) &&
    (/function .* does not exist/i.test(message) || /could not find/i.test(message) || /schema cache/i.test(message))
  );
}

function buildStopInsertPayload({ routeId, routeStops, existingRoute, preservedStopStateByKey, nowIso }) {
  return routeStops.map((stop) => ({
    route_id: routeId,
    sequence_order: stop.sequence,
    address: stop.address,
    address_line2: stop.address_line2 || null,
    contact_name: stop.contact_name || null,
    business_name: stop.business_name || null,
    company_name: stop.company_name || null,
    primary_phone: stop.primary_phone || null,
    alternate_phone: stop.alternate_phone || null,
    email: stop.email || null,
    customer_instructions: stop.customer_instructions || null,
    delivery_instructions: stop.delivery_instructions || null,
    consignee: stop.consignee || null,
    shipper: stop.shipper || null,
    contact_source: stop.contact_source || null,
    contact_last_imported_at: stop.contact_last_imported_at || (stop.contact_source ? nowIso : null),
    raw_contact_metadata: stop.raw_contact_metadata || null,
    lat: stop.lat,
    lng: stop.lng,
    is_pickup: Boolean(stop.is_pickup),
    is_business: Boolean(stop.is_business),
    sid: stop.sid || null,
    ready_time: stop.ready_time || null,
    close_time: stop.close_time || null,
    has_time_commit: Boolean(stop.has_time_commit),
    stop_type: stop.type || 'delivery',
    has_pickup: Boolean(stop.has_pickup),
    has_delivery: stop.has_delivery !== false,
    geocode_source: stop.geocode_source || 'manifest',
    geocode_accuracy: stop.geocode_accuracy || 'manifest',
    ...(() => {
      const preservedState = existingRoute
        ? getExistingStopStateForManifestStop(
            preservedStopStateByKey,
            stop,
            `insert:${stop?.sequence}`
          )
        : null;

      return {
        status: preservedState?.status || 'pending',
        exception_code: preservedState?.exception_code || null,
        delivery_type_code: preservedState?.delivery_type_code || null,
        pod_photo_url: preservedState?.pod_photo_url || null,
        scanned_at: preservedState?.scanned_at || null,
        completed_at: preservedState?.completed_at || null,
        has_note: Boolean(stop.warning || preservedState?.has_note),
        notes: stop.warning ? stop.warning : preservedState?.notes || null
      };
    })()
  }));
}

function buildPackageRowsForStops({ routeId, routeStops, stopIdBySequence = null }) {
  return dedupePackageRows(routeStops.flatMap((stop) => {
    const explicitPackages = Array.isArray(stop.packages)
      ? stop.packages.filter((pkg) => pkg?.tracking_number)
      : [];
    const stopId = stopIdBySequence?.get(stop.sequence) || null;

    if (explicitPackages.length) {
      return explicitPackages.map((pkg) => ({
        ...(stopId ? { stop_id: stopId } : { route_stop_sequence: stop.sequence }),
        tracking_number: String(pkg.tracking_number || '').trim(),
        service_code: pkg.service_code || null,
        hazmat: Boolean(pkg.hazmat)
      }));
    }

    const packageCount = Math.max(1, Number(stop.package_count || 1));
    const packageKeyBase = stop.sid && stop.sid !== '0'
      ? `RR-${routeId.slice(0, 8)}-SEQ-${stop.sequence}-SID-${stop.sid}`
      : `RR-${routeId.slice(0, 8)}-SEQ-${stop.sequence}`;

    return Array.from({ length: packageCount }, (_, index) => ({
      ...(stopId ? { stop_id: stopId } : { route_stop_sequence: stop.sequence }),
      tracking_number: `${packageKeyBase}-${index + 1}`,
      service_code: null,
      hazmat: false
    }));
  }));
}

async function applyManifestRouteClientSide({
  supabase,
  routeId,
  accountId,
  existingRoute,
  mergedIntoExistingRoute,
  routePayload,
  stopInsertPayload,
  routeStops
}) {
  if (mergedIntoExistingRoute && existingRoute) {
    const { data: existingStops, error: existingStopsError } = await supabase
      .from('stops')
      .select('id')
      .eq('route_id', existingRoute.id);

    if (existingStopsError) {
      throw new Error('Failed to reload old route stops before applying the manifest');
    }

    const existingStopIds = (existingStops || []).map((stop) => stop.id);

    if (existingStopIds.length) {
      const { error: deletePackagesError } = await supabase
        .from('packages')
        .delete()
        .in('stop_id', existingStopIds);

      if (deletePackagesError) {
        throw new Error('Failed to clear the old package rows before applying the new manifest');
      }
    }

    const { error: deleteStopsError } = await supabase
      .from('stops')
      .delete()
      .eq('route_id', existingRoute.id);

    if (deleteStopsError) {
      throw new Error('Failed to clear the old route stops before applying the new manifest');
    }

    const { data: updatedRoute, error: updateRouteError } = await supabase
      .from('routes')
      .update(routePayload)
      .eq('id', existingRoute.id)
      .eq('account_id', accountId)
      .select('id')
      .single();

    if (updateRouteError) {
      throw new Error('Failed to update the existing route with the new manifest data');
    }

    routeId = updatedRoute.id;
  } else {
    const { data: routeRecord, error: routeError } = await supabase
      .from('routes')
      .insert(routePayload)
      .select('id')
      .single();

    if (routeError) {
      throw routeError;
    }

    routeId = routeRecord.id || routePayload.id;
    for (const stopRow of stopInsertPayload) {
      stopRow.route_id = routeId;
    }
  }

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
  const packageInsertPayload = buildPackageRowsForStops({ routeId, routeStops, stopIdBySequence });

  let { error: packagesError } = await supabase
    .from('packages')
    .insert(packageInsertPayload);

  if (packagesError && canRetryPackageInsertWithoutDetailColumns(packagesError)) {
    const { error: fallbackPackagesError } = await supabase
      .from('packages')
      .insert(stripOptionalPackageDetailColumns(packageInsertPayload));
    packagesError = fallbackPackagesError;
  }

  if (packagesError) {
    if (!mergedIntoExistingRoute) {
      await supabase.from('routes').delete().eq('id', routeId);
    }
    const error = new Error(getPackageSaveError(packagesError));
    error.statusCode = 500;
    error.details = packagesError?.details || packagesError?.message || null;
    throw error;
  }

  return {
    routeId,
    insertedStops,
    packageInsertPayload,
    appliedAtomically: false
  };
}

async function applyManifestRouteAtomically({
  supabase,
  routeId,
  accountId,
  existingRoute,
  mergedIntoExistingRoute,
  routePayload,
  stopInsertPayload,
  packageInsertPayload
}) {
  if (typeof supabase.rpc !== 'function') {
    return null;
  }

  const { data, error } = await supabase.rpc('replace_manifest_route_atomic', {
    p_account_id: accountId,
    p_route_id: routeId,
    p_existing_route_id: existingRoute?.id || null,
    p_replace_existing: Boolean(mergedIntoExistingRoute && existingRoute),
    p_route: routePayload,
    p_stops: stopInsertPayload,
    p_packages: packageInsertPayload
  });

  if (error) {
    if (isMissingAtomicRouteRpcError(error)) {
      return null;
    }

    const friendlyMessage = getManifestSchemaError(error) || getPackageSaveError(error);
    const wrapped = new Error(friendlyMessage || error.message || 'Failed to apply manifest route atomically');
    wrapped.statusCode = /duplicate|constraint|missing stop/i.test(String(error.message || error.details || '')) ? 422 : 500;
    wrapped.details = error.details || error.message || null;
    throw wrapped;
  }

  const stopIds = Array.isArray(data?.stop_ids) ? data.stop_ids : [];

  return {
    routeId: data?.route_id || routeId,
    insertedStops: stopIds.map((stop) => ({
      id: stop.id,
      sequence_order: stop.sequence_order
    })),
    packageInsertPayload,
    appliedAtomically: true
  };
}

function buildExistingStopStateMap(existingStops = []) {
  const stateByKey = new Map();

  existingStops.forEach((stop, index) => {
    const manifestStop = toManifestStopFromExistingRouteStop(stop);
    const key = buildPendingManifestStopKey(manifestStop, `existing:${stop?.id || stop?.sequence_order || index}`);

    if (key && !stateByKey.has(key)) {
      stateByKey.set(key, {
        status: stop.status || 'pending',
        exception_code: stop.exception_code || null,
        delivery_type_code: stop.delivery_type_code || null,
        pod_photo_url: stop.pod_photo_url || null,
        scanned_at: stop.scanned_at || null,
        completed_at: stop.completed_at || null,
        has_note: Boolean(stop.has_note),
        notes: stop.notes || null
      });
    }
  });

  return stateByKey;
}

function getExistingStopStateForManifestStop(stateByKey, stop, fallbackKey) {
  return stateByKey.get(buildPendingManifestStopKey(stop, fallbackKey)) || null;
}

function getRouteStatusAfterManifestRefresh({ completedStops, totalStops, existingRoute, resetToPending }) {
  if (resetToPending) {
    return 'pending';
  }

  if (totalStops > 0 && completedStops >= totalStops) {
    return 'complete';
  }

  if (completedStops > 0) {
    return 'in_progress';
  }

  return existingRoute?.status || 'pending';
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
    combinedManifestFile = null,
    combinedGpxFile = null,
    deliveryManifestFile = null,
    deliveryGpxFile = null,
    pickupManifestFile = null,
    requestedDriverId = null,
    requestedDriverName = null,
    requestedVehicleId = null,
    requestedDate = null,
    requestedWorkAreaName = null,
    source = 'fedex_sync'
  }) {
    const manifestLayers = buildManifestLayers({
      manifestFile,
      companionGpxFile,
      combinedManifestFile,
      combinedGpxFile,
      deliveryManifestFile,
      deliveryGpxFile,
      pickupManifestFile
    });

    if (!manifestLayers.length) {
      throw new Error('Manifest file is required');
    }

    const parsedLayers = await Promise.all(manifestLayers.map(parseManifestLayer));
    const {
      parsedStops,
      manifestMeta,
      manifestFormat,
      manifestLayerSummary
    } = mergeParsedManifestLayers(parsedLayers);

    if (!parsedStops.length) {
      throw new Error('No stops found in manifest file');
    }

    if (
      source === 'fedex_sync' &&
      requestedDate &&
      manifestMeta.date &&
      manifestMeta.date !== requestedDate
    ) {
      const error = new Error(
        `FCC manifest date ${manifestMeta.date} does not match requested ReadyRoute date ${requestedDate}.`
      );
      error.code = 'STALE_FEDEX_MANIFEST_DATE';
      error.manifestDate = manifestMeta.date;
      error.requestedDate = requestedDate;
      throw error;
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

        const matchedDriver = (drivers || []).find((driver) => namesLookLikeMatch(driver.name, manifestDriverName));

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
    let routeStops = mergePendingManifestStops([], normalizeMergedStopSequences(geocodedManifest.stops));
    validateManifestPackageTracking(routeStops);
    const coordinateHealth = summarizeCoordinateHealth(routeStops);
    const coordinateIntegrity = detectSuspiciousCoordinateClusters(routeStops);

    if (coordinateIntegrity.suspicious_cluster_count > 0) {
      const error = new Error(
        'Manifest upload was blocked because too many different stop addresses collapsed onto the same map pin. Please re-check the manifest/GPX pair before dispatch.'
      );
      error.statusCode = 422;
      error.route_health = coordinateHealth;
      error.coordinate_integrity = coordinateIntegrity;
      throw error;
    }

    const { data: existingRoute, error: existingRouteError } = await loadExistingManifestRoute(supabase, {
      accountId,
      date: resolvedDate,
      workAreaName: resolvedWorkAreaName
    });

    if (existingRouteError) {
      throw new Error('Failed to check for an existing route before upload');
    }

    if (existingRoute?.dispatch_state === 'dispatched') {
      const syncedAt = nowProvider().toISOString();
      const protectedRouteSyncMetadata = buildRouteSyncMetadata({
        manifestMeta,
        routeStops,
        previousRoute: existingRoute,
        syncedAt
      });
      const manifestChanged = protectedRouteSyncMetadata.manifest_fingerprint !== existingRoute.manifest_fingerprint;

      await recordRouteSyncEvent(supabase, {
        accountId,
        routeId: existingRoute.id,
        workDate: resolvedDate,
        eventType: manifestChanged ? 'post_dispatch_change' : 'manifest_updated',
        eventStatus: manifestChanged ? 'warning' : 'info',
        summary: manifestChanged
          ? `Post-dispatch manifest sync held for route ${resolvedWorkAreaName}`
          : `Post-dispatch manifest sync matched live route ${resolvedWorkAreaName}`,
        details: {
          live_route_protected: true,
          driver_route_unchanged: true,
          sync_state: manifestChanged ? 'changed_after_dispatch' : 'staged_stable',
          existing_route_id: existingRoute.id,
          incoming_manifest_stop_count: routeStops.length,
          incoming_manifest_package_count: protectedRouteSyncMetadata.manifest_package_count,
          existing_manifest_fingerprint: existingRoute.manifest_fingerprint || null,
          incoming_manifest_fingerprint: protectedRouteSyncMetadata.manifest_fingerprint,
          manifest_layers: manifestLayerSummary,
          auto_matched_driver: autoMatchedDriver,
          auto_matched_vehicle: autoMatchedVehicle
        },
        managerUserId
      });

      await recordManifestImportForBilling({
        supabase,
        accountId,
        routeId: existingRoute.id,
        routeDate: resolvedDate,
        workAreaName: resolvedWorkAreaName,
        source,
        manifestFingerprint: protectedRouteSyncMetadata.manifest_fingerprint,
        manifestLayers: manifestLayerSummary,
        managerUserId,
        importedAt: syncedAt,
        metadata: {
          live_route_protected: true,
          post_dispatch_change_held: manifestChanged,
          driver_route_unchanged: true,
          manifest_stop_count: protectedRouteSyncMetadata.manifest_stop_count,
          manifest_package_count: protectedRouteSyncMetadata.manifest_package_count
        }
      });

      const deliveryCount = routeStops.filter((stop) => stop.type === 'delivery').length;
      const pickupCount = routeStops.filter((stop) => stop.type === 'pickup').length;
      const combinedCount = routeStops.filter((stop) => stop.type === 'combined').length;
      const pickupStopCount = routeStops.filter((stop) => stop.has_pickup || stop.type === 'pickup' || stop.type === 'combined').length;
      const timeCommitCount = routeStops.filter((stop) => stop.has_time_commit).length;

      return {
        route_id: existingRoute.id,
        total_stops: routeStops.length,
        delivery_count: deliveryCount,
        pickup_count: pickupCount,
        pickup_stop_count: pickupStopCount,
        total_pickup_stops: pickupStopCount,
        combined_count: combinedCount,
        time_commit_count: timeCommitCount,
        merged_into_existing_route: false,
        live_route_protected: true,
        driver_route_unchanged: true,
        post_dispatch_change_held: manifestChanged,
        auto_matched_driver: autoMatchedDriver,
        ...(matchedDriverName ? { matched_driver_name: matchedDriverName } : {}),
        ...(unmatchedDriverName ? { unmatched_driver_name: unmatchedDriverName } : {}),
        auto_matched_vehicle: autoMatchedVehicle,
        manifest_meta: manifestMeta,
        manifest_layers: manifestLayerSummary,
        geocoding: {
          status: geocodedManifest.summary.status,
          attempted: geocodedManifest.summary.attempted,
          geocoded: geocodedManifest.summary.geocoded,
          failed: geocodedManifest.summary.failed
        },
        route_health: coordinateHealth,
        coordinate_integrity: coordinateIntegrity,
        address_warnings: addressWarnings,
        manifest_stop_count: protectedRouteSyncMetadata.manifest_stop_count,
        manifest_package_count: protectedRouteSyncMetadata.manifest_package_count,
        sync_state: manifestChanged ? 'changed_after_dispatch' : 'staged_stable'
      };
    }

    let routeId = null;
    let mergedIntoExistingRoute = false;
    let routeSyncMetadata = null;
    let routePayload = null;
    let preservedStopStateByKey = new Map();

    if (existingRoute) {
      const shouldResetRouteForManifestRefresh = canReplaceExistingManifestRoute(existingRoute);

      const { data: existingStops, error: existingStopsError } = await supabase
        .from('stops')
        .select(
          'id, sequence_order, address, address_line2, contact_name, business_name, company_name, primary_phone, alternate_phone, email, customer_instructions, delivery_instructions, consignee, shipper, contact_source, contact_last_imported_at, raw_contact_metadata, lat, lng, status, exception_code, delivery_type_code, is_pickup, is_business, has_note, notes, sid, ready_time, close_time, has_time_commit, stop_type, has_pickup, has_delivery, geocode_source, geocode_accuracy, pod_photo_url, scanned_at, completed_at'
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
      const existingStopStateByKey = shouldResetRouteForManifestRefresh
        ? new Map()
        : buildExistingStopStateMap(existingStops || []);
      preservedStopStateByKey = existingStopStateByKey;

      routeStops = mergePendingManifestStops(existingManifestStops, routeStops);
      resolvedDriverId = resolvedDriverId || existingRoute.driver_id || null;
      resolvedVehicleId = resolvedVehicleId || existingRoute.vehicle_id || null;
      const preservedCompletedStops = routeStops.reduce((count, stop, index) => {
        const state = getExistingStopStateForManifestStop(existingStopStateByKey, stop, `merged:${stop?.sequence || index}`);
        const hasWorkedState = Boolean(state?.completed_at || isWorkedStopStatus(state?.status));
        return count + (hasWorkedState ? 1 : 0);
      }, 0);
      const nextRouteStatus = getRouteStatusAfterManifestRefresh({
        completedStops: preservedCompletedStops,
        totalStops: routeStops.length,
        existingRoute,
        resetToPending: shouldResetRouteForManifestRefresh
      });
      const nextCompletedAt =
        nextRouteStatus === 'complete'
          ? existingRoute.completed_at || nowProvider().toISOString()
          : null;

      routeSyncMetadata = buildRouteSyncMetadata({
        manifestMeta,
        routeStops,
        previousRoute: existingRoute,
        syncedAt: nowProvider().toISOString()
      });

      routePayload = {
        driver_id: resolvedDriverId,
        vehicle_id: resolvedVehicleId,
        work_area_name: resolvedWorkAreaName,
        dispatch_state: shouldResetRouteForManifestRefresh ? 'staged' : existingRoute.dispatch_state || 'staged',
        dispatched_at: shouldResetRouteForManifestRefresh ? null : existingRoute.dispatched_at || null,
        dispatched_by_manager_user_id: shouldResetRouteForManifestRefresh
          ? null
          : existingRoute.dispatched_by_manager_user_id || null,
        ...routeSyncMetadata,
        sa_number: manifestMeta.sa_number || null,
        contractor_name: manifestMeta.contractor_name || null,
        source,
        total_stops: routeStops.length,
        completed_stops: shouldResetRouteForManifestRefresh ? 0 : preservedCompletedStops,
        completed_at: nextCompletedAt,
        status: nextRouteStatus
      };

      routeId = existingRoute.id;
      mergedIntoExistingRoute = true;
    } else {
      routeSyncMetadata = buildRouteSyncMetadata({
        manifestMeta,
        routeStops,
        previousRoute: existingRoute,
        syncedAt: nowProvider().toISOString()
      });

      routeId = crypto.randomUUID();
      routePayload = {
        id: routeId,
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
      };
    }

    const stopInsertPayload = buildStopInsertPayload({
      routeId,
      routeStops,
      existingRoute,
      preservedStopStateByKey,
      nowIso: nowProvider().toISOString()
    });
    const atomicPackagePayload = buildPackageRowsForStops({ routeId, routeStops });
    let appliedRoute = await applyManifestRouteAtomically({
      supabase,
      routeId,
      accountId,
      existingRoute,
      mergedIntoExistingRoute,
      routePayload,
      stopInsertPayload,
      packageInsertPayload: atomicPackagePayload
    });

    if (!appliedRoute) {
      try {
        appliedRoute = await applyManifestRouteClientSide({
          supabase,
          routeId,
          accountId,
          existingRoute,
          mergedIntoExistingRoute,
          routePayload,
          stopInsertPayload,
          routeStops
        });
      } catch (routeError) {
        if (!mergedIntoExistingRoute) {
          const friendlyError = getManifestUploadError(routeError, {
            workAreaName: resolvedWorkAreaName,
            date: resolvedDate
          });
          if (friendlyError) {
            const error = new Error(friendlyError);
            error.statusCode = routeError?.code === '23505' ? 409 : 500;
            throw error;
          }
        }

        throw routeError;
      }
    }

    routeId = appliedRoute.routeId;
    const insertedStops = appliedRoute.insertedStops || [];
    const packageInsertPayload = appliedRoute.packageInsertPayload || atomicPackagePayload;
    const stopIdBySequence = new Map(insertedStops.map((stop) => [stop.sequence_order, stop.id]));

    const deliveryCount = routeStops.filter((stop) => stop.type === 'delivery').length;
    const pickupCount = routeStops.filter((stop) => stop.type === 'pickup').length;
    const combinedCount = routeStops.filter((stop) => stop.type === 'combined').length;
    const pickupStopCount = routeStops.filter((stop) => stop.has_pickup || stop.type === 'pickup' || stop.type === 'combined').length;
    const timeCommitCount = routeStops.filter((stop) => stop.has_time_commit).length;

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
        upload_mode: manifestLayerSummary.length > 1
          ? 'manifest_bundle'
          : manifestLayers.some((layer) => hasManifestFile(layer.companionGpxFile))
            ? 'spreadsheet_gpx'
            : manifestFormat,
        total_stops: routeStops.length,
        manifest_stop_count: routeSyncMetadata?.manifest_stop_count || routeStops.length,
        manifest_package_count: routeSyncMetadata?.manifest_package_count || packageInsertPayload.length,
        manifest_layers: manifestLayerSummary,
        sync_state: routeSyncMetadata?.sync_state || null,
        auto_matched_driver: autoMatchedDriver,
        auto_matched_vehicle: autoMatchedVehicle,
        merged_into_existing_route: mergedIntoExistingRoute,
        applied_atomically: Boolean(appliedRoute.appliedAtomically),
        coordinate_status: coordinateHealth.status
      },
      managerUserId
    });

    await recordManifestImportForBilling({
      supabase,
      accountId,
      routeId,
      routeDate: resolvedDate,
      workAreaName: resolvedWorkAreaName,
      source,
      manifestFingerprint: routeSyncMetadata?.manifest_fingerprint || null,
      manifestLayers: manifestLayerSummary,
      managerUserId,
      importedAt: routeSyncMetadata?.last_manifest_sync_at || nowProvider().toISOString(),
      metadata: {
        merged_into_existing_route: mergedIntoExistingRoute,
        applied_atomically: Boolean(appliedRoute.appliedAtomically),
        manifest_stop_count: routeSyncMetadata?.manifest_stop_count || routeStops.length,
        manifest_package_count: routeSyncMetadata?.manifest_package_count || packageInsertPayload.length,
        sync_state: routeSyncMetadata?.sync_state || null
      }
    });

    return {
      route_id: routeId,
      total_stops: routeStops.length,
      delivery_count: deliveryCount,
      pickup_count: pickupCount,
      pickup_stop_count: pickupStopCount,
      total_pickup_stops: pickupStopCount,
      combined_count: combinedCount,
      time_commit_count: timeCommitCount,
      merged_into_existing_route: mergedIntoExistingRoute,
      applied_atomically: Boolean(appliedRoute.appliedAtomically),
      auto_matched_driver: autoMatchedDriver,
      ...(matchedDriverName ? { matched_driver_name: matchedDriverName } : {}),
      ...(unmatchedDriverName ? { unmatched_driver_name: unmatchedDriverName } : {}),
      auto_matched_vehicle: autoMatchedVehicle,
      manifest_meta: manifestMeta,
      manifest_layers: manifestLayerSummary,
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
  createManifestIngestService,
  __private: {
    mergePendingManifestStops,
    buildManifestLayers,
    mergeParsedManifestLayers,
    validateManifestPackageTracking,
    applyManifestRouteAtomically
  }
};
