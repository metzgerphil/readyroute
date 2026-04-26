import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isValid, parseISO } from 'date-fns';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import DriverRow from '../components/DriverRow';
import OverviewRoutesSection from '../components/OverviewRoutesSection';
import api from '../services/api';
import { getTodayString, saveStoredOperationsDate } from '../utils/operationsDate';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const GOOGLE_MAPS_SRC = GOOGLE_MAPS_KEY
  ? `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly`
  : null;
const GOOGLE_MAPS_PLACEHOLDER_KEYS = new Set(['your_key_here', 'your_production_key']);

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

      function fail(error) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        googleMapsScriptFailed = true;
        googleMapsScriptPromise = null;
        reject(error);
      }

      if (existingScript) {
        if (window.google?.maps?.Map) {
          resolve(window.google);
          return;
        }

        timeoutId = window.setTimeout(() => {
          fail(new Error('google_maps_script_timeout'));
        }, 12000);

        existingScript.addEventListener(
          'load',
          () => {
            if (window.google?.maps?.Map) {
              resolve(window.google);
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
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        if (window.__readyrouteGoogleMapsAuthFailed || !window.google?.maps?.Map) {
          fail(new Error('google_maps_auth_failed'));
          return;
        }

        resolve(window.google);
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

function getRemainingStops(dashboard) {
  return Math.max(0, Number(dashboard?.total_stops || 0) - Number(dashboard?.completed_stops || 0));
}

function getFleetStopsPerHour(routeRows) {
  const activeValues = (routeRows || [])
    .filter((row) => Boolean(row.name))
    .map((row) => row.stops_per_hour)
    .filter((value) => value !== null && value !== undefined);

  if (!activeValues.length) {
    return '--';
  }

  const average = activeValues.reduce((sum, value) => sum + Number(value || 0), 0) / activeValues.length;
  return average.toFixed(1);
}

function buildFallbackDriverRows(routes) {
  return (routes || []).map((route) => {
    const pendingStop = (route.stops || []).find((stop) => stop.status === 'pending') || null;

    return {
      driver_id: route.driver_id || null,
      name: route.driver_name || null,
      route_id: route.id,
      work_area_name: route.work_area_name,
      vehicle_name: route.vehicle_name || null,
      vehicle_plate: route.vehicle_plate || null,
      vehicle_id: route.vehicle_id || null,
      route_status: route.status,
      current_stop_number: pendingStop?.sequence_order || null,
      current_stop_address: pendingStop?.address || null,
      total_stops: Number(route.total_stops || 0),
      completed_stops: Number(route.completed_stops || 0),
      time_commits_total: Number(route.time_commits_total || 0),
      time_commits_completed: Number(route.time_commits_completed || 0),
      stops_per_hour: route.stops_per_hour ?? null,
      last_position: null,
      is_online: false
    };
  });
}

function buildFallbackDashboard(routes, date) {
  const safeRoutes = routes || [];

  return {
    date,
    total_stops: safeRoutes.reduce((sum, route) => sum + Number(route.total_stops || 0), 0),
    completed_stops: safeRoutes.reduce((sum, route) => sum + Number(route.completed_stops || 0), 0),
    sync_status: {
      routes_today: safeRoutes.length,
      routes_assigned: safeRoutes.filter((route) => Boolean(route.driver_id)).length,
      drivers_on_road: safeRoutes.filter((route) => route.status === 'in_progress' && route.driver_id).length,
      last_sync_at: safeRoutes[0]?.created_at || null
    },
    drivers: buildFallbackDriverRows(safeRoutes)
  };
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

function getDriverPinColor(routeStatus) {
  if (routeStatus === 'complete') {
    return '#27ae60';
  }

  if (routeStatus === 'in_progress') {
    return '#1a2332';
  }

  return '#888888';
}

function getProgressPercent(completed, total) {
  if (!total) {
    return 0;
  }

  return Math.max(0, Math.min(1, Number(completed || 0) / Number(total || 0)));
}

function getRouteCentroid(stops = []) {
  const coordinates = getValidCoordinatePoints(
    (stops || []).map((stop) => ({
      lat: Number(stop?.lat),
      lng: Number(stop?.lng)
    }))
  );

  if (!coordinates.length) {
    return null;
  }

  const latitude = coordinates.reduce((sum, stop) => sum + Number(stop.lat), 0) / coordinates.length;
  const longitude = coordinates.reduce((sum, stop) => sum + Number(stop.lng), 0) / coordinates.length;

  return { lat: latitude, lng: longitude };
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

function getPrimaryBoundsPoints(points = []) {
  const validPoints = (points || []).filter((point) => {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
  });

  if (validPoints.length <= 2) {
    return validPoints;
  }

  const clusterRadiusMiles = 35;
  let bestCluster = [];

  validPoints.forEach((anchor) => {
    const cluster = validPoints.filter((candidate) => getDistanceMiles(anchor, candidate) <= clusterRadiusMiles);

    if (cluster.length > bestCluster.length) {
      bestCluster = cluster;
    }
  });

  if (bestCluster.length >= Math.max(3, Math.ceil(validPoints.length * 0.5))) {
    return bestCluster;
  }

  return validPoints;
}

function getValidCoordinatePoints(points = []) {
  return (points || []).filter((point) => {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    const isOrigin = Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001;
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 && !isOrigin;
  });
}

function getPendingTimeCommitMetadata(route) {
  const pendingTimeCommits = (route?.stops || [])
    .filter((stop) => stop.status === 'pending' && stop.has_time_commit)
    .sort((left, right) => Number(left.sequence_order || 0) - Number(right.sequence_order || 0));

  const now = new Date();

  const hasUrgentTimeCommit = pendingTimeCommits.some((stop) => {
    if (!stop.close_time) {
      return false;
    }

    const [hours, minutes] = String(stop.close_time).split(':').map((value) => Number(value));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return false;
    }

    const closingTime = new Date(now);
    closingTime.setHours(hours, minutes, 0, 0);
    const diffMs = closingTime.getTime() - now.getTime();
    return diffMs >= 0 && diffMs <= 30 * 60 * 1000;
  });

  return {
    pendingTimeCommits,
    pendingCount: pendingTimeCommits.length,
    hasUrgentTimeCommit
  };
}

function buildRouteCentroidMarkers(routeDetails = [], routeColorMap = new Map()) {
  return (routeDetails || [])
    .map((item) => {
      const route = item?.route;
      const stops = item?.stops || [];
      const centroid = getRouteCentroid(stops);

      if (!route?.id || !centroid) {
        return null;
      }

      const pendingStop = stops.find((stop) => stop.status === 'pending') || null;
      const timeCommitMeta = getPendingTimeCommitMetadata(item);

      return {
        lat: centroid.lat,
        lng: centroid.lng,
        title: `Route ${route.work_area_name || '--'}`,
        driverName: route.driver_name || 'Unassigned',
        workAreaName: route.work_area_name || '--',
        completedStops: Number(route.completed_stops || 0),
        totalStops: Number(route.total_stops || 0),
        stopsPerHourLabel: `${route.stops_per_hour ?? '--'} stops/hr`,
        nextStopAddress: pendingStop?.address || 'No active stop',
        nextStopTimeCommit:
          pendingStop?.has_time_commit && pendingStop?.ready_time && pendingStop?.close_time
            ? `${pendingStop.ready_time}–${pendingStop.close_time}`
            : null,
        pendingTimeCommitCount: timeCommitMeta.pendingCount,
        hasUrgentTimeCommit: timeCommitMeta.hasUrgentTimeCommit,
        initials: String(route.work_area_name || '--').slice(0, 3),
        color: routeColorMap.get(route.work_area_name) || '#1a2332'
      };
    })
    .filter(Boolean);
}

function createDriverPinSvg(driverMarker) {
  const progressPercent = getProgressPercent(driverMarker.completedStops, driverMarker.totalStops);
  const circumference = 2 * Math.PI * 21;
  const dashLength = progressPercent * circumference;
  const remainder = Math.max(circumference - dashLength, 0.001);
  const urgentDot = driverMarker.hasUrgentTimeCommit
    ? `
      <circle cx="50" cy="14" r="5" fill="#FF6200" />
      <circle cx="50" cy="14" r="8" fill="rgba(255,98,0,0.18)" />
    `
    : '';

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="21" fill="none" stroke="rgba(229,215,198,0.95)" stroke-width="4" />
      <circle
        cx="32"
        cy="32"
        r="21"
        fill="none"
        stroke="#FF6200"
        stroke-width="4"
        stroke-linecap="round"
        stroke-dasharray="${dashLength} ${remainder}"
        transform="rotate(-90 32 32)"
      />
      <circle cx="32" cy="32" r="18" fill="${driverMarker.color}" stroke="#ffffff" stroke-width="3" />
      <text x="32" y="37" text-anchor="middle" font-size="14" font-weight="900" fill="#ffffff">${driverMarker.initials}</text>
      ${urgentDot}
    </svg>
  `;
}

function DashboardFleetMap({ center, markers = [], boundsPoints = [] }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerInstancesRef = useRef([]);
  const infoWindowRef = useRef(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapRef.current) {
        return;
      }

      try {
        const google = await loadGoogleMapsScript();

        if (!isMounted || !mapRef.current || !google?.maps?.Map) {
          return;
        }

        setErrorMessage('');

        if (!mapInstanceRef.current) {
          mapInstanceRef.current = new google.maps.Map(mapRef.current, {
            center: center || { lat: 33.1217, lng: -117.0815 },
            zoom: center ? 11 : 10
          });
          infoWindowRef.current = new google.maps.InfoWindow();
        }

        const map = mapInstanceRef.current;
        const infoWindow = infoWindowRef.current;

        markerInstancesRef.current.forEach((marker) => marker.setMap(null));
        markerInstancesRef.current = [];

        const defaultCenter = center || { lat: 33.1217, lng: -117.0815 };
        const usableBoundsPoints = getPrimaryBoundsPoints(
          getValidCoordinatePoints((boundsPoints || []).map((point) => ({
            lat: Number(point?.lat),
            lng: Number(point?.lng)
          })))
        );

        if (markers.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          const markerPositions = [];

          markers.forEach((markerData) => {
            const lat = Number(markerData.lat);
            const lng = Number(markerData.lng);

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
              return;
            }

            const marker = new google.maps.Marker({
              map,
              position: { lat, lng },
              title: markerData.title,
              icon: {
                url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(createDriverPinSvg(markerData))}`,
                scaledSize: new google.maps.Size(48, 48),
                anchor: new google.maps.Point(24, 24)
              }
            });

            marker.addListener('click', () => {
              const tcLine = markerData.nextStopTimeCommit ? `<div style="margin-top:6px; color:#b45309; font-weight:800;">TC: ${markerData.nextStopTimeCommit}</div>` : '';
              infoWindow.setContent(`
                <div style="min-width:220px; padding:4px 2px;">
                  <div style="font-weight:900; color:#173042;">${markerData.driverName} — ${markerData.workAreaName}</div>
                  <div style="margin-top:4px; color:#4b5563;">${markerData.completedStops}/${markerData.totalStops} stops complete</div>
                  <div style="margin-top:4px; color:#4b5563;">${markerData.stopsPerHourLabel}</div>
                  <div style="margin-top:6px; color:#173042; font-weight:700;">Next stop</div>
                  <div style="margin-top:2px; color:#66737c;">${markerData.nextStopAddress || 'No pending stop'}</div>
                  ${tcLine}
                  <div style="margin-top:6px; color:#ff6200; font-weight:800;">${markerData.pendingTimeCommitCount} pending time commit${markerData.pendingTimeCommitCount === 1 ? '' : 's'}</div>
                </div>
              `);
              infoWindow.open({ anchor: marker, map });
            });

            markerInstancesRef.current.push(marker);
            markerPositions.push({ lat, lng });
            bounds.extend({ lat, lng });
          });

          const fitPoints = usableBoundsPoints.length ? usableBoundsPoints : markerPositions;

          if (fitPoints.length === 1) {
            map.setCenter(fitPoints[0]);
            map.setZoom(13);
          } else if (fitPoints.length > 1) {
            fitPoints.forEach((point) => bounds.extend(point));
            map.fitBounds(bounds, 64);

            google.maps.event.addListenerOnce(map, 'idle', () => {
              const currentZoom = Number(map.getZoom() || 0);

              if (currentZoom < 10) {
                map.setZoom(10);
              }
            });
          } else if (markerPositions.length === 1) {
            map.setCenter(markerPositions[0]);
            map.setZoom(13);
          } else {
            map.setCenter(defaultCenter);
            map.setZoom(center ? 11 : 10);
          }
        } else if (usableBoundsPoints.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          usableBoundsPoints.forEach((point) => bounds.extend(point));

          if (usableBoundsPoints.length === 1) {
            map.setCenter(usableBoundsPoints[0]);
            map.setZoom(13);
          } else {
            map.fitBounds(bounds, 64);

            google.maps.event.addListenerOnce(map, 'idle', () => {
              const currentZoom = Number(map.getZoom() || 0);

              if (currentZoom < 10) {
                map.setZoom(10);
              }
            });
          }
        } else {
          map.setCenter(defaultCenter);
          map.setZoom(center ? 11 : 10);
        }
      } catch (error) {
        console.error('Dashboard fleet map load failed:', error);

        if (!isMounted) {
          return;
        }

        if (error.message === 'missing_google_maps_key') {
          setErrorMessage('Add VITE_GOOGLE_MAPS_KEY to load the fleet map.');
        } else if (error.message === 'google_maps_auth_failed') {
          setErrorMessage('Google Maps rejected this browser key. Check the Maps JavaScript API and your localhost referrer restrictions, then restart the portal.');
        } else {
          setErrorMessage('Google Maps could not load in this browser session. Restart the portal and verify the browser API key settings.');
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [boundsPoints, center, markers]);

  return (
    <div className="map-panel">
      {errorMessage ? <div className="map-fallback">{errorMessage}</div> : <div className="map-canvas" ref={mapRef} />}
    </div>
  );
}

