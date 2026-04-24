const { isUsableCoordinate } = require('./coordinates');

const INVALID_SID_VALUES = new Set(['', '0', 'NULL', 'UNDEFINED', 'N/A', 'NA']);

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

function getStopSid(stop) {
  const sid = String(stop?.sid || '').trim();
  if (!sid) {
    return null;
  }

  const normalizedSid = sid.toUpperCase();
  return INVALID_SID_VALUES.has(normalizedSid) ? null : sid;
}

function getStopAddressKey(stop) {
  return normalizeAddressKey(stop?.address_line1 || stop?.address || '');
}

function buildTrustedSequenceSet(primaryStops = [], gpxBySequence = new Map(), gpxBySid = new Map(), gpxByAddress = new Map()) {
  const explicitMatches = [];

  for (const stop of primaryStops) {
    const sid = getStopSid(stop);
    const addressKey = getStopAddressKey(stop);
    const sidMatch = sid ? gpxBySid.get(sid) : null;
    const addressMatch = !sidMatch && addressKey ? gpxByAddress.get(addressKey) : null;
    const match = sidMatch || addressMatch || null;

    if (!match || !Number.isInteger(stop?.sequence) || !Number.isInteger(match?.sequence)) {
      continue;
    }

    explicitMatches.push({
      primarySequence: stop.sequence,
      gpxSequence: match.sequence
    });
  }

  if (explicitMatches.length < 2) {
    return new Set();
  }

  const alignedMatches = explicitMatches.filter((entry) => entry.primarySequence === entry.gpxSequence);
  const alignmentRatio = alignedMatches.length / explicitMatches.length;

  if (alignmentRatio < 0.75) {
    return new Set();
  }

  return new Set(alignedMatches.map((entry) => entry.primarySequence));
}

function mergeManifestStops(primaryStops = [], gpxStops = []) {
  if (!gpxStops.length) {
    return primaryStops;
  }

  const gpxBySequence = new Map();
  const gpxBySid = new Map();
  const gpxByAddress = new Map();

  for (const stop of gpxStops) {
    if (Number.isInteger(stop?.sequence)) {
      gpxBySequence.set(stop.sequence, stop);
    }

    const sid = getStopSid(stop);
    if (sid) {
      gpxBySid.set(sid, stop);
    }

    const normalizedAddress = normalizeAddressKey(stop?.address_line1 || stop?.address || '');
    if (normalizedAddress) {
      gpxByAddress.set(normalizedAddress, stop);
    }
  }

  const trustedSequenceSet = buildTrustedSequenceSet(primaryStops, gpxBySequence, gpxBySid, gpxByAddress);

  return primaryStops.map((stop) => {
    const sid = getStopSid(stop);
    const normalizedAddress = getStopAddressKey(stop);
    const bySid = sid ? gpxBySid.get(sid) : null;
    const byAddress = !bySid && normalizedAddress ? gpxByAddress.get(normalizedAddress) : null;
    const bySequence = !bySid && !byAddress && trustedSequenceSet.has(stop?.sequence)
      ? gpxBySequence.get(stop.sequence)
      : null;
    const match = bySequence || bySid || byAddress || null;

    if (!match) {
      return stop;
    }

    const hasMergedCoordinates = isUsableCoordinate(match.lat, match.lng);

    const hasMatchedSequence = Number.isInteger(match?.sequence) && match.sequence > 0;

    return {
      ...stop,
      sequence: hasMatchedSequence ? match.sequence : stop.sequence,
      stop_number: hasMatchedSequence ? match.sequence : stop.stop_number,
      uses_synthetic_sequence: hasMatchedSequence ? false : Boolean(stop?.uses_synthetic_sequence),
      lat: hasMergedCoordinates ? match.lat : stop.lat ?? null,
      lng: hasMergedCoordinates ? match.lng : stop.lng ?? null,
      geocode_source: hasMergedCoordinates ? (match.geocode_source || 'manifest') : (stop.geocode_source || null),
      geocode_accuracy: hasMergedCoordinates ? (match.geocode_accuracy || 'manifest') : (stop.geocode_accuracy || null),
      sid: stop.sid || match.sid || '',
      ready_time: stop.ready_time || match.ready_time || null,
      close_time: stop.close_time || match.close_time || null,
      has_time_commit: Boolean(stop.has_time_commit || match.has_time_commit)
    };
  });
}

function mergeManifestMeta(primaryMeta = null, gpxMeta = null) {
  if (!primaryMeta && !gpxMeta) {
    return null;
  }

  return {
    date: primaryMeta?.date || gpxMeta?.date || '',
    work_area_name: primaryMeta?.work_area_name || gpxMeta?.work_area_name || '',
    driver_name: primaryMeta?.driver_name || gpxMeta?.driver_name || '',
    vehicle_number: primaryMeta?.vehicle_number || gpxMeta?.vehicle_number || '',
    sa_number: primaryMeta?.sa_number || gpxMeta?.sa_number || '',
    contractor_name: primaryMeta?.contractor_name || gpxMeta?.contractor_name || ''
  };
}

function normalizeMergedStopSequences(stops = []) {
  return (stops || [])
    .map((stop, index) => ({ stop, index }))
    .sort((left, right) => {
      const leftSequence = Number.isInteger(left.stop?.sequence) ? left.stop.sequence : Number.MAX_SAFE_INTEGER;
      const rightSequence = Number.isInteger(right.stop?.sequence) ? right.stop.sequence : Number.MAX_SAFE_INTEGER;

      if (leftSequence !== rightSequence) {
        return leftSequence - rightSequence;
      }

      return left.index - right.index;
    })
    .map(({ stop }, index) => ({
      ...stop,
      sequence: index + 1,
      stop_number: index + 1,
      uses_synthetic_sequence: false
    }));
}

module.exports = {
  mergeManifestMeta,
  mergeManifestStops,
  normalizeMergedStopSequences
};
