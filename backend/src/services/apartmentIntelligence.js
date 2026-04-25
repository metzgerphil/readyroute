function normalizeString(value) {
  return String(value || '').trim();
}

function getPrimaryAddressLine(address, addressLine2 = '') {
  const fullAddress = normalizeString(address);
  const secondary = normalizeString(addressLine2);

  if (!fullAddress) {
    return '';
  }

  const parts = fullAddress.split(',').map((part) => part.trim()).filter(Boolean);

  if (secondary && parts.length > 1 && parts[1] === secondary) {
    return parts[0];
  }

  return parts[0] || fullAddress;
}

function normalizeBuildingAddress(address, addressLine2 = '') {
  const primaryLine = getPrimaryAddressLine(address, addressLine2);

  return primaryLine
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(court)\b/g, 'ct')
    .replace(/\b(place)\b/g, 'pl')
    .replace(/\b(circle)\b/g, 'cir')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(terrace)\b/g, 'ter')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractUnitNumber(addressLine2) {
  const secondary = normalizeString(addressLine2);

  if (!secondary) {
    return null;
  }

  const match = secondary.match(
    /(?:\b(?:apt|apartment|unit|lot|space|trlr|trailer|rm|room)\b|#)\s*([a-z0-9-]+)\b/i
  );

  if (!match) {
    return null;
  }

  return match[1].toUpperCase();
}

function predictFloor(unitNumber) {
  const normalizedUnit = normalizeString(unitNumber).toUpperCase();
  const numericOnly = normalizedUnit.replace(/\D/g, '');

  if (!numericOnly) {
    return null;
  }

  if (numericOnly.length === 3) {
    const floor = Number(numericOnly[0]);

    if (!Number.isFinite(floor) || floor <= 0) {
      return null;
    }

    return {
      floor,
      confidence: 'high'
    };
  }

  if (numericOnly.length === 4) {
    const floor = Number(numericOnly.slice(0, 2));

    if (!Number.isFinite(floor) || floor <= 0) {
      return null;
    }

    return {
      floor,
      confidence: 'medium'
    };
  }

  const numericValue = Number(numericOnly);

  if (Number.isFinite(numericValue) && numericValue < 100) {
    return {
      floor: 1,
      confidence: 'low'
    };
  }

  return null;
}

function getConfidenceRank(confidence) {
  switch (confidence) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

function upgradeConfidence(confidence) {
  if (confidence === 'low') {
    return 'medium';
  }

  if (confidence === 'medium') {
    return 'high';
  }

  return 'high';
}

function normalizeStoredFloor(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

async function loadApartmentUnitRecord(supabase, accountId, normalizedAddress, unitNumber) {
  const { data, error } = await supabase
    .from('apartment_units')
    .select('id, account_id, normalized_address, display_address, unit_number, floor, confidence, source, verified, confirmation_count, created_at, updated_at')
    .eq('account_id', accountId)
    .eq('normalized_address', normalizedAddress)
    .eq('unit_number', unitNumber)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function loadApartmentBuildingRecords(supabase, accountId, normalizedAddress) {
  const { data, error } = await supabase
    .from('apartment_units')
    .select('id, unit_number, floor, confidence, source, verified, confirmation_count')
    .eq('account_id', accountId)
    .eq('normalized_address', normalizedAddress)
    .not('floor', 'is', null);

  if (error) {
    throw error;
  }

  return data || [];
}

function getPatternLearnedFloor(unitNumber, buildingRecords) {
  const verifiedRecords = (buildingRecords || []).filter((record) => record.verified && Number.isFinite(Number(record.floor)));

  if (verifiedRecords.length < 3) {
    return null;
  }

  const prediction = predictFloor(unitNumber);

  if (!prediction) {
    return null;
  }

  const matchingVerified = verifiedRecords.filter((record) => {
    const verifiedPrediction = predictFloor(record.unit_number);
    if (!verifiedPrediction) {
      return false;
    }

    return Number(record.floor) === verifiedPrediction.floor;
  });

  if (matchingVerified.length < 3) {
    return null;
  }

  return {
    floor: prediction.floor,
    confidence: upgradeConfidence(prediction.confidence),
    source: 'pattern'
  };
}

async function getDeliveryFloor(supabase, accountId, stop) {
  const normalizedAddress = normalizeBuildingAddress(stop.address, stop.address_line2);
  const unitNumber = extractUnitNumber(stop.address_line2);

  if (!normalizedAddress || !unitNumber) {
    return null;
  }

  const exactRecord = await loadApartmentUnitRecord(supabase, accountId, normalizedAddress, unitNumber);

  if (exactRecord?.verified && Number.isFinite(Number(exactRecord.floor))) {
    return {
      floor: Number(exactRecord.floor),
      confidence: exactRecord.confidence || 'high',
      source: 'verified',
      verified: true,
      unit_number: exactRecord.unit_number,
      normalized_address: normalizedAddress
    };
  }

  if (exactRecord && Number.isFinite(Number(exactRecord.floor))) {
    return {
      floor: Number(exactRecord.floor),
      confidence: exactRecord.confidence || 'low',
      source: exactRecord.source || 'predicted',
      verified: Boolean(exactRecord.verified),
      unit_number: exactRecord.unit_number,
      normalized_address: normalizedAddress
    };
  }

  const buildingRecords = await loadApartmentBuildingRecords(supabase, accountId, normalizedAddress);
  const learned = getPatternLearnedFloor(unitNumber, buildingRecords);

  if (learned) {
    return {
      ...learned,
      verified: false,
      unit_number: unitNumber,
      normalized_address: normalizedAddress
    };
  }

  const prediction = predictFloor(unitNumber);

  if (!prediction) {
    return {
      floor: null,
      confidence: 'low',
      source: 'predicted',
      verified: false,
      unit_number: unitNumber,
      normalized_address: normalizedAddress
    };
  }

  return {
    ...prediction,
    source: 'predicted',
    verified: false,
    unit_number: unitNumber,
    normalized_address: normalizedAddress
  };
}

async function ensureApartmentRecord(supabase, accountId, stop) {
  const normalizedAddress = normalizeBuildingAddress(stop.address, stop.address_line2);
  const unitNumber = extractUnitNumber(stop.address_line2);

  if (!normalizedAddress || !unitNumber) {
    return null;
  }

  const intelligence = await getDeliveryFloor(supabase, accountId, stop);

  if (!intelligence) {
    return null;
  }

  const existingRecord = await loadApartmentUnitRecord(supabase, accountId, normalizedAddress, unitNumber);

  if (existingRecord?.verified) {
    return {
      ...intelligence,
      floor: Number(existingRecord.floor),
      confidence: existingRecord.confidence || intelligence.confidence,
      source: 'verified',
      verified: true
    };
  }

  const payload = {
    account_id: accountId,
    normalized_address: normalizedAddress,
    display_address: getPrimaryAddressLine(stop.address, stop.address_line2) || stop.address || null,
    unit_number: unitNumber,
    floor: normalizeStoredFloor(intelligence.floor),
    confidence: intelligence.confidence || 'low',
    source: intelligence.source || 'predicted',
    verified: false,
    confirmation_count: existingRecord?.confirmation_count || 0,
    updated_at: new Date().toISOString()
  };

  if (existingRecord) {
    const currentConfidenceRank = getConfidenceRank(existingRecord.confidence);
    const nextConfidenceRank = getConfidenceRank(payload.confidence);

    if (
      existingRecord.floor == null ||
      nextConfidenceRank > currentConfidenceRank ||
      (existingRecord.source !== 'pattern' && payload.source === 'pattern')
    ) {
      const { error } = await supabase
        .from('apartment_units')
        .update(payload)
        .eq('id', existingRecord.id);

      if (error) {
        throw error;
      }
    }
  } else {
    const { error } = await supabase
      .from('apartment_units')
      .insert({
        ...payload,
        created_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
  }

  return intelligence;
}

async function bootstrapApartmentRecords(supabase, accountId, stops) {
  const apartmentStops = (stops || []).filter((stop) => stop.is_apartment_unit || extractUnitNumber(stop.address_line2));

  for (const stop of apartmentStops) {
    await ensureApartmentRecord(supabase, accountId, stop);
  }
}

async function confirmApartmentFloor(supabase, accountId, stop, actualFloor) {
  const normalizedAddress = normalizeBuildingAddress(stop.address, stop.address_line2);
  const unitNumber = extractUnitNumber(stop.address_line2);

  if (!normalizedAddress || !unitNumber) {
    return null;
  }

  const existingRecord = await loadApartmentUnitRecord(supabase, accountId, normalizedAddress, unitNumber);
  const payload = {
    account_id: accountId,
    normalized_address: normalizedAddress,
    display_address: getPrimaryAddressLine(stop.address, stop.address_line2) || stop.address || null,
    unit_number: unitNumber,
    floor: Number(actualFloor),
    confidence: 'high',
    source: 'verified',
    verified: true,
    confirmation_count: Number(existingRecord?.confirmation_count || 0) + 1,
    updated_at: new Date().toISOString()
  };

  if (existingRecord) {
    const { error } = await supabase
      .from('apartment_units')
      .update(payload)
      .eq('id', existingRecord.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await supabase
      .from('apartment_units')
      .insert({
        ...payload,
        created_at: new Date().toISOString()
      });

    if (error) {
      throw error;
    }
  }

  return {
    floor: Number(actualFloor),
    confidence: 'high',
    source: 'verified',
    verified: true,
    unit_number: unitNumber,
    normalized_address: normalizedAddress
  };
}

async function attachApartmentIntelligence(supabase, accountId, stop) {
  if (!stop || !(stop.is_apartment_unit || extractUnitNumber(stop.address_line2))) {
    return {
      ...stop,
      apartment_intelligence: null
    };
  }

  try {
    return {
      ...stop,
      apartment_intelligence: await getDeliveryFloor(supabase, accountId, stop)
    };
  } catch (error) {
    console.warn(`Apartment intelligence lookup failed for stop ${stop.id || stop.sequence_order || 'unknown'}: ${error.message}`);
    return {
      ...stop,
      apartment_intelligence: null
    };
  }
}

async function attachApartmentIntelligenceToStops(supabase, accountId, stops) {
  const stopList = stops || [];
  const apartmentStops = stopList.filter((stop) => stop && (stop.is_apartment_unit || extractUnitNumber(stop.address_line2)));

  if (!apartmentStops.length) {
    return stopList.map((stop) => ({
      ...stop,
      apartment_intelligence: stop?.apartment_intelligence || null
    }));
  }

  const stopMeta = apartmentStops.map((stop) => ({
    stop,
    normalizedAddress: normalizeBuildingAddress(stop.address, stop.address_line2),
    unitNumber: extractUnitNumber(stop.address_line2)
  })).filter((entry) => entry.normalizedAddress && entry.unitNumber);

  if (!stopMeta.length) {
    return stopList.map((stop) => ({
      ...stop,
      apartment_intelligence: null
    }));
  }

  const normalizedAddresses = [...new Set(stopMeta.map((entry) => entry.normalizedAddress))];
  const { data, error } = await supabase
    .from('apartment_units')
    .select('id, account_id, normalized_address, display_address, unit_number, floor, confidence, source, verified, confirmation_count, created_at, updated_at')
    .eq('account_id', accountId)
    .in('normalized_address', normalizedAddresses);

  if (error) {
    throw error;
  }

  const exactRecords = new Map();
  const recordsByAddress = new Map();

  for (const record of data || []) {
    const normalizedAddress = normalizeString(record.normalized_address);
    const unitNumber = normalizeString(record.unit_number).toUpperCase();

    if (!normalizedAddress || !unitNumber) {
      continue;
    }

    exactRecords.set(`${normalizedAddress}::${unitNumber}`, record);
    const current = recordsByAddress.get(normalizedAddress) || [];
    current.push(record);
    recordsByAddress.set(normalizedAddress, current);
  }

  return stopList.map((stop) => {
    if (!stop || !(stop.is_apartment_unit || extractUnitNumber(stop.address_line2))) {
      return {
        ...stop,
        apartment_intelligence: null
      };
    }

    try {
      const normalizedAddress = normalizeBuildingAddress(stop.address, stop.address_line2);
      const unitNumber = extractUnitNumber(stop.address_line2);

      if (!normalizedAddress || !unitNumber) {
        return {
          ...stop,
          apartment_intelligence: null
        };
      }

      const exactRecord = exactRecords.get(`${normalizedAddress}::${unitNumber}`) || null;

      if (exactRecord?.verified && Number.isFinite(Number(exactRecord.floor))) {
        return {
          ...stop,
          apartment_intelligence: {
            floor: Number(exactRecord.floor),
            confidence: exactRecord.confidence || 'high',
            source: 'verified',
            verified: true,
            unit_number: exactRecord.unit_number,
            normalized_address: normalizedAddress
          }
        };
      }

      if (exactRecord && Number.isFinite(Number(exactRecord.floor))) {
        return {
          ...stop,
          apartment_intelligence: {
            floor: Number(exactRecord.floor),
            confidence: exactRecord.confidence || 'low',
            source: exactRecord.source || 'predicted',
            verified: Boolean(exactRecord.verified),
            unit_number: exactRecord.unit_number,
            normalized_address: normalizedAddress
          }
        };
      }

      const buildingRecords = recordsByAddress.get(normalizedAddress) || [];
      const learned = getPatternLearnedFloor(unitNumber, buildingRecords);

      if (learned) {
        return {
          ...stop,
          apartment_intelligence: {
            ...learned,
            verified: false,
            unit_number: unitNumber,
            normalized_address: normalizedAddress
          }
        };
      }

      const prediction = predictFloor(unitNumber);

      return {
        ...stop,
        apartment_intelligence: prediction
          ? {
              ...prediction,
              source: 'predicted',
              verified: false,
              unit_number: unitNumber,
              normalized_address: normalizedAddress
            }
          : {
              floor: null,
              confidence: 'low',
              source: 'predicted',
              verified: false,
              unit_number: unitNumber,
              normalized_address: normalizedAddress
            }
      };
    } catch (error) {
      console.warn(`Apartment intelligence lookup failed for stop ${stop.id || stop.sequence_order || 'unknown'}: ${error.message}`);
      return {
        ...stop,
        apartment_intelligence: null
      };
    }
  });
}

module.exports = {
  attachApartmentIntelligence,
  attachApartmentIntelligenceToStops,
  bootstrapApartmentRecords,
  confirmApartmentFloor,
  ensureApartmentRecord,
  extractUnitNumber,
  getDeliveryFloor,
  normalizeBuildingAddress,
  normalizeStoredFloor,
  predictFloor
};