const ROUTE_COLOR_PALETTE = [
  '#ff6200',
  '#0f9d58',
  '#1a73e8',
  '#d93025',
  '#8e24aa',
  '#f9ab00',
  '#00897b',
  '#6d4c41',
  '#c2185b',
  '#5c6bc0',
  '#7cb342',
  '#ef6c00'
];

function getRouteColorMap(routes) {
  const uniqueWorkAreas = [...new Set((routes || []).map((route) => route.work_area_name).filter(Boolean))].sort();
  return uniqueWorkAreas.reduce((map, workAreaName, index) => {
    map.set(workAreaName, ROUTE_COLOR_PALETTE[index % ROUTE_COLOR_PALETTE.length]);
    return map;
  }, new Map());
}

function getFriendlyDashboardDate(dateValue) {
  if (!dateValue) {
    return 'Today';
  }

  const parsedDate = new Date(`${dateValue}T12:00:00`);

  if (!isValid(parsedDate)) {
    return 'Today';
  }

  return format(parsedDate, 'EEEE, MMMM d');
}

function formatSyncTimestamp(value) {
  if (!value) {
    return 'Never synced';
  }

  const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);

  if (!isValid(parsed)) {
    return 'Never synced';
  }

  return `Last sync: ${format(parsed, 'p')} — ${format(parsed, 'MMM d')}`;
}

