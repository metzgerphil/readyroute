import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isValid, parseISO } from 'date-fns';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import DriverRow from '../components/DriverRow';
import OverviewRoutesSection from '../components/OverviewRoutesSection';
import {
  ActionBanner,
  PageHeader,
  StatCard,
  StatusBadge,
  TableToolbar
} from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import api from '../services/api';
import { getTodayString, saveStoredOperationsDate } from '../utils/operationsDate';
import { compareRouteLabels, sortRoutesByWorkArea } from '../utils/routeSort';

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

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCount(value) {
  return safeNumber(value).toLocaleString();
}

function buildFallbackDriverRows(routes) {
  return sortRoutesByWorkArea(routes).map((route) => {
    const pendingStop = (route.stops || []).find((stop) => stop.status === 'pending') || null;
    const pickupStopCount = safeNumber(route.pickup_stops ?? route.pickup_stop_count ?? route.total_pickup_stops) ||
      (route.stops || []).filter((stop) => (
        stop?.has_pickup ||
        stop?.is_pickup ||
        stop?.stop_type === 'pickup' ||
        stop?.stop_type === 'combined'
      )).length;

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
      pickup_stops: pickupStopCount,
      pickup_stop_count: pickupStopCount,
      driver_pickup_stops: pickupStopCount,
      time_commits_total: Number(route.time_commits_total || 0),
      time_commits_completed: Number(route.time_commits_completed || 0),
      stops_per_hour: route.stops_per_hour ?? null,
      last_position: null,
      is_online: false
    };
  });
}

function buildFallbackDashboard(routes, date) {
  const safeRoutes = sortRoutesByWorkArea(routes);
  const pickupStops = safeRoutes.reduce((sum, route) => (
    sum + (
      safeNumber(route.pickup_stops ?? route.pickup_stop_count ?? route.total_pickup_stops) ||
      (route.stops || []).filter((stop) => (
        stop?.has_pickup ||
        stop?.is_pickup ||
        stop?.stop_type === 'pickup' ||
        stop?.stop_type === 'combined'
      )).length
    )
  ), 0);

  return {
    date,
    total_stops: safeRoutes.reduce((sum, route) => sum + Number(route.total_stops || 0), 0),
    completed_stops: safeRoutes.reduce((sum, route) => sum + Number(route.completed_stops || 0), 0),
    total_pickup_stops: pickupStops,
    pickup_stops: pickupStops,
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
  const [mapMountNonce, setMapMountNonce] = useState(0);

  const handleMapRef = useCallback((node) => {
    mapRef.current = node;

    if (node) {
      setMapMountNonce((value) => value + 1);
    }
  }, []);

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
  }, [boundsPoints, center, markers, mapMountNonce]);

  return (
    <div className="map-panel">
      {errorMessage ? <div className="map-fallback">{errorMessage}</div> : <div className="map-canvas" ref={handleMapRef} />}
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
  const uniqueWorkAreas = [...new Set((routes || []).map((route) => route.work_area_name).filter(Boolean))]
    .sort(compareRouteLabels);
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

function getTodayMetrics({ dashboard, overviewRoutes = [], routeRows = [] }) {
  const packageSummary = dashboard?.package_status_summary || {};
  const stopStatusSummary = dashboard?.stop_status_summary || {};
  const totalStops = safeNumber(dashboard?.total_stops || overviewRoutes.reduce((sum, route) => sum + safeNumber(route.total_stops), 0));
  const completedStops = safeNumber(dashboard?.completed_stops || routeRows.reduce((sum, row) => sum + safeNumber(row.completed_stops), 0));
  const stopsPerHourValues = routeRows
    .map((row) => Number(row.stops_per_hour))
    .filter((value) => Number.isFinite(value) && value > 0);
  const packageTotalFromRoutes = overviewRoutes.reduce((sum, route) => (
    sum + safeNumber(route.total_packages ?? route.manifest_package_count)
  ), 0);
  const exceptionCount = safeNumber(stopStatusSummary.exception)
    || safeNumber(packageSummary.exception)
    || overviewRoutes.reduce((sum, route) => sum + safeNumber(route.exception_count || route.exceptions), 0);
  const pickupStopsFromRoutes = overviewRoutes.reduce((sum, route) => (
    sum + safeNumber(route.pickup_stops ?? route.pickup_stop_count ?? route.total_pickup_stops)
  ), 0);
  const pickupStopsFromDrivers = routeRows.reduce((sum, row) => (
    sum + safeNumber(row.pickup_stops ?? row.pickup_stop_count ?? row.driver_pickup_stops)
  ), 0);
  const pickupStops =
    dashboard?.total_pickup_stops ??
    dashboard?.pickup_stops ??
    (pickupStopsFromRoutes || pickupStopsFromDrivers);
  const driversOnRoad = routeRows.filter((row) => row.name && row.route_status === 'in_progress').length;

  return {
    routes: safeNumber(dashboard?.sync_status?.routes_today || overviewRoutes.length),
    stops: totalStops,
    completedStops,
    remainingStops: Math.max(0, totalStops - completedStops),
    fleetStopsPerHour: stopsPerHourValues.length
      ? stopsPerHourValues.reduce((sum, value) => sum + value, 0) / stopsPerHourValues.length
      : null,
    driversOnRoad,
    packages: safeNumber(packageSummary.total || packageTotalFromRoutes),
    exceptions: exceptionCount,
    pickupStops: safeNumber(pickupStops)
  };
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
    <StatCard
      className="skeleton-card"
      label={<span className="skeleton-line skeleton-label" />}
      value={<span className="skeleton-line skeleton-value" />}
    />
  );
}

