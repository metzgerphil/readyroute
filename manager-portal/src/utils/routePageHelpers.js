import { format } from 'date-fns';

import { buildTelHref, getStopContactDetails } from './contactInfo';

export const ROUTE_STATUS_META = {
  pending: { label: 'Pending', color: '#9ca3af' },
  ready: { label: 'Ready', color: '#3b82f6' },
  in_progress: { label: 'In Progress', color: '#FF6200' },
  complete: { label: 'Complete', color: '#27ae60' }
};

export function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function getInitialRouteDate(searchParams) {
  const requestedDate = searchParams.get('date');
  return requestedDate || getTodayString();
}

export function getGoogleMapsErrorMessage(error) {
  if (error?.message === 'missing_google_maps_key') {
    return 'Map failed to load. Check Google Maps API key, billing, and referrer restrictions.';
  }

  if (error?.message === 'google_maps_auth_failed') {
    return 'Map failed to load. Check Google Maps API key, billing, and referrer restrictions.';
  }

  return 'Map failed to load. Check Google Maps API key, billing, and referrer restrictions.';
}

export function getFriendlyDate(dateValue) {
  return format(new Date(`${dateValue}T12:00:00`), 'MMMM d, yyyy');
}

function getStopType(stop) {
  if (stop.stop_type === 'combined' || (stop.has_pickup && stop.has_delivery)) {
    return 'combined';
  }
  if (stop.stop_type === 'pickup' || (stop.has_pickup && !stop.has_delivery) || stop.is_pickup) {
    return 'pickup';
  }
  return 'delivery';
}

function getPackageCount(stop) {
  return Array.isArray(stop.packages) ? stop.packages.length : 0;
}

export function getStopMarkerLabel(stop) {
  return `ST#${stop?.sequence_order || '—'}`;
}

function getStopPopupTitle(stop) {
  return stop?.sid && String(stop.sid) !== '0' ? `SID ${stop.sid}` : `ST#${stop.sequence_order || '—'}`;
}