function getMissingRoutesState(syncStatus, dateValue) {
  const routeCount = Number(syncStatus?.routes_today || 0);

  if (routeCount > 0) {
    return {
      title: 'Today\'s routes are ready.',
      detail: formatSyncTimestamp(syncStatus?.last_sync_at)
    };
  }

  const parsedSync = syncStatus?.last_sync_at
    ? (typeof syncStatus.last_sync_at === 'string' ? parseISO(syncStatus.last_sync_at) : new Date(syncStatus.last_sync_at))
    : null;
  const parsedDashboardDate = dateValue ? new Date(`${dateValue}T12:00:00`) : null;
  const isSameDay =
    parsedSync &&
    isValid(parsedSync) &&
    parsedDashboardDate &&
    isValid(parsedDashboardDate) &&
    format(parsedSync, 'yyyy-MM-dd') === format(parsedDashboardDate, 'yyyy-MM-dd');

  if (isSameDay) {
    return {
      title: 'No routes are scheduled for this CSA yet.',
      detail: `${formatSyncTimestamp(syncStatus?.last_sync_at)}. Once FedEx routes sync in, the dashboard and CSA map will populate automatically.`
    };
  }

  return {
    title: 'Today\'s routes are not loaded yet.',
    detail: `${formatSyncTimestamp(syncStatus?.last_sync_at)}. Once FedEx routes sync in, the dashboard and CSA map will populate automatically.`
  };
}

