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
const GOOGLE_MAPS_PLACEHOLDER_KEYS = new Set(['your_key_here', 'your_production_key']);

const ROUTE_STATUS_META = {
  pending: { label: 'Pending', color: '#9ca3af' },
  ready: { label: 'Ready', color: '#3b82f6' },
  in_progress: { label: 'In Progress', color: '#FF6200' },
  complete: { label: 'Complete', color: '#27ae60' }
};

let googleMapsScriptPromise = null;
let googleMapsScriptFailed = false;

function loadGoogleMapsScript() {
  if (!GOOGLE_MAPS_KEY || GOOGLE_MAPS_PLACEHOLDER_KEYS.has(GOOGLE_MAPS_KEY)) {
    return Promise.reject(new Error('missing_google_maps_key'));
  }

  if (window.google?.maps?.Map) {
    return Promise.resolve(window.google);
  }

  if (googleMapsScriptFailed) {
    googleMapsScriptPromise = null;
    googleMapsScriptFailed = false;
  }

  if (!googleMapsScriptPromise) {
    googleMapsScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[data-readyroute-google-maps="true"]');
      let timeoutId = null;

      function clearTimeoutIfNeeded() {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      }

      function fail(error) {
        clearTimeoutIfNeeded();
        googleMapsScriptFailed = true;
        googleMapsScriptPromise = null;
        reject(error);
      }

      function succeed() {
        clearTimeoutIfNeeded();
        resolve(window.google);
      }

      if (existingScript) {
        timeoutId = window.setTimeout(() => {
          fail(new Error('google_maps_script_timeout'));
        }, 12000);

        existingScript.addEventListener(
          'load',
          () => {
            if (window.google?.maps?.Map) {
              succeed();
            } else {
              fail(new Error('google_maps_auth_failed'));
            }
          },
          { once: true }
        );
        existingScript.addEventListener('error', () => fail(new Error('google_maps_script_failed')), { once: true });
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
          fail(new Error('google_maps_auth_failed'));
          return;
        }
        succeed();
      };
      script.onerror = () => fail(new Error('google_maps_script_failed'));

      timeoutId = window.setTimeout(() => {
        fail(new Error('google_maps_script_timeout'));
      }, 12000);

      document.head.appendChild(script);
    });
  }

  return googleMapsScriptPromise;
}

function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd');
}

function getGoogleMapsErrorMessage(error) {
  if (error?.message === 'missing_google_maps_key') {
    return 'Google Maps is not configured for this portal. Add VITE_GOOGLE_MAPS_KEY and redeploy.';
  }

  if (error?.message === 'google_maps_auth_failed') {
    return 'Google Maps rejected this browser key. Check the Maps JavaScript API and portal.readyroute.org referrer restrictions.';
  }

  if (error?.message === 'google_maps_script_timeout') {
    return 'Google Maps is taking too long to load. Refresh this route or check the browser network connection.';
  }

  return 'Google Maps could not load for this route view.';
}

