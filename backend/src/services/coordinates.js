function toCoordinateNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAddressKey(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/\bAVENUE\b/g, 'AVE')
    .replace(/\bSTREET\b/g, 'ST')
    .replace(/\bROAD\b/g, 'RD')
    .replace(/\bDRIVE\b/g, 'DR')
    .replace(/\bPLACE\b/g, 'PL')
    .replace(/\bLANE\b/g, 'LN')
    .replace(/\bCOURT\b/g, 'CT')
    .replace(/\bBOULEVARD\b/g, 'BLVD')
    .replace(/\bPARKWAY\b/g, 'PKWY')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOriginCoordinate(lat, lng) {
  const parsedLat = toCoordinateNumber(lat);
  const parsedLng = toCoordinateNumber(lng);

  if (parsedLat === null || parsedLng === null) {
    return false;
  }

  return Math.abs(parsedLat) < 0.000001 && Math.abs(parsedLng) < 0.000001;
}

function isUsableCoordinate(lat, lng) {
  const parsedLat = toCoordinateNumber(lat);
  const parsedLng = toCoordinateNumber(lng);

  return parsedLat !== null
    && parsedLng !== null
    && Math.abs(parsedLat) <= 85
    && Math.abs(parsedLng) <= 180
    && !isOriginCoordinate(parsedLat, parsedLng);
}

function normalizeCoordinatePair(lat, lng) {
  if (!isUsableCoordinate(lat, lng)) {
    return null;
  }

  return {
    lat: Number(lat),
    lng: Number(lng)
  };
}

function getMapStatus(mappedStopCount, totalStopCount) {
  const mapped = Number(mappedStopCount || 0);
  const total = Number(totalStopCount || 0);

  if (total <= 0 || mapped <= 0) {
    return 'needs_pins';
  }

  if (mapped >= total) {
    return 'mapped';
  }

  return 'partially_mapped';
}

function summarizeCoordinateHealth(stops = []) {
  const summary = {
    total_stops: Number(stops.length || 0),
    mapped_stops: 0,
    missing_stops: 0,
    map_status: 'needs_pins',
    pin_source_counts: {
      manifest: 0,
      cache: 0,
      google: 0,
      driver_verified: 0,
      other: 0
    }
  };

  for (const stop of stops || []) {
    const isMapped = isUsableCoordinate(stop?.lat, stop?.lng);
    if (isMapped) {
      summary.mapped_stops += 1;
      switch (String(stop?.geocode_source || '').trim()) {
        case 'manifest':
          summary.pin_source_counts.manifest += 1;
          break;
        case 'cache':
        case 'location_correction':
          summary.pin_source_counts.cache += 1;
          break;
        case 'google':
        case 'manifest_geocoded':
          summary.pin_source_counts.google += 1;
          break;
        case 'driver_verified':
          summary.pin_source_counts.driver_verified += 1;
          break;
        default:
          summary.pin_source_counts.other += 1;
          break;
      }
    } else {
      summary.missing_stops += 1;
    }
  }

  summary.map_status = getMapStatus(summary.mapped_stops, summary.total_stops);

  return summary;
}

function detectSuspiciousCoordinateClusters(stops = []) {
  const clusters = new Map();

  for (const stop of stops || []) {
    if (!isUsableCoordinate(stop?.lat, stop?.lng)) {
      continue;
    }

    const key = `${Number(stop.lat).toFixed(6)},${Number(stop.lng).toFixed(6)}`;
    const current = clusters.get(key) || {
      coordinate_key: key,
      lat: Number(stop.lat),
      lng: Number(stop.lng),
      stop_count: 0,
      address_keys: new Set(),
      sample_addresses: []
    };

    current.stop_count += 1;

    const addressKey = normalizeAddressKey(stop?.address_line1 || stop?.address || '');
    if (addressKey) {
      current.address_keys.add(addressKey);
      if (current.sample_addresses.length < 5 && !current.sample_addresses.includes(stop.address || stop.address_line1)) {
        current.sample_addresses.push(stop.address || stop.address_line1);
      }
    }

    clusters.set(key, current);
  }

  const suspiciousClusters = [...clusters.values()]
    .map((cluster) => ({
      coordinate_key: cluster.coordinate_key,
      lat: cluster.lat,
      lng: cluster.lng,
      stop_count: cluster.stop_count,
      distinct_address_count: cluster.address_keys.size,
      sample_addresses: cluster.sample_addresses
    }))
    .filter((cluster) => cluster.stop_count >= 8 && cluster.distinct_address_count >= 6)
    .sort((left, right) => right.stop_count - left.stop_count);

  return {
    suspicious_cluster_count: suspiciousClusters.length,
    suspicious_clusters: suspiciousClusters
  };
}

module.exports = {
  detectSuspiciousCoordinateClusters,
  getMapStatus,
  isOriginCoordinate,
  isUsableCoordinate,
  normalizeCoordinatePair,
  summarizeCoordinateHealth,
  toCoordinateNumber
};
