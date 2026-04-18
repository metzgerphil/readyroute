import { format } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import MapLegend from '../components/MapLegend';
import StopListDrawer from '../components/StopListDrawer';
import api from '../services/api';
import { getPropertyWorkflowHint } from '../utils/pinWorkflow';
import { createDriverPositionMarker, createStopMarkerSVG, getMarkerZIndex } from '../utils/stopMarkers';
import './RoutePage.css';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const GOOGLE_MAPS_SRC = GOOGLE_MAPS_KEY
  ? `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly`
  : null;

const STATUS_META = {
  pending: { label: 'Pending', fill: '#1a2332', border: '#ffffff', text: '#ffffff' },
  delivered: { label: 'Delivered', fill: '#27ae60', border: '#1e8449', text: '#ffffff' },
  attempted: { label: 'Attempted', fill: '#f39c12', border: '#d68910', text: '#ffffff' },
  incomplete: { label: 'Incomplete', fill: '#e74c3c', border: '#cb4335', text: '#ffffff' }
};

const ROUTE_STATUS_META = {
  pending: { label: 'Pending', color: '#9ca3af' },
  ready: { label: 'Ready', color: '#3b82f6' },
  in_progress: { label: 'In Progress', color: '#FF6200' },
  complete: { label: 'Complete', color: '#27ae60' }
};

let googleMapsScriptPromise = null;

function loadGoogleMapsScript() {
  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_KEY === 'your_key_here') {
    return Promise.reject(new Error('missing_google_maps_key'));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google);
  }

  if (!googleMapsScriptPromise) {
    googleMapsScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-readyroute-google-maps="true"]');

      if (existingScript) {
        existingScript.addEventListener(
          'load',
          () => {
            if (window.google?.maps?.Map) {
              resolve(window.google);
            } else {
              reject(new Error('google_maps_auth_failed'));
            }
          },
          { once: true }
        );
        existingScript.addEventListener('error', () => reject(new Error('google_maps_script_failed')), { once: true });
        return;
      }

      window.__readyrouteGoogleMapsAuthFailed = false;
      window.gm_authFailure = () => {
        window.__readyrouteGoogleMapsAuthFailed = true;
      };

      const script = document.createElement('script');
      script.src = GOOGLE_MAPS_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.readyrouteGoogleMaps = 'true';
      script.onload = () => {
        if (window.__readyrouteGoogleMapsAuthFailed || !window.google?.maps?.Map) {
          reject(new Error('google_maps_auth_failed'));
          return;
        }
        resolve(window.google);
      };
      script.onerror = () => reject(new Error('google_maps_script_failed'));
      document.head.appendChild(script);
    });
  }

  return googleMapsScriptPromise;
}

function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd');
}

function getFriendlyDate(dateValue) {
  return format(new Date(`${dateValue}T12:00:00`), 'MMMM d, yyyy');
}

