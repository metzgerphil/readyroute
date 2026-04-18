function toCoordinateNumber(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

module.exports = {
  getMapStatus,
  isOriginCoordinate,
  isUsableCoordinate,
  normalizeCoordinatePair,
  summarizeCoordinateHealth,
  toCoordinateNumber
};
