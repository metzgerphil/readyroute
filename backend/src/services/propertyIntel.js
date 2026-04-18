const { extractUnitNumber, normalizeBuildingAddress } = require('./apartmentIntelligence');
const { extractBuildingLabel, extractFloorLabel, inferLocationType } = require('./manifestParser');

function normalizeString(value) {
  return String(value || '').trim();
}

function titleCase(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/\b([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function getWarningFlags(stop) {
  const combined = [
    stop?.address_line2,
    stop?.notes,
    stop?.note_text,
    stop?.contact_name
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const warnings = [];

  if (/\bdog\b/.test(combined)) warnings.push('dog');
  if (/\bgate|callbox|code\b/.test(combined)) warnings.push('gate');
  if (/\bstair|stairs\b/.test(combined)) warnings.push('stairs');
  if (/\blobby|locked lobby\b/.test(combined)) warnings.push('lobby');
  if (/\breception|front desk\b/.test(combined)) warnings.push('reception');
  if (/\bdock|loading dock|warehouse\b/.test(combined)) warnings.push('loading_dock');
  if (/\bpark|parking|visitor\b/.test(combined)) warnings.push('parking');
  if (/\belevator\b/.test(combined)) warnings.push('elevator');

  return warnings;
}

function pickSentence(text, pattern) {
  const normalized = normalizeString(text);

  if (!normalized) {
    return null;
  }

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  return sentences.find((sentence) => pattern.test(sentence.toLowerCase())) || null;
}

function buildPropertyIntel(stop, relatedStops) {
  const unit = stop?.apartment_intelligence?.unit_number || extractUnitNumber(stop?.address_line2) || null;
  const building = extractBuildingLabel(stop?.address_line2 || stop?.address, stop?.address);
  const floorLabel = extractFloorLabel(stop?.address_line2);
  const normalizedAddress = normalizeBuildingAddress(stop?.address, stop?.address_line2);
  const warningFlags = getWarningFlags(stop);
  const groupMembers = (relatedStops || [])
    .filter((candidate) => candidate?.id !== stop?.id)
    .map((candidate) => ({
      id: candidate.id,
      sequence_order: candidate.sequence_order,
      address: candidate.address,
      unit: candidate?.apartment_intelligence?.unit_number || extractUnitNumber(candidate?.address_line2) || null,
      status: candidate.status
    }))
    .sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));

  return {
    location_type: inferLocationType(stop),
    normalized_address: normalizedAddress || null,
    complex_id: normalizedAddress || null,
    property_name: stop?.contact_name || null,
    unit,
    building,
    floor_label: floorLabel,
    estimated_floor: stop?.apartment_intelligence?.floor ?? null,
    access_note: pickSentence(
      `${normalizeString(stop?.address_line2)} ${normalizeString(stop?.note_text)} ${normalizeString(stop?.notes)}`,
      /\bgate|callbox|code|lobby|reception|front desk|dock|access\b/
    ),
    parking_note: pickSentence(
      `${normalizeString(stop?.address_line2)} ${normalizeString(stop?.note_text)} ${normalizeString(stop?.notes)}`,
      /\bpark|parking|visitor|curb|lot\b/
    ),
    warning_flags: warningFlags,
    grouped_stop_count: groupMembers.length + 1,
    grouped_stops: groupMembers
  };
}

function getPropertyIntelSchemaMissing(error) {
  const message = String(error?.message || error?.details || error?.hint || '');

  return (
    /column .* does not exist/i.test(message) ||
    /relation .* does not exist/i.test(message) ||
    /could not find the .*column/i.test(message) ||
    /schema cache/i.test(message)
  );
}

function buildPropertyIntelKey(stop) {
  const normalizedAddress = normalizeBuildingAddress(stop?.address, stop?.address_line2);

  return {
    normalized_address: normalizedAddress || null,
    display_address: normalizeString(stop?.address) || null
  };
}

function normalizeWarningFlags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => normalizeString(item).toLowerCase()).filter(Boolean))];
  }

  if (typeof value === 'string') {
    return [...new Set(value
      .split(',')
      .map((item) => normalizeString(item).toLowerCase())
      .filter(Boolean))];
  }

  return [];
}

function mergePropertyIntel(baseIntel, persistedRow) {
  if (!persistedRow) {
    return baseIntel;
  }

  const mergedWarningFlags = [...new Set([
    ...normalizeWarningFlags(baseIntel?.warning_flags),
    ...normalizeWarningFlags(persistedRow.warning_flags)
  ])];

  return {
    ...baseIntel,
    property_record_id: persistedRow.id || null,
    property_name: persistedRow.property_name || baseIntel.property_name,
    location_type: persistedRow.property_type || baseIntel.location_type,
    building: persistedRow.building || baseIntel.building,
    access_note: persistedRow.access_note || persistedRow.entry_note || baseIntel.access_note,
    parking_note: persistedRow.parking_note || baseIntel.parking_note,
    entry_note: persistedRow.entry_note || null,
    business_hours: persistedRow.business_hours || null,
    shared_note: persistedRow.shared_note || null,
    warning_flags: mergedWarningFlags
  };
}