function getStatusMeta(status) {
  return STATUS_META[status] || STATUS_META.pending;
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

function getStopTypeLabel(stop) {
  const type = getStopType(stop);
  if (type === 'combined') {
    return 'Combined';
  }
  if (type === 'pickup') {
    return 'Pickup';
  }
  return 'Delivery';
}

function getPackageCount(stop) {
  return Array.isArray(stop.packages) ? stop.packages.length : 0;
}

function getDriverInitials(name) {
  const parts = String(name || '').split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return 'RR';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function formatTimeCommit(stop) {
  if (!stop.has_time_commit || !stop.ready_time || !stop.close_time) {
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

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatDateShort(timestamp) {
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

function warningFlagsToDraft(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function getExceptionBadgeMeta(code, isIncomplete = false) {
  if (isIncomplete && !code) {
    return { label: 'Incomplete', className: 'incomplete-only' };
  }

  const category2 = new Set(['001', '003', '004', '006', '007', '010', '030', '034', '250']);
  const category1 = new Set(['011', '012', '015', '016', '017', '027', '079', '081', '082', '083', '095', '100']);

  if (code === '002') {
    return { label: 'Code 002 — Bad Address', className: 'bad-address' };
  }

  if (category2.has(String(code))) {
    return { label: `Code ${code}`, className: 'category-2' };
  }

  if (category1.has(String(code))) {
    return { label: `Code ${code}`, className: 'category-1' };
  }

  return { label: code ? `Code ${code}` : 'Incomplete', className: 'category-default' };
}

function getFlagTypeMeta(flagType) {
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

function getRouteDispatchWarnings({ route, allStops, roadFlags = [] }) {
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

function buildBoundary(stops) {
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

function getDistanceMiles(left, right) {
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

function getRouteCentroid(stops = []) {
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

function buildInfoBadge(label, styles) {
  return `<span style="${styles}">${escapeHtml(label)}</span>`;
}

function formatWarningFlag(flag) {
  return String(flag || '')
    .replace(/_/g, ' ')
    .replace(/\b([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function getPinAccuracyLabel(stop) {
  return getPropertyWorkflowHint(stop).pinMeta.title;
}

function buildInfoWindow(stop) {
  const packageCount = getPackageCount(stop);
  const status = getStatusMeta(stop.status);
  const stopType = getStopType(stop);
  const typeLabel = getStopTypeLabel(stop);
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
  const exceptionText = stop.exception_code ? ` (${stop.exception_code})` : '';
  const locationAccuracy =
    stop.geocode_source === 'driver_verified'
      ? { color: '#0891b2', label: 'Driver-verified location' }
      : stop.geocode_source === 'tomtom' && stop.geocode_accuracy === 'point'
      ? { color: '#16a34a', label: 'Precise location' }
      : { color: '#6b7280', label: 'Street level' };
  const badges = [
    buildInfoBadge(
      typeLabel,
      'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#fff3e8; color:#ff6200; font-size:12px; font-weight:900;'
    )
  ];

  if (stop.is_business) {
    badges.push(
      buildInfoBadge(
        'Business',
        'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#111111; color:#ffffff; font-size:11px; font-weight:900;'
      )
    );
  }

  if (stop.is_apartment_unit) {
    badges.push(
      buildInfoBadge(
        'Apartment / Unit',
        'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#f3e8ff; color:#7c3aed; font-size:11px; font-weight:900;'
      )
    );
  }

  if (stop.has_note && noteText) {
    badges.push(
      buildInfoBadge(
        'Has note',
        'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#fff7ed; color:#c2410c; font-size:11px; font-weight:900;'
      )
    );
  }

  if (stop.has_time_commit && timeCommitLine) {
    badges.push(
      buildInfoBadge(
        `TC ${timeCommitLine}`,
        'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#fff3cd; color:#8a5200; font-size:11px; font-weight:900;'
      )
    );
  }

  const operationalLines = [
    packageCount ? `${packageCount} ${packageCount === 1 ? 'package' : 'packages'}` : '0 packages'
  ];

  if (stop.sid && stop.sid !== '0') {
    operationalLines.push(`SID ${stop.sid}`);
  }

  if (stop.delivery_type_code) {
    operationalLines.push(`Delivery code ${stop.delivery_type_code}`);
  }

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
  const propertyBadges = [];

  if (propertyIntel?.location_type) {
    propertyBadges.push(
      buildInfoBadge(
        String(propertyIntel.location_type).toUpperCase(),
        'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#e2e8f0; color:#173042; font-size:11px; font-weight:900;'
      )
    );
  }

  if (propertyIntel?.building) {
    propertyBadges.push(
      buildInfoBadge(
        propertyIntel.building,
        'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#e0f2fe; color:#0f4c81; font-size:11px; font-weight:900;'
      )
    );
  }

  (propertyIntel?.warning_flags || []).forEach((flag) => {
    propertyBadges.push(
      buildInfoBadge(
        formatWarningFlag(flag),
        'display:inline-flex; align-items:center; justify-content:center; padding:4px 10px; border-radius:999px; background:#fff7ed; color:#c2410c; font-size:11px; font-weight:900;'
      )
    );
  });

  return `
    <div style="min-width:300px; max-width:340px; color:#173042; padding:8px 6px;">
      <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <div style="font-size:15px; font-weight:900;">ST#${stop.sequence_order}</div>
      </div>
      <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:8px;">
        ${badges.join('')}
      </div>
      ${
        propertyBadges.length
          ? `<div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-top:8px;">
              ${propertyBadges.join('')}
            </div>`
          : ''
      }
      ${stop.contact_name ? `<div style="margin-top:8px; font-size:14px; font-weight:900;">${stop.contact_name}</div>` : ''}
      <div style="margin-top:6px; font-size:13px; font-weight:700; color:#173042;">${escapeHtml(addressLine1)}</div>
      ${
        stop.address_line2
          ? `<div style="margin-top:2px; font-size:12px; color:#6b7280;"><span style="font-weight:800; color:#4b5563;">Unit / Access:</span> ${escapeHtml(stop.address_line2)}</div>`
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
      <div style="margin-top:8px; display:flex; align-items:center; gap:6px; color:${locationAccuracy.color}; font-size:12px; font-weight:800;">
        <span style="width:8px; height:8px; border-radius:50%; background:${locationAccuracy.color}; display:inline-block;"></span>
        <span>${locationAccuracy.label}</span>
      </div>
      <div style="margin-top:8px; font-size:12px; color:#5f6b76;">${operationalLines.map(escapeHtml).join(' • ')}</div>
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
      <div style="margin-top:10px;">
        <span style="display:inline-flex; align-items:center; justify-content:center; min-height:28px; padding:0 12px; border-radius:999px; background:${status.fill}; color:${status.text}; font-size:12px; font-weight:900; border:${stop.status === 'pending' ? '1px solid #ffffff' : 'none'};">
          ${status.label}${exceptionText}
        </span>
      </div>
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

function buildDriverInfoWindow({ route, routeDriverName, nextStop, pendingTimeCommitCount }) {
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

export default function RoutePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const infoWindowRef = useRef(null);
  const stopMarkersRef = useRef(new Map());
  const driverMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const territoryFillRef = useRef(null);
  const territoryBorderRef = useRef(null);
  const exceptionsPanelRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const mapStabilizeTimerRef = useRef(null);
  const [date, setDate] = useState(getTodayString());
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapType, setMapType] = useState('roadmap');
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showStopDrawer, setShowStopDrawer] = useState(false);
  const [stopDrawerFilterCount, setStopDrawerFilterCount] = useState(0);
  const [showExceptions, setShowExceptions] = useState(false);
  const [activeExceptionsTab, setActiveExceptionsTab] = useState('exceptions');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [noteEditorStopId, setNoteEditorStopId] = useState(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingPropertyIntel, setIsSavingPropertyIntel] = useState(false);
  const [propertyEditorStopId, setPropertyEditorStopId] = useState(null);
  const [propertyDraft, setPropertyDraft] = useState({
    property_type: '',
    building: '',
    access_note: '',
    parking_note: '',
    warning_flags: ''
  });
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  function clearMapArtifacts() {
    stopMarkersRef.current.forEach((marker) => marker.setMap(null));
    stopMarkersRef.current.clear();

    if (driverMarkerRef.current) {
      driverMarkerRef.current.setMap(null);
      driverMarkerRef.current = null;
    }

    if (routePolylineRef.current) {
      routePolylineRef.current.setMap(null);
      routePolylineRef.current = null;
    }

    if (territoryFillRef.current) {
      territoryFillRef.current.setMap(null);
      territoryFillRef.current = null;
    }

    if (territoryBorderRef.current) {
      territoryBorderRef.current.setMap(null);
      territoryBorderRef.current = null;
    }
  }

  const routesQuery = useQuery({
    queryKey: ['route-page-routes', date],
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date } });
      return response.data?.routes || [];
    }
  });

  const routeOptions = routesQuery.data || [];

  useEffect(() => {
    if (!id || routesQuery.isLoading) {
      return;
    }

    if (routeOptions.length && !routeOptions.some((route) => route.id === id)) {
      navigate(`/routes/${routeOptions[0].id}`, { replace: true });
    }
  }, [id, navigate, routeOptions, routesQuery.isLoading]);

  const routeDetailQuery = useQuery({
    queryKey: ['route-page-detail', id, date],
    queryFn: async () => {
      const response = await api.get(`/manager/routes/${id}/stops`, { params: { date } });
      return response.data;
    },
    enabled: Boolean(id)
  });

  const driverPositionQuery = useQuery({
    queryKey: ['route-page-driver-position', id],
    queryFn: async () => {
      const response = await api.get(`/manager/routes/${id}/driver-position`);
      return response.data;
    },
    enabled: Boolean(id),
    refetchInterval: 30000
  });

  const roadFlagsQuery = useQuery({
    queryKey: ['route-page-road-flags', id, date],
    queryFn: async () => {
      const response = await api.get(`/manager/routes/${id}/road-flags`, { params: { date } });
      return response.data?.road_flags || [];
    },
    enabled: Boolean(id)
  });

  const routeDetail = routeDetailQuery.data;
  const route = routeDetail?.route || routeOptions.find((item) => item.id === id) || null;
  const coordinateRecovery = routeDetail?.coordinate_recovery || null;
  const allStops = routeDetail?.stops || [];
  const mappableStops = useMemo(
    () =>
      allStops.filter(
        (stop) =>
          stop?.lat != null &&
          stop?.lng != null &&
          Number.isFinite(Number(stop.lat)) &&
          Number.isFinite(Number(stop.lng))
      ),
    [allStops]
  );
  const orderedStops = useMemo(
    () => [...mappableStops].sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0)),
    [mappableStops]
  );
  const routeBounds = useMemo(() => buildBoundary(allStops), [allStops]);
  const routeCentroid = useMemo(() => getRouteCentroid(allStops), [allStops]);
  const exceptionStops = useMemo(
    () => allStops.filter((stop) => stop.exception_code),
    [allStops]
  );
  const incompleteStops = useMemo(
    () => allStops.filter((stop) => stop.status === 'incomplete'),
    [allStops]
  );
  const roadFlags = roadFlagsQuery.data || [];
  const routeExceptionCount = exceptionStops.length + incompleteStops.length;
  const routeDispatchWarnings = useMemo(
    () => getRouteDispatchWarnings({ route, allStops, roadFlags }),
    [route, allStops, roadFlags]
  );
  const nextStop = useMemo(
    () => allStops.find((stop) => stop.status === 'pending') || null,
    [allStops]
  );
  const pendingTimeCommitCount = useMemo(
    () => allStops.filter((stop) => stop.status === 'pending' && stop.has_time_commit).length,
    [allStops]
  );
  const livePosition = driverPositionQuery.data || null;
  const routeDriverName = livePosition?.driver_name || route?.driver_name || 'Unassigned';
  const routeStatusMeta = ROUTE_STATUS_META[route?.status] || ROUTE_STATUS_META.pending;
  const selectedStop = allStops.find((stop) => stop.id === selectedStopId) || null;
  const noteEditorStop = allStops.find((stop) => stop.id === noteEditorStopId) || null;
  const propertyEditorStop = allStops.find((stop) => stop.id === propertyEditorStopId) || null;

  useEffect(() => {
    if (!actionMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setActionMessage(''), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [actionMessage]);

  useEffect(() => {
    if (!actionError) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setActionError(''), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [actionError]);

  useEffect(() => {
    setSelectedStopId(null);
    setMapReady(false);
    infoWindowRef.current?.close();
  }, [id, date]);

  useEffect(() => {
    if (!showExceptions) {
      return undefined;
    }

    function handleOutsideClick(event) {
      if (
        exceptionsPanelRef.current &&
        !exceptionsPanelRef.current.contains(event.target) &&
        !event.target.closest('.route-map-warning-button')
      ) {
        setShowExceptions(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showExceptions]);

  useEffect(() => {
    let active = true;

    function clearPendingStabilizeTimer() {
      if (mapStabilizeTimerRef.current) {
        window.clearTimeout(mapStabilizeTimerRef.current);
        mapStabilizeTimerRef.current = null;
      }
    }

    function stabilizeMap(google, map) {
      if (!active || !google?.maps || !map) {
        return;
      }

      clearPendingStabilizeTimer();

      window.requestAnimationFrame(() => {
        if (!active || !mapInstanceRef.current) {
          return;
        }

        google.maps.event.trigger(map, 'resize');

        mapStabilizeTimerRef.current = window.setTimeout(() => {
          if (!active || !mapInstanceRef.current) {
            return;
          }

          google.maps.event.trigger(map, 'resize');

          if (orderedStops.length) {
            fitRoute();
          } else {
            map.setCenter({ lat: 33.1217, lng: -117.0815 });
            map.setZoom(11);
          }

          setMapReady(true);
        }, 180);
      });
    }

    async function initMap() {
      if (!mapContainerRef.current) {
        return;
      }

      try {
        const google = await loadGoogleMapsScript();

        if (!active || !mapContainerRef.current) {
          return;
        }

        setMapError('');

        const shouldCreateFreshMap =
          !mapInstanceRef.current ||
          (typeof mapInstanceRef.current.getDiv === 'function' && mapInstanceRef.current.getDiv() !== mapContainerRef.current);

        if (shouldCreateFreshMap) {
          clearMapArtifacts();
          setMapReady(false);
          mapInstanceRef.current = new google.maps.Map(mapContainerRef.current, {
            center: { lat: 33.1217, lng: -117.0815 },
            zoom: 11,
            mapTypeId: mapType,
            mapTypeControl: false,
            streetViewControl: true,
            fullscreenControl: true,
            zoomControl: true
          });
          infoWindowRef.current = new google.maps.InfoWindow({
            disableAutoPan: true
          });

          google.maps.event.addListenerOnce(mapInstanceRef.current, 'idle', () => {
            stabilizeMap(google, mapInstanceRef.current);
          });
        } else {
          stabilizeMap(google, mapInstanceRef.current);
        }

        if (mapContainerRef.current && 'ResizeObserver' in window) {
          resizeObserverRef.current?.disconnect();
          resizeObserverRef.current = new ResizeObserver(() => {
            if (!mapInstanceRef.current || !window.google?.maps) {
              return;
            }

            stabilizeMap(window.google, mapInstanceRef.current);
          });
          resizeObserverRef.current.observe(mapContainerRef.current);
        }
      } catch (error) {
        console.error('RoutePage Google Maps load failed:', error);
        if (active) {
          setMapReady(false);
          setMapError('Google Maps could not load for this route view.');
        }
      }
    }

    initMap();

    return () => {
      active = false;
      clearPendingStabilizeTimer();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [orderedStops.length]);

  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!google?.maps || !map) {
      return;
    }

    map.setMapTypeId(mapType);
    window.requestAnimationFrame(() => {
      google.maps.event.trigger(map, 'resize');
    });
  }, [mapType]);

  useEffect(() => {
    if (routeDetailQuery.isLoading) {
      return;
    }

    if ((route?.total_stops || 0) > 0 && allStops.length === 0) {
      setMapError('This route record exists, but its stops did not finish importing. Re-upload the manifest for this route.');
      return;
    }

    if (allStops.length > 0 && mappableStops.length === 0) {
      const attempted = Number(coordinateRecovery?.attempted || 0);
      const recovered = Number(coordinateRecovery?.recovered || 0);

      if (attempted > 0 && recovered === 0) {
        setMapError('This route loaded without coordinates, so the map cannot render those stops yet.');
        return;
      }
    }

    if (
      mapError === 'This route loaded without coordinates, so the map cannot render those stops yet.' ||
      mapError === 'This route record exists, but its stops did not finish importing. Re-upload the manifest for this route.'
    ) {
      setMapError('');
    }
  }, [allStops.length, coordinateRecovery?.attempted, coordinateRecovery?.recovered, mappableStops.length, route?.total_stops, routeDetailQuery.isLoading]);

  function fitRoute() {
    const google = window.google;
    const map = mapInstanceRef.current;

    if (!google?.maps || !map) {
      return;
    }

    const bounds = new google.maps.LatLngBounds();

    orderedStops.forEach((stop) => {
      bounds.extend({ lat: Number(stop.lat), lng: Number(stop.lng) });
    });

    if (
      livePosition?.lat != null &&
      livePosition?.lng != null &&
      routeCentroid &&
      getDistanceMiles(
        { lat: Number(livePosition.lat), lng: Number(livePosition.lng) },
        routeCentroid
      ) <= 50
    ) {
      bounds.extend({ lat: Number(livePosition.lat), lng: Number(livePosition.lng) });
    }

    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 72);
    }
  }

  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;

    if (!google?.maps || !map || !mapReady) {
      return;
    }

    clearMapArtifacts();

    orderedStops.forEach((stop) => {
      const marker = new google.maps.Marker({
        map,
        position: { lat: Number(stop.lat), lng: Number(stop.lng) },
        title: `Stop ${stop.sequence_order}`,
        icon: createStopMarkerSVG(stop, stop.id === selectedStopId),
        zIndex: getMarkerZIndex(stop, stop.id === selectedStopId)
      });

      marker.addListener('click', () => {
        setSelectedStopId(stop.id);
        infoWindow.setContent(buildInfoWindow(stop));
        infoWindow.open({ anchor: marker, map, shouldFocus: false });
      });

      marker.addListener('mouseover', () => {
        infoWindow.setContent(buildInfoWindow(stop));
        infoWindow.open({ anchor: marker, map, shouldFocus: false });
      });

      marker.addListener('mouseout', () => {
        if (selectedStopId !== stop.id) {
          infoWindow.close();
        }
      });

      stopMarkersRef.current.set(stop.id, marker);
    });

    if (orderedStops.length > 1) {
      routePolylineRef.current = new google.maps.Polyline({
        map,
        path: orderedStops.map((stop) => ({ lat: Number(stop.lat), lng: Number(stop.lng) })),
        strokeColor: '#4285F4',
        strokeOpacity: 1,
        strokeWeight: 3,
        zIndex: 2
      });
    }

    if (routeBounds) {
      territoryFillRef.current = new google.maps.Rectangle({
        map,
        bounds: routeBounds,
        strokeOpacity: 0,
        strokeWeight: 0,
        fillColor: '#4CAF50',
        fillOpacity: 0.04
      });

      territoryBorderRef.current = new google.maps.Polyline({
        map,
        path: [
          { lat: routeBounds.north, lng: routeBounds.west },
          { lat: routeBounds.north, lng: routeBounds.east },
          { lat: routeBounds.south, lng: routeBounds.east },
          { lat: routeBounds.south, lng: routeBounds.west },
          { lat: routeBounds.north, lng: routeBounds.west }
        ],
        strokeOpacity: 0,
        strokeWeight: 1.5,
        icons: [
          {
            icon: {
              path: 'M 0,-1 0,1',
              strokeColor: '#333333',
              strokeOpacity: 0.6,
              strokeWeight: 1.5,
              scale: 4
            },
            offset: '0',
            repeat: '12px'
          }
        ],
        zIndex: 1
      });
    }

    if (
      livePosition?.lat != null &&
      livePosition?.lng != null &&
      routeCentroid &&
      getDistanceMiles(
        { lat: Number(livePosition.lat), lng: Number(livePosition.lng) },
        routeCentroid
      ) <= 50
    ) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: Number(livePosition.lat), lng: Number(livePosition.lng) },
        title: routeDriverName,
        icon: createDriverPositionMarker(routeDriverName, route?.status),
        zIndex: 30
      });

      marker.addListener('click', () => {
        infoWindow.setContent(buildDriverInfoWindow({ route, routeDriverName, nextStop, pendingTimeCommitCount }));
        infoWindow.open({ anchor: marker, map });
      });

      driverMarkerRef.current = marker;
    }

    if (orderedStops.length) {
      fitRoute();
    }
  }, [
    mapReady,
    orderedStops,
    routeBounds,
    routeCentroid,
    livePosition?.lat,
    livePosition?.lng,
    routeDriverName,
    route?.status,
    nextStop,
    pendingTimeCommitCount
  ]);

  useEffect(() => {
    const google = window.google;
    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;

    if (!google?.maps || !map || !selectedStopId) {
      return;
    }

    stopMarkersRef.current.forEach((marker, stopId) => {
      const stop = orderedStops.find((item) => item.id === stopId);
      if (!stop) {
        return;
      }

      marker.setIcon(createStopMarkerSVG(stop, stopId === selectedStopId));
      marker.setZIndex(getMarkerZIndex(stop, stopId === selectedStopId));
    });

    const selectedMarker = stopMarkersRef.current.get(selectedStopId);
    const selectedStop = orderedStops.find((stop) => stop.id === selectedStopId);

    if (selectedMarker && selectedStop) {
      infoWindow.setContent(buildInfoWindow(selectedStop));
      infoWindow.open({ anchor: selectedMarker, map, shouldFocus: false });
    }
  }, [orderedStops, selectedStopId]);

  function handleRouteChange(nextRouteId) {
    if (!nextRouteId) {
      return;
    }
    navigate(`/routes/${nextRouteId}`);
  }

  function handleDateChange(nextDate) {
    setDate(nextDate);
    setSelectedStopId(null);
  }

  function handleStopClick(stop) {
    setSelectedStopId(stop.id);
    setShowExceptions(false);
    centerOnStop(stop);
  }

  function openNoteEditor(stop = selectedStop || nextStop || null) {
    if (!stop) {
      setActionError('Select a stop first, then add or edit the address note.');
      return;
    }

    setNoteEditorStopId(stop.id);
    setNoteDraft(stop.notes || '');
    setActionError('');
  }

  function closeNoteEditor() {
    setNoteEditorStopId(null);
    setNoteDraft('');
  }

  function openPropertyEditor(stop = selectedStop || nextStop || null) {
    if (!stop) {
      setActionError('Select a stop first, then edit building intel.');
      return;
    }

    const propertyIntel = stop.property_intel || {};

    setPropertyEditorStopId(stop.id);
    setPropertyDraft({
      property_type: propertyIntel.location_type || '',
      building: propertyIntel.building || '',
      access_note: propertyIntel.access_note || propertyIntel.entry_note || '',
      parking_note: propertyIntel.parking_note || '',
      warning_flags: warningFlagsToDraft(propertyIntel.warning_flags)
    });
    setActionError('');
  }

  function closePropertyEditor() {
    setPropertyEditorStopId(null);
    setPropertyDraft({
      property_type: '',
      building: '',
      access_note: '',
      parking_note: '',
      warning_flags: ''
    });
  }

  function centerOnStop(stop) {
    const map = mapInstanceRef.current;
    const marker = stopMarkersRef.current.get(stop.id);

    if (!map || !marker) {
      return;
    }

    setSelectedStopId(stop.id);
    map.panTo(marker.getPosition());
  }

  function centerOnRoadFlag(flag) {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    const startLat = Number(flag.lat_start);
    const startLng = Number(flag.lng_start);
    const endLat = Number(flag.lat_end);
    const endLng = Number(flag.lng_end);
    const lat = Number.isFinite(startLat) && Number.isFinite(endLat) ? (startLat + endLat) / 2 : startLat;
    const lng = Number.isFinite(startLng) && Number.isFinite(endLng) ? (startLng + endLng) / 2 : startLng;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return;
    }

    setShowExceptions(false);
    map.panTo({ lat, lng });
    map.setZoom(Math.max(map.getZoom() || 14, 15));
  }

  async function handleSaveAddressNote() {
    if (!noteEditorStop) {
      return;
    }

    setIsSavingNote(true);
    setActionError('');

    try {
      await api.patch(`/manager/routes/stops/${noteEditorStop.id}/note`, {
        note_text: noteDraft
      });
      await queryClient.invalidateQueries({ queryKey: ['route-page-detail', id, date] });
      await queryClient.invalidateQueries({ queryKey: ['manager-routes', date] });
      setActionMessage(`Saved note for stop ${noteEditorStop.sequence_order}. Future deliveries will reuse it.`);
      closeNoteEditor();
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to save the address note.');
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleSavePropertyIntel() {
    if (!propertyEditorStop) {
      return;
    }

    setIsSavingPropertyIntel(true);
    setActionError('');

    try {
      await api.patch(`/manager/routes/stops/${propertyEditorStop.id}/property-intel`, {
        property_type: propertyDraft.property_type || null,
        building: propertyDraft.building || null,
        access_note: propertyDraft.access_note || null,
        parking_note: propertyDraft.parking_note || null,
        warning_flags: propertyDraft.warning_flags
          .split(',')
          .map((flag) => flag.trim().toLowerCase())
          .filter(Boolean)
      });
      await queryClient.invalidateQueries({ queryKey: ['route-page-detail', id, date] });
      setActionMessage(`Saved building intel for ST#${propertyEditorStop.sequence_order}.`);
      closePropertyEditor();
    } catch (error) {
      setActionError(error.response?.data?.error || 'Failed to save building intel.');
    } finally {
      setIsSavingPropertyIntel(false);
    }
  }

  if (routesQuery.isLoading || routeDetailQuery.isLoading) {
    return (
      <section className="page-section route-page-shell">
        <div className="card">Loading route detail...</div>
      </section>
    );
  }

  if (routesQuery.isError || routeDetailQuery.isError) {
    return (
      <section className="page-section route-page-shell">
        <div className="card">
          {routeDetailQuery.error?.response?.data?.error ||
            routesQuery.error?.response?.data?.error ||
            'Route detail failed to load.'}
        </div>
      </section>
    );
  }

  if (!route) {
    return (
      <section className="page-section route-page-shell">
        <div className="card">Route not found for this date.</div>
      </section>
    );
  }

  return (
    <section className="page-section route-page-shell">
      <header className={`route-page-header ${isHeaderCollapsed ? 'collapsed' : ''}`}>
        <div className="route-page-titlebar">
          <div className="route-page-title-block">
            <div className="route-page-company-line">BRIDGE TRANSPORTATION INC — READYROUTE</div>
            <h1>{`Route ${route.work_area_name} (${route.total_stops}) — ${routeDriverName}`}</h1>
          </div>

          <div className="route-page-titlebar-actions">
            <div className="route-page-brand-mark" aria-label="ReadyRoute">
              <span className="route-page-brand-ready">ready</span>
              <span className="route-page-brand-route">Route</span>
            </div>
          </div>
        </div>

        <div className="route-page-status-strip" style={{ backgroundColor: routeStatusMeta.color }}>
          <span>{routeStatusMeta.label}</span>
        </div>

        <div className="route-page-header-controls">
          <button
            className="route-page-collapse-toggle"
            onClick={() => setIsHeaderCollapsed((value) => !value)}
            type="button"
          >
            <span className="route-page-collapse-icon" aria-hidden="true">{isHeaderCollapsed ? '▾' : '▴'}</span>
            <span>{isHeaderCollapsed ? 'Expand Route Header' : 'Collapse Route Header'}</span>
          </button>
        </div>

        {isHeaderCollapsed ? (
          <div className="route-page-collapsed-summary">
            <span><strong>Date:</strong> {getFriendlyDate(date)}</span>
            <span><strong>Stops:</strong> {route.total_stops}</span>
            <span><strong>Driver:</strong> {routeDriverName}</span>
            <button className="route-toolbar-button route-toolbar-secondary" type="button" onClick={() => setShowStopDrawer(true)}>
              <span className="route-toolbar-icon" aria-hidden="true">≣</span>
              View Stops
            </button>
          </div>
        ) : (
          <>
            <div className="route-page-toolbar-row">
              <div className="route-page-toolbar route-page-toolbar-left-group">
                <label className="route-page-field">
                  <span>Route</span>
                  <select className="text-field route-toolbar-input" value={route.id} onChange={(event) => handleRouteChange(event.target.value)}>
                    {routeOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.work_area_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="route-page-field">
                  <span>Date</span>
                  <input
                    className="date-field route-toolbar-input"
                    type="date"
                    value={date}
                    onChange={(event) => handleDateChange(event.target.value)}
                  />
                </label>

                <button className="route-page-filter-button route-toolbar-button" type="button" onClick={() => setShowStopDrawer((value) => !value)}>
                  <span className="route-toolbar-icon" aria-hidden="true">⌯</span>
                  Stop Filters
                  <span className="route-page-filter-count">{stopDrawerFilterCount}</span>
                </button>
              </div>

              <div className="route-page-toolbar route-page-toolbar-right-group">
                <button className="route-toolbar-button route-toolbar-secondary" type="button" onClick={() => setShowStopDrawer(true)}>
                  <span className="route-toolbar-icon" aria-hidden="true">≣</span>
                  View Stops
                </button>

                <button
                  className="route-toolbar-button route-toolbar-secondary"
                  type="button"
                  onClick={() => openNoteEditor()}
                >
                  <span className="route-toolbar-icon" aria-hidden="true">✎</span>
                  Edit Address Note
                </button>

                <button
                  className="route-toolbar-button route-toolbar-secondary"
                  type="button"
                  onClick={() => openPropertyEditor()}
                >
                  <span className="route-toolbar-icon" aria-hidden="true">⌂</span>
                  Edit Building Intel
                </button>

              </div>
            </div>

            {actionMessage ? <div className="route-page-feedback success">{actionMessage}</div> : null}
            {actionError ? <div className="route-page-feedback error">{actionError}</div> : null}
            {routeDispatchWarnings.length ? (
              <div className="route-dispatch-alert">
                <div className="route-dispatch-alert-copy">
                  <strong>Dispatch review</strong>
                  <span>This route still has items worth checking before a driver heads out.</span>
                </div>
                <div className="route-dispatch-alert-chips">
                  {routeDispatchWarnings.map((warning) => (
                    <span className={`route-dispatch-chip ${warning.tone}`} key={warning.key}>
                      {warning.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="route-dispatch-alert ready">
                <div className="route-dispatch-alert-copy">
                  <strong>Dispatch review</strong>
                  <span>This route has the basic driver, vehicle, and map coverage checks in place.</span>
                </div>
              </div>
            )}
          </>
        )}
      </header>

      <div className="route-map-stage">
        <div ref={mapContainerRef} className="route-map-fullscreen" />
        {mapError ? <div className="route-map-error">{mapError}</div> : null}

        <div className="route-map-toolbar-left">
          <button type="button" className="route-map-tool" onClick={() => setShowStopDrawer((value) => !value)} title="Stop list">
            ≣
          </button>
          <button type="button" className="route-map-tool" onClick={fitRoute} title="Recenter map">
            ⌖
          </button>
          <button type="button" className="route-map-tool" onClick={() => setShowLegend((value) => !value)} title="Toggle legend">
            ⓘ
          </button>
        </div>

        <div className="route-map-toolbar-right">
          <button
            type="button"
            className="route-map-warning-button"
            onClick={() => setShowExceptions((value) => !value)}
            title="Route exceptions"
          >
            <span className="route-map-warning-icon">⚠</span>
            <span className="route-map-warning-badge">{routeExceptionCount}</span>
          </button>

          <button
            type="button"
            className="route-map-toggle-button"
            onClick={() => setMapType((value) => (value === 'roadmap' ? 'satellite' : 'roadmap'))}
          >
            {mapType === 'roadmap' ? 'Satellite' : 'Map'}
          </button>
        </div>

        <button type="button" className="route-map-fit-button" onClick={fitRoute}>
          Fit to route
        </button>

        <MapLegend hidden={!showLegend} />

        {showExceptions ? (
          <aside ref={exceptionsPanelRef} className="route-map-exceptions-panel">
            <div className="route-map-panel-header">
              <h2>Route Exceptions</h2>
              <button type="button" className="route-map-panel-close" onClick={() => setShowExceptions(false)}>
                ×
              </button>
            </div>
            <div className="route-exceptions-tabs">
              <button
                type="button"
                className={`route-exceptions-tab ${activeExceptionsTab === 'exceptions' ? 'active' : ''}`}
                onClick={() => setActiveExceptionsTab('exceptions')}
              >
                Exceptions
                <span className="route-exceptions-tab-badge">{exceptionStops.length}</span>
              </button>
              <button
                type="button"
                className={`route-exceptions-tab ${activeExceptionsTab === 'flagged-roads' ? 'active' : ''}`}
                onClick={() => setActiveExceptionsTab('flagged-roads')}
              >
                Flagged Roads
                <span className="route-exceptions-tab-badge">{roadFlags.length}</span>
              </button>
              <button
                type="button"
                className={`route-exceptions-tab ${activeExceptionsTab === 'incomplete' ? 'active' : ''}`}
                onClick={() => setActiveExceptionsTab('incomplete')}
              >
                Incomplete
                <span className="route-exceptions-tab-badge">{incompleteStops.length}</span>
              </button>
            </div>
            <div className="route-map-panel-body route-exceptions-body">
              {activeExceptionsTab === 'exceptions' ? (
                exceptionStops.length ? (
                  exceptionStops.map((stop) => {
                    const badge = getExceptionBadgeMeta(stop.exception_code, false);
                    return (
                      <button
                        key={stop.id}
                        type="button"
                        className="route-exception-row"
                        onClick={() => {
                          setShowExceptions(false);
                          centerOnStop(stop);
                        }}
                      >
                        <div className="route-exception-time">{formatTimestamp(stop.completed_at)}</div>
                        <div className="route-exception-stop-badge">{stop.sequence_order}</div>
                        <div className="route-exception-address">
                          <strong>{stop.contact_name || `Stop ${stop.sequence_order}`}</strong>
                          <span>{stop.address}</span>
                        </div>
                        <div className={`route-exception-code-badge ${badge.className}`}>{badge.label}</div>
                      </button>
                    );
                  })
                ) : (
                  <div className="route-map-panel-empty route-panel-empty-success">No exceptions on this route today ✓</div>
                )
              ) : null}

              {activeExceptionsTab === 'flagged-roads' ? (
                roadFlags.length ? (
                  roadFlags.map((flag) => {
                    const flagMeta = getFlagTypeMeta(flag.flag_type);
                    return (
                      <button
                        key={flag.id}
                        type="button"
                        className="route-flag-row"
                        onClick={() => centerOnRoadFlag(flag)}
                      >
                        <div className={`route-flag-type-badge ${flagMeta.className}`}>{flagMeta.label}</div>
                        <div className="route-flag-main">
                          <strong>{flag.notes || 'Flagged road segment'}</strong>
                          <span>{flag.driver_name || 'Unknown driver'}</span>
                          <small>{formatDateShort(flag.created_at)}</small>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="route-map-panel-empty">No roads flagged on this route</div>
                )
              ) : null}

              {activeExceptionsTab === 'incomplete' ? (
                incompleteStops.length ? (
                  incompleteStops.map((stop) => (
                    <button
                      key={stop.id}
                      type="button"
                      className="route-incomplete-row"
                      onClick={() => {
                        setShowExceptions(false);
                        centerOnStop(stop);
                      }}
                    >
                      <div className="route-exception-stop-badge">{stop.sequence_order}</div>
                      <div className="route-exception-address">
                        <strong>{stop.contact_name || `Stop ${stop.sequence_order}`}</strong>
                        <span>{stop.address}</span>
                      </div>
                      <div className="route-exception-code-badge incomplete-only">Incomplete</div>
                    </button>
                  ))
                ) : (
                  <div className="route-map-panel-empty route-panel-empty-success">No incomplete stops on this route ✓</div>
                )
              ) : null}
            </div>
          </aside>
        ) : null}

        <StopListDrawer
          open={showStopDrawer}
          stops={allStops}
          selectedStopId={selectedStopId}
          onClose={() => setShowStopDrawer(false)}
          onSelectStop={handleStopClick}
          onFilterCountChange={setStopDrawerFilterCount}
        />

        {noteEditorStop ? (
          <div className="route-note-modal-backdrop" onClick={closeNoteEditor}>
            <div className="route-note-modal" onClick={(event) => event.stopPropagation()}>
              <div className="route-note-modal-header">
                <div>
                  <h2>Edit Address Note</h2>
                  <p>{`Stop ${noteEditorStop.sequence_order} · ${noteEditorStop.address}`}</p>
                </div>
                <button type="button" className="route-note-modal-close" onClick={closeNoteEditor}>×</button>
              </div>
              <textarea
                className="route-note-modal-input"
                placeholder="Add delivery access info, gate codes, apartment guidance, or other future-use details..."
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
              />
              <div className="route-note-modal-help">
                {noteEditorStop.is_apartment_unit ? 'This note will be reused for this apartment/unit when possible.' : 'This note will be reused for future deliveries to this address.'}
              </div>
              <div className="route-note-modal-actions">
                <button type="button" className="route-toolbar-button route-toolbar-secondary" onClick={closeNoteEditor}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="route-toolbar-button route-toolbar-push"
                  onClick={handleSaveAddressNote}
                  disabled={isSavingNote}
                >
                  {isSavingNote ? 'Saving...' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {propertyEditorStop ? (
          <div className="route-note-modal-backdrop" onClick={closePropertyEditor}>
            <div className="route-note-modal" onClick={(event) => event.stopPropagation()}>
              {(() => {
                const workflowHint = getPropertyWorkflowHint(propertyEditorStop);

                return (
                  <>
              <div className="route-note-modal-header">
                <div>
                  <h2>Edit Building Intel</h2>
                  <p>{`ST#${propertyEditorStop.sequence_order} · ${propertyEditorStop.address}`}</p>
                </div>
                <button type="button" className="route-note-modal-close" onClick={closePropertyEditor}>×</button>
              </div>

              <div className="route-note-modal-help">
                {workflowHint.profile.length ? workflowHint.profile.join(' · ') : 'No parsed profile hints on this stop yet.'}
              </div>

              <div className="route-pin-workflow-panel">
                <div className="route-pin-workflow-header">
                  <span className={`route-pin-workflow-badge ${workflowHint.pinMeta.badgeClassName}`}>{workflowHint.pinMeta.shortLabel}</span>
                  <strong>{workflowHint.pinMeta.title}</strong>
                </div>
                <div className="route-pin-workflow-copy">{workflowHint.pinMeta.detail}</div>
                <div className="route-pin-workflow-recommendation">{workflowHint.pinMeta.recommendation}</div>
              </div>

              <div className="route-property-grid">
                <label className="route-property-field">
                  <span>Location Type</span>
                  <input
                    className="route-property-input"
                    type="text"
                    placeholder="apartment, office, business..."
                    value={propertyDraft.property_type}
                    onChange={(event) => setPropertyDraft((current) => ({ ...current, property_type: event.target.value }))}
                  />
                </label>

                <label className="route-property-field">
                  <span>Building</span>
                  <input
                    className="route-property-input"
                    type="text"
                    placeholder="Building A, Tower 2, Dock 4..."
                    value={propertyDraft.building}
                    onChange={(event) => setPropertyDraft((current) => ({ ...current, building: event.target.value }))}
                  />
                </label>
              </div>

              <label className="route-property-field">
                <span>Access Note</span>
                <textarea
                  className="route-note-modal-input route-note-modal-input-compact"
                  placeholder="Gate code, callbox, lobby, front desk, dock instructions..."
                  value={propertyDraft.access_note}
                  onChange={(event) => setPropertyDraft((current) => ({ ...current, access_note: event.target.value }))}
                />
              </label>

              <label className="route-property-field">
                <span>Parking Note</span>
                <textarea
                  className="route-note-modal-input route-note-modal-input-compact"
                  placeholder="Visitor lot, curbside, loading zone, best entrance..."
                  value={propertyDraft.parking_note}
                  onChange={(event) => setPropertyDraft((current) => ({ ...current, parking_note: event.target.value }))}
                />
              </label>

              <label className="route-property-field">
                <span>Warning Flags</span>
                <input
                  className="route-property-input"
                  type="text"
                  placeholder="dog, gate, stairs, lobby, loading_dock"
                  value={propertyDraft.warning_flags}
                  onChange={(event) => setPropertyDraft((current) => ({ ...current, warning_flags: event.target.value }))}
                />
              </label>

              <div className="route-note-modal-help">
                This intel is saved at the building/address level and will be merged into future stops automatically.
              </div>
              <div className="route-note-modal-actions">
                <button type="button" className="route-toolbar-button route-toolbar-secondary" onClick={closePropertyEditor}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="route-toolbar-button route-toolbar-push"
                  onClick={handleSavePropertyIntel}
                  disabled={isSavingPropertyIntel}
                >
                  {isSavingPropertyIntel ? 'Saving...' : 'Save Building Intel'}
                </button>
              </div>
                  </>
                );
              })()}
            </div>
          </div>
        ) : null}
      </div>

      <div className="route-page-footer-meta">
        <span>{`Showing ${allStops.length} stops for ${getFriendlyDate(date)}`}</span>
        <span>{`Contractor: ${route.contractor_name || '—'}`}</span>
        <span>{`SA#: ${route.sa_number || '—'}`}</span>
      </div>
    </section>
  );
}