function formatCompletionTime(stop) {
  const timestamp = stop?.completed_at || stop?.scanned_at;
  if (!timestamp || stop?.status === 'pending') {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function buildPhoneLink(phone, label) {
  if (!phone) {
    return '';
  }

  const href = buildTelHref(phone);
  const copy = `${label}: ${phone}`;

  if (!href) {
    return `<span style="font-weight:850;">${escapeHtml(copy)}</span>`;
  }

  return `<a href="${escapeHtml(href)}" style="color:#0f766e; font-weight:900; text-decoration:none;">${escapeHtml(copy)}</a>`;
}

function getCompletionBadge(stop) {
  const time = formatCompletionTime(stop);
  if (!time) {
    return null;
  }

  if (stop?.status === 'delivered') {
    return { time, icon: '✓', background: '#16a34a' };
  }

  return { time, icon: '×', background: '#6b7280' };
}

function formatTimeCommit(stop) {
  if (!stop?.has_time_commit || !stop?.ready_time || !stop?.close_time) {
    return null;
  }
  return `${stop.ready_time} — ${stop.close_time}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

export function formatDateShort(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

export function warningFlagsToDraft(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

export function getExceptionBadgeMeta(code, isIncomplete = false) {
  if (isIncomplete && !code) {
    return { label: 'Incomplete', className: 'incomplete-only' };
  }

  const normalizedCode = String(code || '').trim();
  const lookupCode =
    /^\d+$/.test(normalizedCode) && normalizedCode.length < 3
      ? normalizedCode.padStart(3, '0')
      : normalizedCode;
  const displayCode =
    /^\d+$/.test(normalizedCode) && normalizedCode.length > 2 && normalizedCode.startsWith('0')
      ? normalizedCode.slice(-2)
      : normalizedCode;
  const category2 = new Set(['001', '003', '004', '006', '007', '010', '030', '034', '250']);
  const category1 = new Set(['011', '012', '015', '016', '017', '027', '079', '081', '082', '083', '095', '100']);

  if (lookupCode === '002') {
    return { label: `Code ${displayCode || '02'} — Bad Address`, className: 'bad-address' };
  }

  if (category2.has(lookupCode)) {
    return { label: `Code ${displayCode || lookupCode}`, className: 'category-2' };
  }

  if (category1.has(lookupCode)) {
    return { label: `Code ${displayCode || lookupCode}`, className: 'category-1' };
  }

  return { label: normalizedCode ? `Code ${displayCode || normalizedCode}` : 'Incomplete', className: 'category-default' };
}

export function getFlagTypeMeta(flagType) {
  const normalized = String(flagType || '').toLowerCase();

  if (normalized.includes('impassable')) {
    return { label: 'Impassable', className: 'impassable' };
  }

  if (normalized.includes('season')) {
    return { label: 'Seasonal', className: 'seasonal' };
  }

  if (normalized.includes('clearance')) {
    return { label: 'Low Clearance', className: 'low-clearance' };
  }

  if (normalized.includes('private')) {
    return { label: 'Private', className: 'private' };
  }

  return { label: flagType || 'Flagged', className: 'private' };
}

export function getRouteDispatchWarnings({ route, allStops, roadFlags = [] }) {
  const warnings = [];
  const stopWarnings = (allStops || []).filter((stop) => Boolean(stop?.notes)).length;

  if (!route?.driver_id) {
    warnings.push({ key: 'driver', label: 'Needs driver', tone: 'urgent' });
  }

  if (!route?.vehicle_id) {
    warnings.push({ key: 'vehicle', label: 'Needs vehicle', tone: 'warning' });
  }

  if (route?.map_status === 'needs_pins') {
    warnings.push({ key: 'pins', label: 'Needs pins', tone: 'urgent' });
  } else if (route?.map_status === 'partially_mapped') {
    warnings.push({
      key: 'partial-pins',
      label: `${route.missing_stops || 0} pins missing`,
      tone: 'warning'
    });
  }

  if (stopWarnings > 0) {
    warnings.push({
      key: 'address-warnings',
      label: `${stopWarnings} address warning${stopWarnings === 1 ? '' : 's'}`,
      tone: 'warning'
    });
  }

  if ((roadFlags || []).length > 0) {
    warnings.push({
      key: 'road-flags',
      label: `${roadFlags.length} flagged road${roadFlags.length === 1 ? '' : 's'}`,
      tone: 'warning'
    });
  }

  return warnings;
}

export function buildBoundary(stops) {
  const mappableStops = (stops || []).filter(
    (stop) =>
      stop?.lat != null &&
      stop?.lng != null &&
      Number.isFinite(Number(stop.lat)) &&
      Number.isFinite(Number(stop.lng))
  );

  if (!mappableStops.length) {
    return null;
  }

  const latitudes = mappableStops.map((stop) => Number(stop.lat));
  const longitudes = mappableStops.map((stop) => Number(stop.lng));

  return {
    north: Math.max(...latitudes) + 0.005,
    south: Math.min(...latitudes) - 0.005,
    east: Math.max(...longitudes) + 0.005,
    west: Math.min(...longitudes) - 0.005
  };
}

export function getDistanceMiles(left, right) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const latDelta = toRadians(Number(right.lat) - Number(left.lat));
  const lngDelta = toRadians(Number(right.lng) - Number(left.lng));
  const lat1 = toRadians(Number(left.lat));
  const lat2 = toRadians(Number(right.lat));
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getRouteCentroid(stops = []) {
  const validStops = (stops || []).filter(
    (stop) =>
      stop?.lat != null &&
      stop?.lng != null &&
      Number.isFinite(Number(stop.lat)) &&
      Number.isFinite(Number(stop.lng))
  );

  if (!validStops.length) {
    return null;
  }

  return {
    lat: validStops.reduce((sum, stop) => sum + Number(stop.lat), 0) / validStops.length,
    lng: validStops.reduce((sum, stop) => sum + Number(stop.lng), 0) / validStops.length
  };
}

export function buildInfoWindow(stop) {
  const packageCount = getPackageCount(stop);
  const hasFloorLoad = Boolean(stop?.floor_load) || (stop?.packages || []).some((pkg) => pkg?.floor_load);
  const completionBadge = getCompletionBadge(stop);
  const stopType = getStopType(stop);
  const contact = getStopContactDetails(stop);
  const phoneLinks = [
    buildPhoneLink(contact.primaryPhone, 'Phone'),
    buildPhoneLink(contact.alternatePhone, 'Alt')
  ].filter(Boolean);
  const timeCommitLine = formatTimeCommit(stop);
  const timeCommitCopy = timeCommitLine
    ? stopType === 'pickup'
      ? `Pickup window: ${escapeHtml(timeCommitLine)}<br/><span style="font-weight:700; color:#9a6700;">Business closes at ${escapeHtml(stop.close_time)}</span>`
      : stopType === 'combined'
        ? `Delivery + pickup window: ${escapeHtml(timeCommitLine)}`
        : `Deliver between ${escapeHtml(timeCommitLine)}`
    : null;
  const addressLine1 = stop.address || 'No address available';
  const noteText = stop.has_note && stop.notes ? stop.notes : null;
  const locationAccuracy =
    stop.geocode_source === 'driver_verified'
      ? { color: '#0891b2', label: 'Driver-verified location' }
      : stop.geocode_source === 'tomtom' && stop.geocode_accuracy === 'point'
      ? { color: '#16a34a', label: 'Precise location' }
      : { color: '#6b7280', label: 'Street level' };
  const pickupContextCopy =
    stopType === 'pickup'
      ? 'Pickup stop'
      : stopType === 'combined'
        ? 'Delivery + pickup stop'
        : null;
  const apartmentIntelligence = stop.apartment_intelligence;
  const propertyIntel = stop.property_intel;
  const apartmentCopy =
    apartmentIntelligence?.unit_number
      ? `Unit ${escapeHtml(apartmentIntelligence.unit_number)}${
        Number.isFinite(Number(apartmentIntelligence.floor))
          ? ` • Floor ${escapeHtml(apartmentIntelligence.floor)}`
          : ''
      } • ${escapeHtml(apartmentIntelligence.verified ? 'Verified' : `${apartmentIntelligence.confidence} confidence ${apartmentIntelligence.source}`)}`
      : null;
  return `
    <div style="min-width:320px; max-width:430px; color:#173042; padding:10px 8px 8px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:14px;">
        <div style="font-size:22px; line-height:1; font-weight:950; letter-spacing:-0.02em;">${escapeHtml(getStopPopupTitle(stop))}</div>
        <div style="display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:#f1f5f9; color:#173042; font-size:18px; font-weight:950;" aria-label="${packageCount} packages">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" style="display:block;">
            <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" fill="#ff6200" opacity="0.16" stroke="#ff6200" stroke-width="1.8" />
            <path d="M4.4 8.6 12 13l7.6-4.4M12 13v6.6" fill="none" stroke="#ff6200" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>${packageCount}</span>
        </div>
      </div>
      ${stop.contact_name ? `<div style="margin-top:12px; font-size:18px; line-height:1.15; font-weight:950;">${escapeHtml(stop.contact_name)}</div>` : ''}
      ${
        phoneLinks.length
          ? `<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:8px 12px; font-size:14px; line-height:1.25;">${phoneLinks.join('')}</div>`
          : ''
      }
      <div style="margin-top:8px; font-size:20px; line-height:1.2; font-weight:950; letter-spacing:-0.02em; color:#173042;">${escapeHtml(addressLine1)}</div>
      ${
        stop.address_line2
          ? `<div style="margin-top:6px; font-size:16px; line-height:1.2; color:#5f6b76;"><span style="font-weight:900; color:#173042;">Unit / Access:</span> ${escapeHtml(stop.address_line2)}</div>`
          : ''
      }
      ${
        apartmentCopy
          ? `<div style="margin-top:8px; padding:8px 10px; border-radius:12px; background:#f5f3ff; color:#6d28d9; font-size:12px; font-weight:800;">
              ${apartmentCopy}
            </div>`
          : ''
      }
      ${
        propertyIntel?.access_note
          ? `<div style="margin-top:8px; padding:8px 10px; border-radius:12px; background:#f8fafc; color:#334155; font-size:12px; font-weight:700;">
              <span style="font-weight:900; color:#173042;">Access:</span> ${escapeHtml(propertyIntel.access_note)}
            </div>`
          : ''
      }
      ${
        propertyIntel?.parking_note
          ? `<div style="margin-top:8px; padding:8px 10px; border-radius:12px; background:#f8fafc; color:#334155; font-size:12px; font-weight:700;">
              <span style="font-weight:900; color:#173042;">Parking:</span> ${escapeHtml(propertyIntel.parking_note)}
            </div>`
          : ''
      }
      ${
        propertyIntel?.grouped_stops?.length
          ? `<div style="margin-top:8px; font-size:12px; color:#475569; font-weight:700;">
              Grouped stops: ${escapeHtml(
                propertyIntel.grouped_stops
                  .map((groupedStop) => `ST#${groupedStop.sequence_order}${groupedStop.unit ? ` Unit ${groupedStop.unit}` : ''}`)
                  .join(' • ')
              )}
            </div>`
          : ''
      }
      <div style="margin-top:12px; display:flex; align-items:center; gap:6px; color:${locationAccuracy.color}; font-size:13px; font-weight:850;">
        <span style="width:8px; height:8px; border-radius:50%; background:${locationAccuracy.color}; display:inline-block;"></span>
        <span>${locationAccuracy.label}</span>
      </div>
      ${
        hasFloorLoad
          ? `<div style="margin-top:12px; display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:#fff7ed; color:#9a3412; border:1px solid #ff6200; font-size:14px; font-weight:950;">
              FLOOR LOAD
            </div>`
          : ''
      }
      ${
        stop.exception_code
          ? `<div style="margin-top:12px; display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:#c93300; color:#ffffff; font-size:18px; font-weight:950;">
              ${escapeHtml(getExceptionBadgeMeta(stop.exception_code).label)}
            </div>`
          : ''
      }
      ${
        completionBadge
          ? `<div style="margin-top:12px; display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border-radius:999px; background:${completionBadge.background}; color:#ffffff; font-size:18px; font-weight:950;">
              <span style="font-size:22px; line-height:1;">${completionBadge.icon}</span>
              <span>${escapeHtml(completionBadge.time)}</span>
            </div>`
          : ''
      }
      ${
        timeCommitCopy
          ? `<div style="margin-top:10px; padding:8px 10px; border-radius:12px; background:#fff3cd; color:#8a5200; font-size:12px; font-weight:800;">
              ${timeCommitCopy}
            </div>`
          : ''
      }
      ${
        pickupContextCopy && !timeCommitCopy
          ? `<div style="margin-top:10px; padding:8px 10px; border-radius:12px; background:#eff6ff; color:#1d4ed8; font-size:12px; font-weight:800;">
              ${escapeHtml(pickupContextCopy)}
            </div>`
          : ''
      }
      ${
        noteText
          ? `<div style="margin-top:10px; padding:10px 12px; border-left:4px solid #ff6200; border-radius:10px; background:#fff7ed; font-size:12px; color:#7c2d12; font-weight:800;">
              Delivery note: ${escapeHtml(noteText)}
            </div>`
          : ''
      }
    </div>
  `;
}

export function buildDriverInfoWindow({ route, routeDriverName, nextStop, pendingTimeCommitCount }) {
  const nextStopAddress = nextStop?.address || 'No pending stop';
  const nextStopTimeCommit = formatTimeCommit(nextStop);
  const stopsPerHour = route?.stops_per_hour != null ? route.stops_per_hour : '—';

  return `
    <div style="min-width:280px; color:#173042; padding:8px 6px;">
      <div style="font-size:15px; font-weight:900;">${routeDriverName}</div>
      <div style="margin-top:4px; font-size:13px; color:#5f6b76; font-weight:700;">Work Area ${route?.work_area_name || '—'}</div>
      <div style="margin-top:10px; font-size:12px; color:#5f6b76;">${route?.completed_stops || 0} / ${route?.total_stops || 0} completed</div>
      <div style="margin-top:4px; font-size:12px; color:#5f6b76;">Stops/Hour: ${stopsPerHour}</div>
      <div style="margin-top:10px; font-size:12px; font-weight:900; color:#173042;">Next stop</div>
      <div style="margin-top:4px; font-size:12px; color:#374151;">${nextStopAddress}</div>
      ${
        nextStopTimeCommit
          ? `<div style="margin-top:8px; font-size:12px; font-weight:900; color:#b45309;">TC: ${nextStopTimeCommit}</div>`
          : ''
      }
      <div style="margin-top:8px; font-size:12px; color:#5f6b76;">Pending time commits remaining: ${pendingTimeCommitCount}</div>
    </div>
  `;
}