function getDispatchHealthSummary(routes = []) {
  const safeRoutes = routes || [];
  const routesNeedingAssignment = safeRoutes.filter((route) => !route.driver_id);
  const routesNeedingVehicle = safeRoutes.filter((route) => !route.vehicle_id);
  const routesNeedingPins = safeRoutes.filter((route) => route.map_status === 'needs_pins');
  const partiallyMappedRoutes = safeRoutes.filter((route) => route.map_status === 'partially_mapped');
  const fullyMappedRoutes = safeRoutes.filter((route) => route.map_status === 'mapped');
  const dispatchReadyRoutes = safeRoutes.filter((route) => route.driver_id && route.map_status === 'mapped');
  const routesWithWarnings = safeRoutes.filter((route) => Number(route.exception_count || 0) > 0 || Number(route.warning_count || 0) > 0);
  const missingPinStops = safeRoutes.reduce((sum, route) => sum + Number(route.missing_stops || 0), 0);

  return {
    totalRoutes: safeRoutes.length,
    routesNeedingAssignment,
    routesNeedingVehicle,
    routesNeedingPins,
    partiallyMappedRoutes,
    fullyMappedRoutes,
    dispatchReadyRoutes,
    routesNeedingPinReview: [...routesNeedingPins, ...partiallyMappedRoutes],
    routesWithWarnings,
    missingPinStops
  };
}

function getBannerState(syncStatus, dispatchHealth) {
  if (!syncStatus || Number(syncStatus.routes_today || 0) === 0) {
    return 'missing';
  }

  if (
    Number(syncStatus.routes_assigned || 0) < Number(syncStatus.routes_today || 0) ||
    Number(dispatchHealth?.routesNeedingPinReview?.length || 0) > 0 ||
    Number(dispatchHealth?.routesNeedingVehicle?.length || 0) > 0 ||
    Number(dispatchHealth?.routesWithWarnings?.length || 0) > 0
  ) {
    return 'needs-attention';
  }

  return 'active';
}

function getMapCoverageSummary({
  totalRoutes = 0,
  mappableRouteDetails = [],
  driverPositionMarkers = [],
  routeCentroidMarkers = [],
  overviewRoutes = []
}) {
  const mappedRouteIds = new Set((mappableRouteDetails || []).map((item) => item?.route?.id).filter(Boolean));
  const liveMarkerRouteNames = new Set((driverPositionMarkers || []).map((item) => item?.workAreaName).filter(Boolean));
  const footprintRouteNames = new Set((routeCentroidMarkers || []).map((item) => item?.workAreaName).filter(Boolean));
  const excludedRoutes = (overviewRoutes || []).filter((route) => !mappedRouteIds.has(route.id));

  return {
    totalRoutes: Number(totalRoutes || 0),
    mappedRoutes: mappedRouteIds.size,
    excludedRoutes,
    excludedRouteCount: excludedRoutes.length,
    liveMarkerCount: liveMarkerRouteNames.size,
    footprintCount: footprintRouteNames.size
  };
}

