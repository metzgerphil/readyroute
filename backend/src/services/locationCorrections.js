const { extractUnitNumber, normalizeBuildingAddress } = require('./apartmentIntelligence');
const { normalizeCoordinatePair } = require('./coordinates');

function normalizeString(value) {
  return String(value || '').trim();
}

function buildCorrectionKey(stop) {
  const normalizedAddress = normalizeBuildingAddress(stop.address, stop.address_line2);
  const unitNumber = extractUnitNumber(stop.address_line2);

  return {
    normalized_address: normalizedAddress,
    unit_number: unitNumber
  };
}

async function loadLocationCorrection(supabase, accountId, stop) {
  const correctionKey = buildCorrectionKey(stop);

  if (!correctionKey.normalized_address) {
    return null;
  }

  const exactQuery = supabase
    .from('location_corrections')
    .select('id, normalized_address, unit_number, corrected_lat, corrected_lng, source, label, updated_at')
    .eq('account_id', accountId)
    .eq('normalized_address', correctionKey.normalized_address);

  const { data: exactMatches, error: exactError } = correctionKey.unit_number
    ? await exactQuery.eq('unit_number', correctionKey.unit_number)
    : await exactQuery.is('unit_number', null);

  if (exactError) {
    throw exactError;
  }

  const exactMatch = exactMatches?.[0];

  if (exactMatch) {
    return exactMatch;
  }

  if (!correctionKey.unit_number) {
    return null;
  }

  const { data: buildingMatches, error: buildingError } = await supabase
    .from('location_corrections')
    .select('id, normalized_address, unit_number, corrected_lat, corrected_lng, source, label, updated_at')
    .eq('account_id', accountId)
    .eq('normalized_address', correctionKey.normalized_address)
    .is('unit_number', null)
    .limit(1);

  if (buildingError) {
    throw buildingError;
  }

  return buildingMatches?.[0] || null;
}

async function attachLocationCorrection(supabase, accountId, stop) {
  if (!stop?.address) {
    return {
      ...stop,
      location_correction: null
    };
  }

  try {
    const correction = await loadLocationCorrection(supabase, accountId, stop);

    if (!correction) {
      return {
        ...stop,
        location_correction: null
      };
    }

    const coordinates = normalizeCoordinatePair(correction.corrected_lat, correction.corrected_lng);

    if (!coordinates) {
      return {
        ...stop,
        location_correction: null
      };
    }

    return {
      ...stop,
      lat: coordinates.lat,
      lng: coordinates.lng,
      geocode_source: correction.source || 'driver_verified',
      geocode_accuracy: 'point',
      location_correction: {
        id: correction.id,
        label: correction.label || null,
        source: correction.source || 'driver_verified',
        updated_at: correction.updated_at || null,
        applies_to_unit: Boolean(correction.unit_number)
      }
    };
  } catch (error) {
    console.warn(`Location correction lookup failed for stop ${stop.id || stop.sequence_order || 'unknown'}: ${error.message}`);
    return {
      ...stop,
      location_correction: null
    };
  }
}

async function applyLocationCorrectionsToStops(supabase, accountId, stops) {
  const stopList = stops || [];
  const correctionKeys = stopList
    .map((stop) => ({
      stop,
      key: buildCorrectionKey(stop)
    }))
    .filter(({ key }) => key.normalized_address);

  if (!correctionKeys.length) {
    return stopList.map((stop) => ({
      ...stop,
      location_correction: stop.location_correction || null
    }));
  }

  const normalizedAddresses = [...new Set(correctionKeys.map(({ key }) => key.normalized_address))];
  const { data, error } = await supabase
    .from('location_corrections')
    .select('id, normalized_address, unit_number, corrected_lat, corrected_lng, source, label, updated_at')
    .eq('account_id', accountId)
    .in('normalized_address', normalizedAddresses);

  if (error) {
    throw error;
  }

  const exactCorrections = new Map();
  const buildingCorrections = new Map();

  for (const correction of data || []) {
    const normalizedAddress = normalizeString(correction.normalized_address);
    const unitNumber = normalizeString(correction.unit_number).toUpperCase() || null;

    if (!normalizedAddress) {
      continue;
    }

    if (unitNumber) {
      exactCorrections.set(`${normalizedAddress}::${unitNumber}`, correction);
    } else if (!buildingCorrections.has(normalizedAddress)) {
      buildingCorrections.set(normalizedAddress, correction);
    }
  }

  return stopList.map((stop) => {
    if (!stop?.address) {
      return {
        ...stop,
        location_correction: null
      };
    }

    const correctionKey = buildCorrectionKey(stop);

    if (!correctionKey.normalized_address) {
      return {
        ...stop,
        location_correction: null
      };
    }

    const exactKey = correctionKey.unit_number
      ? `${correctionKey.normalized_address}::${correctionKey.unit_number}`
      : null;
    const correction = (exactKey && exactCorrections.get(exactKey))
      || buildingCorrections.get(correctionKey.normalized_address)
      || null;

    if (!correction) {
      return {
        ...stop,
        location_correction: null
      };
    }

    const coordinates = normalizeCoordinatePair(correction.corrected_lat, correction.corrected_lng);

    if (!coordinates) {
      return {
        ...stop,
        location_correction: null
      };
    }

    return {
      ...stop,
      lat: coordinates.lat,
      lng: coordinates.lng,
      geocode_source: correction.source || 'driver_verified',
      geocode_accuracy: 'point',
      location_correction: {
        id: correction.id,
        label: correction.label || null,
        source: correction.source || 'driver_verified',
        updated_at: correction.updated_at || null,
        applies_to_unit: Boolean(correction.unit_number)
      }
    };
  });
}

async function saveLocationCorrection(supabase, accountId, driverId, stop, { lat, lng, label = '' }) {
  const correctionKey = buildCorrectionKey(stop);
  const coordinates = normalizeCoordinatePair(lat, lng);

  if (!coordinates) {
    throw new Error('A usable corrected location is required');
  }

  if (!correctionKey.normalized_address) {
    return null;
  }

  const existing = await loadLocationCorrection(supabase, accountId, stop);
  const payload = {
    account_id: accountId,
    normalized_address: correctionKey.normalized_address,
    unit_number: correctionKey.unit_number,
    display_address: stop.address || null,
    corrected_lat: coordinates.lat,
    corrected_lng: coordinates.lng,
    source: 'driver_verified',
    label: normalizeString(label) || null,
    updated_by_driver_id: driverId,
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
  } else {
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

  return {
    corrected_lat: coordinates.lat,
    corrected_lng: coordinates.lng,
    source: 'driver_verified',
    label: payload.label,
    applies_to_unit: Boolean(correctionKey.unit_number)
  };
}

module.exports = {
  applyLocationCorrectionsToStops,
  attachLocationCorrection,
  buildCorrectionKey,
  loadLocationCorrection,
  saveLocationCorrection
};