function attachDerivedPropertyIntelToStops(stops) {
  const stopList = stops || [];
  const groupedByAddress = new Map();

  for (const stop of stopList) {
    const key = normalizeBuildingAddress(stop?.address, stop?.address_line2);

    if (!key) {
      continue;
    }

    const current = groupedByAddress.get(key) || [];
    current.push(stop);
    groupedByAddress.set(key, current);
  }

  return stopList.map((stop) => {
    const key = normalizeBuildingAddress(stop?.address, stop?.address_line2);
    const relatedStops = key ? groupedByAddress.get(key) || [stop] : [stop];

    return {
      ...stop,
      property_intel: buildPropertyIntel(stop, relatedStops)
    };
  });
}

async function loadPropertyIntelRows(supabase, accountId, stops) {
  const normalizedAddresses = [...new Set(
    (stops || [])
      .map((stop) => buildPropertyIntelKey(stop).normalized_address)
      .filter(Boolean)
  )];

  if (!normalizedAddresses.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from('property_intel')
    .select('id, normalized_address, property_name, property_type, building, access_note, parking_note, entry_note, business_hours, shared_note, warning_flags, updated_at')
    .eq('account_id', accountId)
    .in('normalized_address', normalizedAddresses);

  if (error) {
    if (getPropertyIntelSchemaMissing(error)) {
      return new Map();
    }

    throw error;
  }

  return new Map((data || []).map((row) => [normalizeString(row.normalized_address), row]));
}

async function attachPropertyIntelToStops(supabase, accountId, stops) {
  if (!supabase?.from) {
    return attachDerivedPropertyIntelToStops(supabase || []);
  }

  const derivedStops = attachDerivedPropertyIntelToStops(stops || []);
  const persistedRows = await loadPropertyIntelRows(supabase, accountId, derivedStops);

  return derivedStops.map((stop) => {
    const key = normalizeString(stop?.property_intel?.normalized_address);
    const persistedRow = key ? persistedRows.get(key) || null : null;

    return {
      ...stop,
      property_intel: mergePropertyIntel(stop.property_intel, persistedRow)
    };
  });
}

async function attachPropertyIntel(supabase, accountId, stop, stops = []) {
  const merged = await attachPropertyIntelToStops(
    supabase,
    accountId,
    [stop, ...stops.filter((candidate) => candidate?.id !== stop?.id)]
  );

  return merged[0];
}

async function loadPropertyIntel(supabase, accountId, stop) {
  const key = buildPropertyIntelKey(stop);

  if (!key.normalized_address) {
    return null;
  }

  const rows = await loadPropertyIntelRows(supabase, accountId, [stop]);
  return rows.get(key.normalized_address) || null;
}

async function savePropertyIntel(supabase, accountId, stop, input = {}) {
  const key = buildPropertyIntelKey(stop);

  if (!key.normalized_address) {
    throw new Error('Property intel requires a normalized address.');
  }

  const payload = {
    account_id: accountId,
    normalized_address: key.normalized_address,
    display_address: key.display_address,
    property_name: normalizeString(input.property_name) || null,
    property_type: normalizeString(input.property_type) || null,
    building: normalizeString(input.building) || null,
    access_note: normalizeString(input.access_note) || null,
    parking_note: normalizeString(input.parking_note) || null,
    entry_note: normalizeString(input.entry_note) || null,
    business_hours: normalizeString(input.business_hours) || null,
    shared_note: normalizeString(input.shared_note) || null,
    warning_flags: normalizeWarningFlags(input.warning_flags),
    updated_at: new Date().toISOString()
  };

  const existingRow = await loadPropertyIntel(supabase, accountId, stop);

  if (existingRow?.id) {
    const { error } = await supabase
      .from('property_intel')
      .update(payload)
      .eq('id', existingRow.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await supabase
      .from('property_intel')
      .insert(payload);

    if (error) {
      throw error;
    }
  }

  return payload;
}

module.exports = {
  attachPropertyIntel,
  attachPropertyIntelToStops,
  buildPropertyIntel,
  buildPropertyIntelKey,
  extractBuildingLabel,
  inferLocationType,
  getWarningFlags,
  loadPropertyIntel,
  mergePropertyIntel,
  normalizeWarningFlags,
  savePropertyIntel
};