function SkeletonCard() {
  return (
    <div className="stat-card skeleton-card">
      <div className="skeleton-line skeleton-label" />
      <div className="skeleton-line skeleton-value" />
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('map');
  const [isCompactBanner, setIsCompactBanner] = useState(false);
  const [vehiclePickerRouteId, setVehiclePickerRouteId] = useState(null);
  const dashboardDate = searchParams.get('date') || getTodayString();
  const isSelectedDateToday = dashboardDate === getTodayString();

  useEffect(() => {
    saveStoredOperationsDate(dashboardDate);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', dashboardDate);
    setSearchParams(nextParams, { replace: true });
  }, [dashboardDate, searchParams, setSearchParams]);

  const dashboardQuery = useQuery({
    queryKey: ['manager-dashboard', dashboardDate],
    queryFn: async () => {
      const response = await api.get('/manager/dashboard', {
        params: {
          date: dashboardDate
        }
      });
      return response.data;
    },
    refetchInterval: 30000
  });

  const vehiclesQuery = useQuery({
    queryKey: ['fleet-vehicles'],
    queryFn: async () => {
      const response = await api.get('/vehicles');
      return response.data?.vehicles || [];
    }
  });

  const routesOverviewQuery = useQuery({
    queryKey: ['dashboard-overview-routes', dashboardDate],
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date: dashboardDate } });
      return response.data?.routes || [];
    }
  });

  const overviewRoutes = routesOverviewQuery.data || [];
  const overviewRouteIdsKey = overviewRoutes.map((route) => route.id).join(',');

  const routeDetailMapQuery = useQuery({
    queryKey: ['dashboard-route-detail-map', dashboardDate, overviewRouteIdsKey],
    queryFn: async () => {
      const responses = await Promise.allSettled(
        overviewRoutes.map(async (route) => {
          const response = await api.get(`/manager/routes/${route.id}/stops`, { params: { date: dashboardDate } });
          return response.data;
        })
      );

      const fulfilled = responses
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
      const rejected = responses.filter((result) => result.status === 'rejected');

      if (rejected.length > 0) {
        console.warn('Dashboard route detail fetch skipped failed routes:', rejected);
      }

      return fulfilled;
    },
    enabled: overviewRoutes.length > 0
  });

  const assignVehicleMutation = useMutation({
    mutationFn: async ({ routeId, vehicleId }) => {
      await api.patch(`/manager/routes/${routeId}/assign`, { vehicle_id: vehicleId });
      return { routeId, vehicleId };
    },
    onSuccess: ({ routeId, vehicleId }) => {
      const vehicle = (vehiclesQuery.data || []).find((entry) => entry.id === vehicleId) || null;
      queryClient.setQueryData(['manager-dashboard', dashboardDate], (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          drivers: (current.drivers || []).map((row) => (
            row.route_id === routeId
              ? {
                  ...row,
                  vehicle_id: vehicleId,
                  vehicle_name: vehicle?.name || null,
                  vehicle_plate: vehicle?.plate || null
                }
              : row
          ))
        };
      });
      setVehiclePickerRouteId(null);
    }
  });

  const dashboard = dashboardQuery.data;
  const fallbackDashboard = useMemo(
    () => buildFallbackDashboard(overviewRoutes, dashboardDate),
    [overviewRoutes, dashboardDate]
  );
  const dispatchHealth = useMemo(
    () => getDispatchHealthSummary(overviewRoutes),
    [overviewRoutes]
  );
  const activeDashboard = isSelectedDateToday ? (dashboard || fallbackDashboard) : fallbackDashboard;
  const routeRows = activeDashboard?.drivers || [];
  const syncStatus = activeDashboard?.sync_status;
  const bannerState =
    dashboardQuery.isLoading && overviewRoutes.length === 0
      ? 'loading'
      : getBannerState(syncStatus, dispatchHealth);
  const missingRoutesState = useMemo(
    () => getMissingRoutesState(syncStatus, dashboard?.date || dashboardDate),
    [dashboard?.date, dashboardDate, syncStatus]
  );

  useEffect(() => {
    setIsCompactBanner(false);

    if (bannerState !== 'active') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setIsCompactBanner(true);
    }, 10000);

    return () => window.clearTimeout(timeoutId);
  }, [bannerState, syncStatus?.routes_today, syncStatus?.routes_assigned]);

  const routeDetailsById = useMemo(
    () =>
      new Map(
        (routeDetailMapQuery.data || [])
          .filter((item) => item?.route?.id)
          .map((item) => [item.route.id, item])
      ),
    [routeDetailMapQuery.data]
  );

  const driverPositionMarkers = useMemo(
    () =>
      routeRows
        .filter((row) => row.name)
        .map((row) => {
          const routeDetail = routeDetailsById.get(row.route_id);
          const routeStops = routeDetail?.stops || [];
          const nextPendingStop = routeStops.find((stop) => stop.status === 'pending') || null;
          const fallbackCenter = getRouteCentroid(routeStops);
          const livePosition = row.last_position?.lat != null && row.last_position?.lng != null
            ? { lat: Number(row.last_position.lat), lng: Number(row.last_position.lng) }
            : null;
          const livePositionIsUsable = Boolean(
            row.is_online &&
            row.route_status === 'in_progress' &&
            livePosition &&
            fallbackCenter &&
            getDistanceMiles(livePosition, fallbackCenter) <= 50
          );
          const position = fallbackCenter
            ? (livePositionIsUsable ? livePosition : fallbackCenter)
            : null;
          const timeCommitMeta = getPendingTimeCommitMetadata(routeDetail);

          if (!position) {
            return null;
          }

          return {
            lat: position.lat,
            lng: position.lng,
            title: `${row.work_area_name || '--'} — ${row.name}`,
            driverName: row.name,
            workAreaName: row.work_area_name || '--',
            completedStops: Number(row.completed_stops || 0),
            totalStops: Number(row.total_stops || 0),
            stopsPerHourLabel: `${row.stops_per_hour ?? '--'} stops/hr`,
            nextStopAddress: nextPendingStop?.address || row.current_stop_address || 'No active stop',
            nextStopTimeCommit:
              nextPendingStop?.has_time_commit && nextPendingStop?.ready_time && nextPendingStop?.close_time
                ? `${nextPendingStop.ready_time}–${nextPendingStop.close_time}`
                : null,
            pendingTimeCommitCount: timeCommitMeta.pendingCount,
            hasUrgentTimeCommit: timeCommitMeta.hasUrgentTimeCommit,
            initials: getDriverInitials(row.name),
            color: getDriverPinColor(row.route_status)
          };
        })
        .filter(Boolean),
    [routeRows, routeDetailsById]
  );

  const routeColorMap = useMemo(
    () => getRouteColorMap(overviewRoutes),
    [overviewRoutes]
  );

  const mappableRouteDetails = useMemo(
    () =>
      (routeDetailMapQuery.data || []).filter((item) =>
        getValidCoordinatePoints(
          (item?.stops || []).map((stop) => ({
            lat: Number(stop?.lat),
            lng: Number(stop?.lng)
          }))
        ).length > 0
      ),
    [routeDetailMapQuery.data]
  );

  const routeCentroidMarkers = useMemo(
    () => buildRouteCentroidMarkers(mappableRouteDetails, routeColorMap),
    [mappableRouteDetails, routeColorMap]
  );

  const activeMapMarkers = driverPositionMarkers.length > 0 ? driverPositionMarkers : routeCentroidMarkers;
  const dashboardBoundsPoints = useMemo(
    () =>
      mappableRouteDetails.flatMap((item) =>
        getValidCoordinatePoints(
          (item?.stops || []).map((stop) => ({
            lat: Number(stop?.lat),
            lng: Number(stop?.lng)
          }))
        )
      ),
    [mappableRouteDetails]
  );
  const routeLegendItems = useMemo(
    () =>
      overviewRoutes.map((route) => ({
        workAreaName: route.work_area_name,
        color: routeColorMap.get(route.work_area_name) || '#ff6200',
        stopCount: route.total_stops || 0,
        mapStatus: route.map_status || 'needs_pins',
        missingStops: Number(route.missing_stops || 0)
      })),
    [overviewRoutes, routeColorMap]
  );
  const mapCoverageSummary = useMemo(
    () =>
      getMapCoverageSummary({
        totalRoutes: overviewRoutes.length,
        mappableRouteDetails,
        driverPositionMarkers,
        routeCentroidMarkers,
        overviewRoutes
      }),
    [overviewRoutes, mappableRouteDetails, driverPositionMarkers, routeCentroidMarkers]
  );

  function handleSyncRoutes() {
    navigate(`/manifest?date=${dashboardDate}&action=sync`);
  }

  function handleAssignDrivers() {
    navigate(`/manifest?date=${dashboardDate}`);
  }

  return (
    <section className="page-section">
      {bannerState !== 'loading' ? <div className={`sync-banner ${bannerState}${bannerState === 'active' && isCompactBanner ? ' compact' : ''}`}>
        {bannerState === 'missing' ? (
          <>
            <div>
              <h2>{missingRoutesState.title}</h2>
              <p>{missingRoutesState.detail}</p>
            </div>
            <button className="sync-banner-button" onClick={handleSyncRoutes} type="button">
              Sync FedEx Routes Now
            </button>
          </>
        ) : null}

        {bannerState === 'needs-attention' ? (
          <>
            <div>
              <h2>
                {dispatchHealth.dispatchReadyRoutes.length} of {syncStatus?.routes_today || 0} routes dispatch-ready
              </h2>
              <p>
                {Math.max(0, Number(syncStatus?.routes_today || 0) - Number(syncStatus?.routes_assigned || 0))} need driver assignment
                {' · '}
                {dispatchHealth.routesNeedingPinReview.length} need pin review
                {' · '}
                {dispatchHealth.missingPinStops} missing stop pins
              </p>
            </div>
            <button className="sync-banner-button" onClick={handleAssignDrivers} type="button">
              Open Morning Setup
            </button>
          </>
        ) : null}

        {bannerState === 'active' ? (
          <div className="sync-banner-status">
            <strong>All {syncStatus?.routes_today || 0} routes dispatch-ready</strong>
            <span>{syncStatus?.drivers_on_road || 0} drivers on road</span>
          </div>
        ) : null}
      </div> : null}

      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>{getFriendlyDashboardDate(dashboard?.date)}</p>
        </div>
      </div>

      {dashboardQuery.isLoading && bannerState !== 'missing' ? <div className="card">Loading dashboard...</div> : null}
      {dashboardQuery.isError ? (
        <div className="card">
          {dashboardQuery.error?.response?.data?.error || 'Dashboard failed to load. Refresh and try again.'}
        </div>
      ) : null}

      {dashboardQuery.isLoading ? (
        <div className="stats-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {bannerState === 'missing' && !dashboardQuery.isLoading ? (
        <div className="card empty-routes-card">
          <div className="empty-routes-card-copy">
            <div className="card-title">Waiting For Route Sync</div>
            <p>
              ReadyRoute will show today&apos;s stop counts, dispatch readiness, and CSA map coverage here as soon as
              the day&apos;s FedEx routes are available.
            </p>
          </div>
          <div className="empty-routes-card-grid">
            <div className="empty-routes-stat">
              <strong>{syncStatus?.last_sync_at ? formatSyncTimestamp(syncStatus.last_sync_at) : 'No sync recorded yet'}</strong>
              <span>Most recent route sync</span>
            </div>
            <div className="empty-routes-stat">
              <strong>Automatic when routes are loaded</strong>
              <span>Dashboard cards and CSA map</span>
            </div>
            <div className="empty-routes-stat">
              <strong>Manual fallback available</strong>
              <span>Upload XLS, GPX, or both from Manifest</span>
            </div>
          </div>
          <div className="empty-routes-actions">
            <button className="primary-cta" onClick={handleSyncRoutes} type="button">
              Open Route Sync
            </button>
            <button className="secondary-button" onClick={() => navigate(`/fleet-map?date=${dashboardDate}`)} type="button">
              View Fleet Map
            </button>
          </div>
        </div>
      ) : null}

      {activeDashboard && bannerState !== 'missing' ? (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-label">Total Stops Today</div>
              <div className="stat-value">{activeDashboard.total_stops ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Completed Stops</div>
              <div className="stat-value">{activeDashboard.completed_stops ?? 0}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Remaining Stops</div>
              <div className="stat-value">{getRemainingStops(activeDashboard)}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Fleet Stops/Hr</div>
              <div className="stat-value">{getFleetStopsPerHour(routeRows)}</div>
            </div>
          </div>

          <div className="card dispatch-health-card">
            <div className="dispatch-health-header">
              <div className="card-title">Dispatch Readiness</div>
              <div className="driver-meta">
                {dispatchHealth.dispatchReadyRoutes.length} of {dispatchHealth.totalRoutes} routes ready to roll
              </div>
            </div>
            <div className="dispatch-health-grid">
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.dispatchReadyRoutes.length}</div>
                <div className="dispatch-health-label">Dispatch-ready</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesNeedingAssignment.length}</div>
                <div className="dispatch-health-label">Need driver</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesNeedingVehicle.length}</div>
                <div className="dispatch-health-label">Need vehicle</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesNeedingPinReview.length}</div>
                <div className="dispatch-health-label">Need pin review</div>
              </div>
              <div className="dispatch-health-stat">
                <div className="dispatch-health-value">{dispatchHealth.routesWithWarnings.length}</div>
                <div className="dispatch-health-label">Route warnings</div>
              </div>
            </div>
            {dispatchHealth.routesNeedingAssignment.length > 0 ||
            dispatchHealth.routesNeedingVehicle.length > 0 ||
            dispatchHealth.routesNeedingPinReview.length > 0 ||
            dispatchHealth.routesWithWarnings.length > 0 ? (
              <div className="dispatch-health-route-list">
                {dispatchHealth.routesNeedingAssignment.map((route) => (
                  <button
                    className="dispatch-health-chip assignment"
                    key={`assignment-${route.id}`}
                    onClick={() => navigate(`/manifest?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: assign driver
                  </button>
                ))}
                {dispatchHealth.routesNeedingVehicle.map((route) => (
                  <button
                    className="dispatch-health-chip vehicle"
                    key={`vehicle-${route.id}`}
                    onClick={() => navigate(`/manifest?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: assign vehicle
                  </button>
                ))}
                {dispatchHealth.routesNeedingPinReview.map((route) => (
                  <button
                    className={`dispatch-health-chip ${route.map_status === 'needs_pins' ? 'pins' : 'partial'}`}
                    key={`pins-${route.id}`}
                    onClick={() => navigate(`/routes/${route.id}?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: {route.map_status === 'needs_pins' ? 'needs pins' : `${route.missing_stops || 0} pins missing`}
                  </button>
                ))}
                {dispatchHealth.routesWithWarnings.map((route) => (
                  <button
                    className="dispatch-health-chip warning"
                    key={`warning-${route.id}`}
                    onClick={() => navigate(`/routes/${route.id}?date=${dashboardDate}`)}
                    type="button"
                  >
                    {route.work_area_name}: review route warnings
                  </button>
                ))}
              </div>
            ) : (
              <div className="success-banner">All visible routes have drivers, vehicles, and usable map coverage.</div>
            )}
          </div>

          <div className="card">
            <div className="dashboard-toolbar">
              <div className="card-title">Fleet View</div>
              <div className="toggle-group">
                <button
                  className={viewMode === 'map' ? 'toggle-button active' : 'toggle-button'}
                  onClick={() => setViewMode('map')}
                  type="button"
                >
                  Map View
                </button>
                <button
                  className={viewMode === 'list' ? 'toggle-button active' : 'toggle-button'}
                  onClick={() => setViewMode('list')}
                  type="button"
                >
                  List View
                </button>
              </div>
            </div>

            {viewMode === 'list' ? (
              <div className="driver-table">
                <div className="driver-table-header">
                  <span>Route</span>
                  <span>Vehicle</span>
                  <span>Driver</span>
                  <span>Status</span>
                  <span>Completed</span>
                  <span>Remaining</span>
                  <span>Stops/Hr</span>
                  <span>Last Ping</span>
                  <span>Online</span>
                </div>
                <div className="driver-table-body">
                  {routeRows.map((driver) => (
                    <DriverRow
                      driver={driver}
                      key={driver.route_id || `${driver.work_area_name}-${driver.driver_id || 'unassigned'}`}
                      onAssign={handleAssignDrivers}
                      onAssignVehicle={(vehicleId, openPicker = false) => {
                        if (openPicker) {
                          setVehiclePickerRouteId(driver.route_id);
                          return;
                        }

                        if (!vehicleId || !driver.route_id) {
                          return;
                        }

                        assignVehicleMutation.mutate({ routeId: driver.route_id, vehicleId });
                      }}
                      onClick={() => driver.name && driver.route_id && navigate(`/routes/${driver.route_id}?date=${dashboardDate}`)}
                      showVehiclePicker={vehiclePickerRouteId === driver.route_id}
                      vehicles={(vehiclesQuery.data || []).filter((vehicle) => vehicle.is_active !== false)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="dashboard-map-shell">
                <div className="dashboard-map-meta">
                  <div>
                    <div className="card-title">CSA Map</div>
                    <div className="driver-meta">
                      {driverPositionMarkers.length > 0
                        ? `Showing live driver markers for ${mapCoverageSummary.liveMarkerCount} route${mapCoverageSummary.liveMarkerCount === 1 ? '' : 's'} and route footprints for ${mapCoverageSummary.footprintCount} mapped route${mapCoverageSummary.footprintCount === 1 ? '' : 's'}`
                        : `Showing route footprints for ${mapCoverageSummary.footprintCount} mapped route${mapCoverageSummary.footprintCount === 1 ? '' : 's'} until drivers come online`}
                    </div>
                  </div>
                  {routeLegendItems.length > 0 ? (
                    <div className="dashboard-map-legend">
                      {routeLegendItems.map((item) => (
                        <div className={`dashboard-map-legend-item ${item.mapStatus === 'needs_pins' ? 'muted' : ''}`} key={item.workAreaName}>
                          <span className="dashboard-map-legend-dot" style={{ background: item.color }} />
                          <span>
                            {item.workAreaName}
                            {item.mapStatus === 'partially_mapped' ? ` · ${item.missingStops} missing` : ''}
                            {item.mapStatus === 'needs_pins' ? ' · needs pins' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {mapCoverageSummary.excludedRouteCount > 0 ? (
                  <div className="info-banner dashboard-map-health-banner">
                    {mapCoverageSummary.excludedRouteCount} route{mapCoverageSummary.excludedRouteCount === 1 ? '' : 's'} excluded from the map until pins are available:
                    {' '}
                    {mapCoverageSummary.excludedRoutes.map((route) => route.work_area_name).join(', ')}
                  </div>
                ) : null}
                {driverPositionMarkers.length > 0 ? (
                  <div className="info-banner dashboard-map-health-banner">
                    Live driver pings are only shown when they stay close to the actual route footprint. Everything else falls back to stop-based route centers to keep the CSA map truthful.
                  </div>
                ) : null}
                <DashboardFleetMap
                  center={activeMapMarkers[0] ? { lat: Number(activeMapMarkers[0].lat), lng: Number(activeMapMarkers[0].lng) } : null}
                  boundsPoints={dashboardBoundsPoints}
                  markers={activeMapMarkers}
                />
              </div>
            )}
          </div>

          <OverviewRoutesSection
            date={dashboardDate}
            routes={routesOverviewQuery.isLoading ? null : overviewRoutes}
          />
        </>
      ) : null}
    </section>
  );
}
