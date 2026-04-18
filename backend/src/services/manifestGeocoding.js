const axios = require('axios');

const { isUsableCoordinate, normalizeCoordinatePair } = require('./coordinates');
const {
  buildCorrectionKey,
  loadLocationCorrection
} = require('./locationCorrections');

function hasCoordinates(stop) {
  return isUsableCoordinate(stop?.lat, stop?.lng);
}

function mapGoogleLocationType(locationType) {
  switch (String(locationType || '').toUpperCase()) {
    case 'ROOFTOP':
      return 'rooftop';
    case 'RANGE_INTERPOLATED':
      return 'interpolated';
    case 'GEOMETRIC_CENTER':
      return 'center';
    default:
      return 'approximate';
  }
}

async function geocodeAddress(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey || !String(address || '').trim()) {
    return null;
  }

  const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
    params: {
      address,
      region: 'us',
      key: apiKey
    },
    timeout: 10000
  });

  const status = response?.data?.status;

  if (status !== 'OK') {
    return null;
  }

  const result = response.data.results?.[0];
  const location = result?.geometry?.location;

  const coordinates = normalizeCoordinatePair(location?.lat, location?.lng);

  if (!coordinates) {
    return null;
  }

  return {
    lat: coordinates.lat,
    lng: coordinates.lng,
    geocode_accuracy: mapGoogleLocationType(result?.geometry?.location_type),
    formatted_address: result?.formatted_address || null
  };
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

async function persistManifestCoordinate(supabase, accountId, stop, geocoded) {
  const correctionKey = buildCorrectionKey(stop);

  if (!correctionKey.normalized_address) {
    return;
  }

  const existing = await loadLocationCorrection(supabase, accountId, stop);
  const payload = {
    account_id: accountId,
    normalized_address: correctionKey.normalized_address,
    unit_number: correctionKey.unit_number,
    display_address: geocoded.formatted_address || stop.address || null,
    corrected_lat: geocoded.lat,
    corrected_lng: geocoded.lng,
    source: 'manager_verified',
    label: 'Manifest geocoded',
    updated_by_driver_id: null,
    updated_at: new Date().toISOString()
  };

  if (existing?.id && existing.unit_number === correctionKey.unit_number) {
    const { error } = await supabase
      .from('location_corrections')
      .update(payload)
      .eq('id', existing.id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await supabase
    .from('location_corrections')
    .insert({
      ...payload,
      created_at: new Date().toISOString()
    });

  if (error) {
    throw error;
  }
}

async function enrichManifestStopsWithGeocoding(supabase, accountId, stops) {
  const stopList = stops || [];
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return {
      stops: stopList,
      summary: {
        status: 'disabled',
        attempted: 0,
        geocoded: 0,
        failed: 0
      }
    };
  }

  const unresolvedStops = stopList.filter((stop) => !hasCoordinates(stop) && String(stop?.address || '').trim());

  if (!unresolvedStops.length) {
    return {
      stops: stopList,
      summary: {
        status: 'skipped',
        attempted: 0,
        geocoded: 0,
        failed: 0
      }
    };
  }

  const uniqueStops = [];
  const seenKeys = new Set();

  for (const stop of unresolvedStops) {
    const correctionKey = buildCorrectionKey(stop);
    const dedupeKey = correctionKey.normalized_address
      ? `${correctionKey.normalized_address}::${correctionKey.unit_number || ''}`
      : String(stop.address).trim().toLowerCase();

    if (seenKeys.has(dedupeKey)) {
      continue;
    }

    seenKeys.add(dedupeKey);
    uniqueStops.push({ stop, dedupeKey });
  }

  const geocodedByKey = new Map();
  const geocodedResults = await mapWithConcurrency(uniqueStops, 8, async ({ stop, dedupeKey }) => {
    try {
      const geocoded = await geocodeAddress(stop.address);

      if (!geocoded) {
        return { dedupeKey, stop, geocoded: null };
      }

      await persistManifestCoordinate(supabase, accountId, stop, geocoded);
      return { dedupeKey, stop, geocoded };
    } catch (error) {
      console.warn(`Manifest geocoding failed for "${stop.address}": ${error.message}`);
      return { dedupeKey, stop, geocoded: null };
    }
  });

  let geocodedCount = 0;
  let failedCount = 0;

  for (const result of geocodedResults) {
    if (!result?.geocoded) {
      failedCount += 1;
      continue;
    }

    geocodedByKey.set(result.dedupeKey, result.geocoded);
    geocodedCount += 1;
  }

  const enrichedStops = stopList.map((stop) => {
    if (hasCoordinates(stop)) {
      return stop;
    }

    const correctionKey = buildCorrectionKey(stop);
    const dedupeKey = correctionKey.normalized_address
      ? `${correctionKey.normalized_address}::${correctionKey.unit_number || ''}`
      : String(stop.address || '').trim().toLowerCase();
    const geocoded = geocodedByKey.get(dedupeKey);

    if (!geocoded) {
      return stop;
    }

    return {
      ...stop,
      lat: geocoded.lat,
      lng: geocoded.lng,
      geocode_source: 'manifest_geocoded',
      geocode_accuracy: geocoded.geocode_accuracy
    };
  });

  return {
    stops: enrichedStops,
    summary: {
      status: geocodedCount ? 'completed' : 'missed',
      attempted: uniqueStops.length,
      geocoded: geocodedCount,
      failed: failedCount
    }
  };
}

module.exports = {
  enrichManifestStopsWithGeocoding
};