function DashboardIcon({ type }) {
  switch (type) {
    case 'sync':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 7v5h-5M4 17v-5h5M18.2 9A7 7 0 0 0 6.1 6.9M5.8 15a7 7 0 0 0 12.1 2.1" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'drivers':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M16 19a4 4 0 0 0-8 0M12 13a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'vehicles':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 16l1.2-4.8A2 2 0 0 1 8.1 9h7.8a2 2 0 0 1 1.9 2.2L19 16M4 16h16v3H4zM7 19.5h.01M17 19.5h.01" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'pickup':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3 20 7.5v8.8l-8 4.7-8-4.7V7.5L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4.5 7.8 12 12l7.5-4.2M12 12v8.3M12 5.8v6.1m-3.2-3 3.2-3.2 3.2 3.2" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'dispatch':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 12h10M10 6l6 6-6 6M17 5h3v14h-3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'upload':
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 16V4m0 0 4 4m-4-4L8 8M5 16v3h14v-3" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function DashboardErrorCard({ onRetry }) {
  return (
    <section className="card dashboard-error-card">
      <div>
        <div className="card-title">Couldn&apos;t load today&apos;s dashboard</div>
        <p>Check your connection and try again.</p>
      </div>
      <button className="primary-cta" onClick={onRetry} type="button">
        Try again
      </button>
    </section>
  );
}

function DispatchBanner({
  bannerState,
  syncStatus,
  metrics,
  fedexConnection,
  onAssignDrivers,
  onManualUpload,
  onSyncRoutes
}) {
  if (bannerState === 'loading') {
    return null;
  }

  const fccConnected = fedexConnection?.is_connected === true;
  const isReady = bannerState === 'active';
  const summaryParts = [
    metrics.driversOnRoad > 0 ? `${formatCount(metrics.driversOnRoad)} driver${metrics.driversOnRoad === 1 ? '' : 's'} on road` : null,
    metrics.routes > 0 ? `${formatCount(metrics.routes)} route${metrics.routes === 1 ? '' : 's'}` : null,
    metrics.remainingStops > 0 ? `${formatCount(metrics.remainingStops)} remaining` : null
  ].filter(Boolean);
  const summary = summaryParts.length ? summaryParts.join(' · ') : formatSyncTimestamp(syncStatus?.last_sync_at);

  if (bannerState === 'missing') {
    return (
      <section className={`sync-banner dashboard-command-banner missing${fccConnected ? '' : ' fcc-required'}`}>
        <div>
          <h2>Today&apos;s routes need attention</h2>
          <p>{fccConnected ? 'Routes have not loaded yet.' : 'FCC connection required before auto-syncing routes.'}</p>
          {!fccConnected ? (
            <div className="dashboard-fcc-note">
              <strong>FCC connection required</strong>
              <span>Connect FedEx Customer Connection before auto-syncing routes.</span>
            </div>
          ) : null}
        </div>
        <div className="dashboard-banner-actions">
          <button className="primary-cta" disabled={!fccConnected} onClick={onSyncRoutes} type="button">
            Sync FedEx Routes
          </button>
          <button className="secondary-button" onClick={onManualUpload} type="button">
            Upload Manifest
          </button>
        </div>
      </section>
    );
  }

  if (bannerState === 'needs-attention') {
    return (
      <ActionBanner
        className="sync-banner dashboard-command-banner needs-attention"
        title="Today's routes need attention"
        description={summary}
        tone="warning"
        action={(
          <button className="sync-banner-button" onClick={onAssignDrivers} type="button">
            Open Morning Setup
          </button>
        )}
      />
    );
  }

  return (
    <ActionBanner
      className="sync-banner dashboard-command-banner active"
      tone="active"
    >
      <div className="dashboard-loaded-banner">
        <div>
          <h2>{isReady ? 'Routes ready' : "Today's routes need attention"}</h2>
        </div>
        <div className="dashboard-loaded-metrics">
          <span>{summary}</span>
        </div>
      </div>
    </ActionBanner>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('map');
  const [vehiclePickerRouteId, setVehiclePickerRouteId] = useState(null);
  const dashboardDate = searchParams.get('date') || getTodayString();
  const isSelectedDateToday = dashboardDate === getTodayString();
  const { selectedCsaId } = useSelectedCsa();

  useEffect(() => {
    saveStoredOperationsDate(dashboardDate);
  }, [dashboardDate]);

  useEffect(() => {
    if (searchParams.has('date')) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('date', dashboardDate);
    setSearchParams(nextParams, { replace: true });
  }, [dashboardDate, searchParams, setSearchParams]);

  const dashboardQuery = useQuery({
    queryKey: ['manager-dashboard', selectedCsaId, dashboardDate],
    enabled: Boolean(selectedCsaId),
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
    queryKey: ['fleet-vehicles', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/vehicles');
      return response.data?.vehicles || [];
    }
  });

  const routesOverviewQuery = useQuery({
    queryKey: ['dashboard-overview-routes', selectedCsaId, dashboardDate],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/routes', { params: { date: dashboardDate } });
      return response.data || { routes: [], fedex_connection: null, sync_status: null };
    }
  });

  const overviewRoutes = useMemo(
    () => sortRoutesByWorkArea(routesOverviewQuery.data?.routes || []),
    [routesOverviewQuery.data?.routes]
  );
  const fedexConnection = routesOverviewQuery.data?.fedex_connection || null;
  const overviewRouteIdsKey = overviewRoutes.map((route) => route.id).join(',');

  const routeDetailMapQuery = useQuery({
    queryKey: ['dashboard-route-detail-map', selectedCsaId, dashboardDate, overviewRouteIdsKey],
    enabled: Boolean(selectedCsaId) && overviewRoutes.length > 0,
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
    }
  });

  const assignVehicleMutation = useMutation({
    mutationFn: async ({ routeId, vehicleId }) => {
      await api.patch(`/manager/routes/${routeId}/assign`, { vehicle_id: vehicleId });
      return { routeId, vehicleId };
    },
    onSuccess: ({ routeId, vehicleId }) => {
      const vehicle = (vehiclesQuery.data || []).find((entry) => entry.id === vehicleId) || null;
      queryClient.setQueryData(['manager-dashboard', selectedCsaId, dashboardDate], (current) => {
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
  const routeRows = useMemo(
    () => sortRoutesByWorkArea(activeDashboard?.drivers || []),
    [activeDashboard?.drivers]
  );
  const syncStatus = activeDashboard?.sync_status;
  const bannerState =
    dashboardQuery.isLoading && overviewRoutes.length === 0
      ? 'loading'
      : getBannerState(syncStatus, dispatchHealth);
  const todayMetrics = useMemo(
    () => getTodayMetrics({ dashboard: activeDashboard, overviewRoutes, routeRows }),
    [activeDashboard, overviewRoutes, routeRows]
  );
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

  function handleRetryDashboard() {
    dashboardQuery.refetch();
    routesOverviewQuery.refetch();
  }

  return (
    <section className="page-section dashboard-command-center">
      <PageHeader
        actions={(
          <button className="secondary-button dashboard-refresh-button" disabled={dashboardQuery.isFetching} onClick={handleRetryDashboard} type="button">
            {dashboardQuery.isFetching ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
        description={getFriendlyDashboardDate(dashboard?.date || dashboardDate)}
        eyebrow="Command Center"
        title="Dashboard"
      />

      {dashboardQuery.isError ? (
        <DashboardErrorCard onRetry={handleRetryDashboard} />
      ) : null}

      {dashboardQuery.isLoading ? (
        <div className="dashboard-glance-grid">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      {!dashboardQuery.isLoading && !dashboardQuery.isError ? (
        <>
          <DispatchBanner
            bannerState={bannerState}
            fedexConnection={fedexConnection}
            metrics={todayMetrics}
            onAssignDrivers={handleAssignDrivers}
            onManualUpload={handleAssignDrivers}
            onSyncRoutes={handleSyncRoutes}
            syncStatus={syncStatus}
          />

          <div className="dashboard-glance-grid">
            <StatCard label="Total stops today" value={formatCount(todayMetrics.stops)} />
            <StatCard label="Completed stops" tone={todayMetrics.completedStops > 0 ? 'active' : 'neutral'} value={formatCount(todayMetrics.completedStops)} />
            <StatCard label="Remaining stops" tone={todayMetrics.remainingStops > 0 ? 'warning' : 'active'} value={formatCount(todayMetrics.remainingStops)} />
            <StatCard
              label={(
                <span className="dashboard-stat-label-icon">
                  <DashboardIcon type="pickup" />
                  Pickup stops
                </span>
              )}
              value={formatCount(todayMetrics.pickupStops)}
            />
          </div>

          {bannerState !== 'missing' && todayMetrics.routes > 0 ? (
            <details className="dashboard-secondary-details">
              <summary>Route detail and map preview</summary>
              <div className="dashboard-secondary-details-inner">
                <div className="card">
                  <TableToolbar
                    actions={(
                      <button className="secondary-inline-button" onClick={() => navigate(`/fleet-map?date=${dashboardDate}`)} type="button">
                        Open Fleet Map
                      </button>
                    )}
                    title={(
                      <button className="dashboard-fleet-view-title-button" onClick={() => navigate(`/fleet-map?date=${dashboardDate}`)} type="button">
                        Fleet View
                      </button>
                    )}
                  >
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
                  </TableToolbar>

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
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
