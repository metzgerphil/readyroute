import { format, isValid, parseISO } from 'date-fns';

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

export function getRemainingStops(dashboard) {
  return Math.max(0, Number(dashboard?.total_stops || 0) - Number(dashboard?.completed_stops || 0));
}

export function getRemainingDeliveries(dashboard) {
  return Math.max(0, Number(dashboard?.delivery_stops || dashboard?.total_delivery_stops || 0) - Number(dashboard?.delivery_stops_completed || 0));
}

export function getRemainingPickups(dashboard) {
  return Math.max(0, Number(dashboard?.pickup_stops || dashboard?.total_pickup_stops || 0) - Number(dashboard?.pickup_stops_completed || 0));
}

function isPickupStop(stop) {
  const stopType = stop?.stop_type || (stop?.is_pickup ? 'pickup' : 'delivery');
  return Boolean(stop?.has_pickup || stop?.is_pickup || stopType === 'pickup' || stopType === 'combined');
}

function isDeliveryStop(stop) {
  const stopType = stop?.stop_type || (stop?.is_pickup ? 'pickup' : 'delivery');
  return Boolean(stop?.has_delivery || stopType === 'delivery' || stopType === 'combined' || !isPickupStop(stop));
}

function countCombinedStops(stops = []) {
  return (stops || []).filter((stop) => isPickupStop(stop) && isDeliveryStop(stop)).length;
}

export function getFleetStopsPerHour(routeRows) {
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
      delivery_stops: Number(route.delivery_stops || route.delivery_stop_count || route.total_stops || 0),
      delivery_stops_completed: Number(route.delivery_stops_completed || 0),
      pickup_stops: Number(route.pickup_stops || route.pickup_stop_count || 0),
      pickup_stops_completed: Number(route.pickup_stops_completed || 0),
      combined_stops: Number(route.combined_stops || route.combined_stop_count || countCombinedStops(route.stops || [])),
      combined_stop_count: Number(route.combined_stops || route.combined_stop_count || countCombinedStops(route.stops || [])),
      time_commits_total: Number(route.time_commits_total || 0),
      time_commits_completed: Number(route.time_commits_completed || 0),
      stops_per_hour: route.stops_per_hour ?? null,
      last_position: null,
      is_online: false
    };
  });
}

export function buildFallbackDashboard(routes, date) {
  const safeRoutes = routes || [];

  return {
    date,
    total_stops: safeRoutes.reduce((sum, route) => sum + Number(route.total_stops || 0), 0),
    completed_stops: safeRoutes.reduce((sum, route) => sum + Number(route.completed_stops || 0), 0),
    total_delivery_stops: safeRoutes.reduce((sum, route) => sum + Number(route.delivery_stops || route.delivery_stop_count || route.total_stops || 0), 0),
    delivery_stops: safeRoutes.reduce((sum, route) => sum + Number(route.delivery_stops || route.delivery_stop_count || route.total_stops || 0), 0),
    delivery_stops_completed: safeRoutes.reduce((sum, route) => sum + Number(route.delivery_stops_completed || 0), 0),
    total_pickup_stops: safeRoutes.reduce((sum, route) => sum + Number(route.pickup_stops || route.pickup_stop_count || 0), 0),
    pickup_stops: safeRoutes.reduce((sum, route) => sum + Number(route.pickup_stops || route.pickup_stop_count || 0), 0),
    pickup_stops_completed: safeRoutes.reduce((sum, route) => sum + Number(route.pickup_stops_completed || 0), 0),
    total_combined_stops: safeRoutes.reduce((sum, route) => sum + Number(route.combined_stops || route.combined_stop_count || countCombinedStops(route.stops || [])), 0),
    combined_stops: safeRoutes.reduce((sum, route) => sum + Number(route.combined_stops || route.combined_stop_count || countCombinedStops(route.stops || [])), 0),
    combined_stop_count: safeRoutes.reduce((sum, route) => sum + Number(route.combined_stops || route.combined_stop_count || countCombinedStops(route.stops || [])), 0),
    sync_status: {
      routes_today: safeRoutes.length,
      routes_assigned: safeRoutes.filter((route) => Boolean(route.driver_id)).length,
      drivers_on_road: safeRoutes.filter((route) => route.status === 'in_progress' && route.driver_id).length,
      last_sync_at: null
    },
    drivers: buildFallbackDriverRows(safeRoutes)
  };
}

export function getDriverInitials(name) {
  const parts = String(name || '').split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return 'RR';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

export function getDriverPinColor(routeStatus) {
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

export function getValidCoordinatePoints(points = []) {
  return (points || []).filter((point) => {
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    const isOrigin = Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001;
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180 && !isOrigin;
  });
}

export function getRouteCentroid(stops = []) {
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

export function getPrimaryBoundsPoints(points = []) {
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

export function getPendingTimeCommitMetadata(route) {
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

export function buildRouteCentroidMarkers(routeDetails = [], routeColorMap = new Map()) {
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

export function createDriverPinSvg(driverMarker) {
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

export function getRouteColorMap(routes) {
  const uniqueWorkAreas = [...new Set((routes || []).map((route) => route.work_area_name).filter(Boolean))].sort();
  return uniqueWorkAreas.reduce((map, workAreaName, index) => {
    map.set(workAreaName, ROUTE_COLOR_PALETTE[index % ROUTE_COLOR_PALETTE.length]);
    return map;
  }, new Map());
}

export function getFriendlyDashboardDate(dateValue) {
  if (!dateValue) {
    return 'Today';
  }

  const parsedDate = new Date(`${dateValue}T12:00:00`);

  if (!isValid(parsedDate)) {
    return 'Today';
  }

  return format(parsedDate, 'EEEE, MMMM d');
}

export function formatSyncTimestamp(value) {
  if (!value) {
    return 'Never synced';
  }

  const parsed = typeof value === 'string' ? parseISO(value) : new Date(value);

  if (!isValid(parsed)) {
    return 'Never synced';
  }

  return `Last sync: ${format(parsed, 'p')} — ${format(parsed, 'MMM d')}`;
}

export function getMissingRoutesState(syncStatus, dateValue) {
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

export function getDispatchHealthSummary(routes = []) {
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

export function getBannerState(syncStatus, dispatchHealth) {
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

export function getMapCoverageSummary({
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