function getFriendlyDate(dateValue) {
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

function getStopMarkerLabel(stop) {
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
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
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

function buildInfoWindow(stop) {
  const packageCount = getPackageCount(stop);
  const completionBadge = getCompletionBadge(stop);
  const stopType = getStopType(stop);
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
  const selectedStopIdRef = useRef(null);
  const stopMarkersRef = useRef(new Map());
  const driverMarkerRef = useRef(null);
  const routePolylineRef = useRef(null);
  const territoryFillRef = useRef(null);
  const territoryBorderRef = useRef(null);
  const exceptionsPanelRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const mapStabilizeTimerRef = useRef(null);
  const mapTileWatchdogRef = useRef(null);
  const mapTileRetryCountRef = useRef(0);
  const mapTilesLoadedRef = useRef(false);
  const [date, setDate] = useState(getTodayString());
  const [mapError, setMapError] = useState('');
  const [mapReady, setMapReady] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapRefreshNonce, setMapRefreshNonce] = useState(0);
  const [mapIsRepainting, setMapIsRepainting] = useState(false);
  const [mapType, setMapType] = useState('roadmap');
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showStopDrawer, setShowStopDrawer] = useState(true);
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

  function resetMapInstance() {
    clearMapArtifacts();
    infoWindowRef.current?.close();
    infoWindowRef.current = null;
    mapInstanceRef.current = null;
    mapTilesLoadedRef.current = false;
    setMapReady(false);
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
    selectedStopIdRef.current = selectedStopId;
  }, [selectedStopId]);

  function getInfoWindowPixelOffset(marker) {
    const google = window.google;
    const map = mapInstanceRef.current;
    const position = marker?.getPosition?.();
    const projection = map?.getProjection?.();
    const center = map?.getCenter?.();
    const div = map?.getDiv?.();

    if (!google?.maps || !position || !projection || !center || !div) {
      return google?.maps ? new google.maps.Size(0, -8) : null;
    }

    const markerPoint = projection.fromLatLngToPoint(position);
    const centerPoint = projection.fromLatLngToPoint(center);
    const scale = 2 ** (map.getZoom() || 0);
    const markerY = (markerPoint.y - centerPoint.y) * scale + div.clientHeight / 2;
    const topSafeZone = 250;

    return new google.maps.Size(0, markerY < topSafeZone ? topSafeZone - markerY : -8);
  }

  function openStopInfoWindow(stop, marker) {
    const infoWindow = infoWindowRef.current;
    const map = mapInstanceRef.current;

    if (!infoWindow || !map || !marker) {
      return;
    }

    const pixelOffset = getInfoWindowPixelOffset(marker);
    if (pixelOffset) {
      infoWindow.setOptions({ pixelOffset });
    }
    infoWindow.setContent(buildInfoWindow(stop));
    infoWindow.open({ anchor: marker, map, shouldFocus: false });
  }

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
    mapTileRetryCountRef.current = 0;
    resetMapInstance();
    setMapRefreshNonce((value) => value + 1);
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

    function clearTileWatchdog() {
      if (mapTileWatchdogRef.current) {
        window.clearTimeout(mapTileWatchdogRef.current);
        mapTileWatchdogRef.current = null;
      }
    }

    function startTileWatchdog(google, map) {
      clearTileWatchdog();

      mapTileWatchdogRef.current = window.setTimeout(() => {
        if (!active || mapTilesLoadedRef.current || !mapContainerRef.current || !map) {
          return;
        }

        google.maps.event.trigger(map, 'resize');

        if (orderedStops.length) {
          fitRoute();
        }

        if (mapTileRetryCountRef.current < 2) {
          mapTileRetryCountRef.current += 1;
          setMapIsRepainting(true);
          window.setTimeout(() => {
            if (!active || mapTilesLoadedRef.current) {
              return;
            }

            resetMapInstance();
            setMapRefreshNonce((value) => value + 1);
          }, 250);
        } else {
          setMapIsRepainting(false);
          setMapError('The map is loaded but tiles did not paint. Tap Recenter map or refresh this page.');
        }
      }, 2600);
    }

    function containerHasSize() {
      const rect = mapContainerRef.current?.getBoundingClientRect?.();
      return Boolean(rect && rect.width > 40 && rect.height > 40);
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
          startTileWatchdog(google, map);
        }, 180);
      });
    }

    async function initMap() {
      if (!mapContainerRef.current) {
        return;
      }

      if (!containerHasSize()) {
        window.setTimeout(initMap, 100);
        return;
      }

      try {
        setMapLoading(true);
        const google = await loadGoogleMapsScript();

        if (!active || !mapContainerRef.current) {
          return;
        }

        setMapError('');
        setMapIsRepainting(false);

        const shouldCreateFreshMap =
          !mapInstanceRef.current ||
          (typeof mapInstanceRef.current.getDiv === 'function' && mapInstanceRef.current.getDiv() !== mapContainerRef.current);

        if (shouldCreateFreshMap) {
          resetMapInstance();
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
            disableAutoPan: true,
            maxWidth: 460,
            pixelOffset: new google.maps.Size(0, -8)
          });

          google.maps.event.addListenerOnce(mapInstanceRef.current, 'idle', () => {
            stabilizeMap(google, mapInstanceRef.current);
          });
          google.maps.event.addListenerOnce(mapInstanceRef.current, 'tilesloaded', () => {
            mapTilesLoadedRef.current = true;
            setMapIsRepainting(false);
            clearTileWatchdog();
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
        setMapLoading(false);
      } catch (error) {
        console.error('RoutePage Google Maps load failed:', error);
        if (active) {
          setMapReady(false);
          setMapLoading(false);
          setMapError(getGoogleMapsErrorMessage(error));
        }
      }
    }

    initMap();

    return () => {
      active = false;
      clearPendingStabilizeTimer();
      clearTileWatchdog();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [orderedStops.length, mapRefreshNonce]);

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
        title: getStopMarkerLabel(stop),
        icon: createStopMarkerSVG(stop, stop.id === selectedStopId),
        zIndex: getMarkerZIndex(stop, stop.id === selectedStopId)
      });

      marker.addListener('click', () => {
        selectedStopIdRef.current = stop.id;
        setSelectedStopId(stop.id);
        openStopInfoWindow(stop, marker);
      });

      marker.addListener('mouseover', () => {
        openStopInfoWindow(stop, marker);
      });

      marker.addListener('mouseout', () => {
        if (selectedStopIdRef.current !== stop.id) {
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
      openStopInfoWindow(selectedStop, selectedMarker);
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
        <div key={`route-map-${mapRefreshNonce}`} ref={mapContainerRef} className="route-map-fullscreen" />
        {mapLoading && !mapReady && !mapError ? (
          <div className="route-map-loading">Loading map...</div>
        ) : null}
        {mapIsRepainting && !mapError ? (
          <div className="route-map-repaint-notice">Map is repainting...</div>
        ) : null}
        {mapError ? <div className="route-map-error">{mapError}</div> : null}

        {!showStopDrawer ? (
          <button type="button" className="route-map-stop-list-handle" onClick={() => setShowStopDrawer(true)}>
            <span className="route-map-stop-list-icon" aria-hidden="true">⌖</span>
            <span>Stop List</span>
            <span className="route-map-stop-list-chevron" aria-hidden="true">›</span>
          </button>
        ) : null}

        <div className={`route-map-toolbar-left ${!showStopDrawer ? 'with-stop-handle' : ''}`}>
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
          route={route}
          routeDriverName={routeDriverName}
          stops={allStops}
          selectedStopId={selectedStopId}
          onClose={() => setShowStopDrawer(false)}
          onSelectStop={handleStopClick}
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
