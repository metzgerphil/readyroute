const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');
const { normalizeBuildingAddress } = require('../services/apartmentIntelligence');

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeComparable(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\b(street)\b/g, 'st')
    .replace(/\b(avenue)\b/g, 'ave')
    .replace(/\b(parkway)\b/g, 'pkwy')
    .replace(/\b(road)\b/g, 'rd')
    .replace(/\b(drive)\b/g, 'dr')
    .replace(/\b(lane)\b/g, 'ln')
    .replace(/\b(court)\b/g, 'ct')
    .replace(/\b(place)\b/g, 'pl')
    .replace(/\b(north)\b/g, 'n')
    .replace(/\b(south)\b/g, 's')
    .replace(/\b(east)\b/g, 'e')
    .replace(/\b(west)\b/g, 'w')
    .replace(/[^a-z0-9#*\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getPrimaryAddress(address) {
  return normalizeText(address).split(',')[0] || normalizeText(address);
}

function parseAddressHint(hint) {
  const comparable = normalizeComparable(hint);
  const rangeMatch = comparable.match(/^(\d+)\s*-\s*(\d+)\s+(.+)$/);
  if (rangeMatch) {
    return {
      from: Number(rangeMatch[1]),
      to: Number(rangeMatch[2]),
      street: rangeMatch[3]
    };
  }

  const numberMatch = comparable.match(/^(\d+)\s+(.+)$/);
  if (numberMatch) {
    return {
      from: Number(numberMatch[1]),
      to: Number(numberMatch[1]),
      street: numberMatch[2]
    };
  }

  return {
    from: null,
    to: null,
    street: comparable
  };
}

function parseStopAddress(address) {
  const comparable = normalizeComparable(getPrimaryAddress(address));
  const match = comparable.match(/^(\d+)\s+(.+)$/);

  if (!match) {
    return {
      number: null,
      street: comparable
    };
  }

  return {
    number: Number(match[1]),
    street: match[2]
  };
}

function streetMatches(candidateStreet, stopStreet) {
  if (!candidateStreet || !stopStreet) {
    return false;
  }

  return stopStreet.includes(candidateStreet) || candidateStreet.includes(stopStreet);
}

function workAreaMatches(candidate, routeWorkAreaName) {
  const candidateAreas = candidate.work_area_codes || [];
  if (!candidateAreas.length) {
    return true;
  }

  return candidateAreas.includes(String(routeWorkAreaName || '').replace(/\D/g, ''));
}

function scoreCandidateStop(candidate, stop, options = {}) {
  if (!options.ignoreWorkArea && !workAreaMatches(candidate, stop.work_area_name)) {
    return null;
  }

  const hint = parseAddressHint(candidate.address_hint);
  const stopAddress = parseStopAddress(stop.display_address);

  if (hint.from != null && stopAddress.number != null) {
    const inRange = stopAddress.number >= Math.min(hint.from, hint.to) && stopAddress.number <= Math.max(hint.from, hint.to);
    const sameStreet = streetMatches(hint.street, stopAddress.street);

    if (inRange && sameStreet) {
      return {
        score: hint.from === hint.to ? 100 : 94,
        match_type: hint.from === hint.to ? 'number_street' : 'range_street'
      };
    }
  }

  const hintComparable = normalizeComparable(candidate.address_hint);
  const displayComparable = normalizeComparable(stop.display_address);
  const contactComparable = normalizeComparable([stop.contact_name, stop.business_name, stop.company_name].filter(Boolean).join(' '));

  if (hintComparable.length >= 6 && displayComparable.includes(hintComparable)) {
    return {
      score: 84,
      match_type: 'address_contains'
    };
  }

  if (hintComparable.length >= 6 && contactComparable.includes(hintComparable)) {
    return {
      score: 76,
      match_type: 'name_contains'
    };
  }

  return null;
}

function buildStopIndex(stops) {
  const byAddress = new Map();

  for (const stop of stops || []) {
    const normalizedAddress = normalizeBuildingAddress(stop.address, stop.address_line2);
    if (!normalizedAddress) {
      continue;
    }

    const existing = byAddress.get(normalizedAddress);
    const displayAddress = getPrimaryAddress(stop.address);

    if (!existing) {
      byAddress.set(normalizedAddress, {
        normalized_address: normalizedAddress,
        display_address: displayAddress,
        route_ids: new Set([stop.route_id]),
        work_area_names: new Set([stop.work_area_name]),
        stop_ids: new Set([stop.id]),
        contact_name: stop.contact_name || null,
        business_name: stop.business_name || null,
        company_name: stop.company_name || null
      });
      continue;
    }

    existing.route_ids.add(stop.route_id);
    existing.work_area_names.add(stop.work_area_name);
    existing.stop_ids.add(stop.id);
    existing.contact_name ||= stop.contact_name || null;
    existing.business_name ||= stop.business_name || null;
    existing.company_name ||= stop.company_name || null;
  }

  return [...byAddress.values()].map((entry) => ({
    ...entry,
    route_ids: [...entry.route_ids],
    work_area_names: [...entry.work_area_names],
    work_area_name: [...entry.work_area_names][0],
    stop_ids: [...entry.stop_ids]
  }));
}

async function loadStopsForAccount(supabase, accountId) {
  const rows = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('stops')
      .select('id, route_id, address, address_line2, contact_name, business_name, company_name, routes!inner(account_id, work_area_name)')
      .eq('routes.account_id', accountId)
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    rows.push(...(data || []));

    if (!data || data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows.map((stop) => ({
    ...stop,
    work_area_name: Array.isArray(stop.routes) ? stop.routes[0]?.work_area_name : stop.routes?.work_area_name
  }));
}

async function loadExistingIntel(supabase, accountId) {
  const { data, error } = await supabase
    .from('property_intel')
    .select('id, normalized_address, access_code, access_note, access_code_source, updated_at')
    .eq('account_id', accountId);

  if (error) {
    throw error;
  }

  return new Map((data || []).map((row) => [row.normalized_address, row]));
}

function buildReview(candidates, stopIndex, existingIntel, options = {}) {
  const reviewRows = [];

  for (const candidate of candidates) {
    const scoredMatches = stopIndex
      .map((stop) => {
        const score = scoreCandidateStop(candidate, stop, options);
        return score ? { ...stop, ...score } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.display_address.localeCompare(b.display_address));

    if (!scoredMatches.length) {
      reviewRows.push({
        action: 'review_no_match',
        candidate,
        matches: []
      });
      continue;
    }

    for (const match of scoredMatches.filter((item) => item.score >= 94)) {
      const existing = existingIntel.get(match.normalized_address) || null;
      reviewRows.push({
        action: existing?.access_code ? 'skip_existing_code' : 'import_ready',
        candidate,
        match: {
          normalized_address: match.normalized_address,
          display_address: match.display_address,
          work_area_names: match.work_area_names,
          stop_count_seen: match.stop_ids.length,
          match_type: match.match_type,
          score: match.score
        },
        existing_intel: existing
          ? {
              access_code: existing.access_code || null,
              access_note: existing.access_note || null,
              access_code_source: existing.access_code_source || null,
              updated_at: existing.updated_at || null
            }
          : null
      });
    }

    if (!scoredMatches.some((item) => item.score >= 94)) {
      reviewRows.push({
        action: 'review_low_confidence',
        candidate,
        matches: scoredMatches.slice(0, 5).map((match) => ({
          normalized_address: match.normalized_address,
          display_address: match.display_address,
          work_area_names: match.work_area_names,
          stop_count_seen: match.stop_ids.length,
          match_type: match.match_type,
          score: match.score
        }))
      });
    }
  }

  return reviewRows;
}

async function importReadyRows(supabase, accountId, reviewRows) {
  const readyRows = reviewRows.filter((row) => row.action === 'import_ready');
  let imported = 0;

  for (const row of readyRows) {
    const payload = {
      account_id: accountId,
      normalized_address: row.match.normalized_address,
      display_address: row.match.display_address,
      access_code: row.candidate.access_code,
      access_code_confirmed_at: new Date().toISOString(),
      access_code_source: row.candidate.source === 'gate_codes_xlsx' ? 'imported_gate_codes_xlsx' : 'imported_gate_code_doc',
      access_note: row.candidate.access_note || null,
      warning_flags: ['gate'],
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('property_intel')
      .upsert(payload, { onConflict: 'account_id,normalized_address' });

    if (error) {
      throw error;
    }

    imported += 1;
  }

  return imported;
}

async function main() {
  const args = process.argv.slice(2);
  const candidatesPath = args[0];
  const accountId = args.find((arg) => arg.startsWith('--account-id='))?.split('=').slice(1).join('=');
  const outputPath = args.find((arg) => arg.startsWith('--output='))?.split('=').slice(1).join('=');
  const doImport = args.includes('--import');
  const ignoreWorkArea = args.includes('--ignore-work-area');

  if (!candidatesPath || !accountId) {
    console.error('Usage: node src/scripts/reviewGateCodeImport.js candidates.json --account-id=<uuid> [--output=review.json] [--import]');
    process.exit(1);
  }

  const payload = JSON.parse(fs.readFileSync(path.resolve(candidatesPath), 'utf8'));
  const candidates = payload.candidates || [];
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const stops = await loadStopsForAccount(supabase, accountId);
  const stopIndex = buildStopIndex(stops);
  const existingIntel = await loadExistingIntel(supabase, accountId);
  const reviewRows = buildReview(candidates, stopIndex, existingIntel, { ignoreWorkArea });
  const summary = reviewRows.reduce((acc, row) => {
    acc[row.action] = (acc[row.action] || 0) + 1;
    return acc;
  }, {});

  const reviewPayload = {
    account_id: accountId,
    candidate_count: candidates.length,
    matched_building_count: stopIndex.length,
    summary,
    rows: reviewRows
  };

  if (outputPath) {
    fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(reviewPayload, null, 2)}\n`);
  }

  if (doImport) {
    reviewPayload.imported_count = await importReadyRows(supabase, accountId, reviewRows);
  }

  console.log(JSON.stringify({
    candidate_count: reviewPayload.candidate_count,
    matched_building_count: reviewPayload.matched_building_count,
    summary: reviewPayload.summary,
    imported_count: reviewPayload.imported_count || 0,
    output: outputPath ? path.resolve(outputPath) : null
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
