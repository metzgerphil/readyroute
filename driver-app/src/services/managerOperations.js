function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getPositionTimestamp(route) {
  return route?.last_position?.timestamp || route?.last_position?.recorded_at || route?.last_position?.created_at || null;
}

function routeHasStarted(route) {
  return ['in_progress', 'complete'].includes(String(route?.status || '').toLowerCase());
}

export const MANAGER_ROUTE_COLOR_PALETTE = [
  '#ff7a1a',
  '#2563eb',
  '#248a57',
  '#6f53d9',
  '#cc4b37',
  '#0f766e',
  '#b7791f',
  '#db2777'
];

function isUsableColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function getRouteColorKey(route) {
  const displayName = getRouteDisplayName(route);
  return String(route?.id || route?.route_id || displayName || route?.work_area_name || '').trim();
}

function getStableColorIndex(value) {
  const key = String(value || '').trim();

  if (!key) {
    return 0;
  }

  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(index)) | 0;
  }

  return Math.abs(hash) % MANAGER_ROUTE_COLOR_PALETTE.length;
}

function getRouteSortNumber(value) {
  const match = String(value || '').match(/\b\d{1,5}\b/);
  return match ? Number(match[0]) : null;
}

export function compareManagerRoutes(left, right) {
  const leftLabel = String(left?.work_area_name || left?.route_number || left?.route_name || left?.route_id || left?.id || '').trim();
  const rightLabel = String(right?.work_area_name || right?.route_number || right?.route_name || right?.route_id || right?.id || '').trim();
  const leftNumber = getRouteSortNumber(leftLabel);
  const rightNumber = getRouteSortNumber(rightLabel);

  if (leftNumber != null && rightNumber != null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  if (leftNumber != null && rightNumber == null) {
    return -1;
  }

  if (leftNumber == null && rightNumber != null) {
    return 1;
  }

  const labelComparison = leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' });

  if (labelComparison !== 0) {
    return labelComparison;
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortManagerRoutes(routes = []) {
  return [...(routes || [])].sort(compareManagerRoutes);
}

function getDistinctRouteColor(route, routes = []) {
  const key = getRouteColorKey(route);
  const routeKeys = (routes || [])
    .map((item) => getRouteColorKey(item))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

  if (!key || routeKeys.length <= MANAGER_ROUTE_COLOR_PALETTE.length) {
    const occupiedIndexes = new Map();

    routeKeys.forEach((routeKey) => {
      let colorIndex = getStableColorIndex(routeKey);
      let attempts = 0;

      while (occupiedIndexes.has(colorIndex) && attempts < MANAGER_ROUTE_COLOR_PALETTE.length) {
        colorIndex = (colorIndex + 1) % MANAGER_ROUTE_COLOR_PALETTE.length;
        attempts += 1;
      }

      occupiedIndexes.set(colorIndex, routeKey);
    });

    const matchedIndex = Array.from(occupiedIndexes.entries()).find(([, routeKey]) => routeKey === key)?.[0];

    if (matchedIndex != null) {
      return MANAGER_ROUTE_COLOR_PALETTE[matchedIndex];
    }
  }

  return MANAGER_ROUTE_COLOR_PALETTE[getStableColorIndex(key)];
}

export function getRouteColor(route, routes = []) {
  const existingColor = route?.routeColor || route?.route_color || route?.color;

  if (isUsableColor(existingColor)) {
    return existingColor;
  }

  if ((routes || []).length <= 1) {
    return MANAGER_ROUTE_COLOR_PALETTE[0];
  }

  return getDistinctRouteColor(route, routes);
}

export function getStopCanonicalId(stop) {
  const candidates = [
    stop?.id,
    stop?.stop_id,
    stop?.route_stop_id,
    stop?.routeStopId,
    stop?.manifest_stop_id,
    stop?.manifestStopId,
    stop?.sequence_id,
    stop?.sequenceId,
    stop?.sid
  ];

  const matched = candidates.find((value) => value != null && String(value).trim());

  if (matched != null) {
    return String(matched);
  }

  const sequence = stop?.sequence_order ?? stop?.sequenceOrder;
  const address = stop?.address || stop?.street_address || stop?.address_line1;

  return sequence != null || address ? `${sequence || ''}:${address || ''}` : '';
}

export function isPickupStop(stop) {
  return stop?.stop_type === 'pickup' || stop?.stop_type === 'combined' || stop?.is_pickup === true || stop?.has_pickup === true;
}

export function isDeliveryStop(stop) {
  return stop?.stop_type === 'delivery' || stop?.stop_type === 'combined' || stop?.has_delivery === true || !isPickupStop(stop);
}

export function getPickupStopCount(route) {
  if (route?.pickup_stop_count != null) {
    return Number(route.pickup_stop_count || 0);
  }

  if (route?.pickup_stops != null && !Array.isArray(route.pickup_stops)) {
    return Number(route.pickup_stops || 0);
  }

  return (route?.stops || []).filter((stop) => isPickupStop(stop)).length;
}

export function getDeliveryStopCount(route) {
  if (route?.delivery_stop_count != null) {
    return Number(route.delivery_stop_count || 0);
  }

  if (route?.delivery_stops != null && !Array.isArray(route.delivery_stops)) {
    return Number(route.delivery_stops || 0);
  }

  return (route?.stops || []).filter((stop) => isDeliveryStop(stop)).length || Number(route?.total_stops || 0);
}

export function toMapCoordinate(point) {
  const latitude = toNumber(point?.lat ?? point?.latitude);
  const longitude = toNumber(point?.lng ?? point?.longitude);

  if (latitude == null || longitude == null || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) {
    return null;
  }

  return {
    latitude,
    longitude
  };
}

export function getDistanceMiles(pointA, pointB) {
  if (!pointA || !pointB) {
    return Number.POSITIVE_INFINITY;
  }

  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.8;
  const latitudeDelta = toRadians(pointB.latitude - pointA.latitude);
  const longitudeDelta = toRadians(pointB.longitude - pointA.longitude);
  const latitudeA = toRadians(pointA.latitude);
  const latitudeB = toRadians(pointB.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusMiles * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function buildRouteCentroid(route) {
  const coordinates = (route?.stops || [])
    .map((stop) => toMapCoordinate(stop))
    .filter(Boolean);

  if (!coordinates.length) {
    return null;
  }

  const latitude = coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) / coordinates.length;
  const longitude = coordinates.reduce((sum, coordinate) => sum + coordinate.longitude, 0) / coordinates.length;

  return {
    latitude,
    longitude
  };
}

export function isMapZoomedIn(region) {
  const latitudeDelta = Number(region?.latitudeDelta);
  const longitudeDelta = Number(region?.longitudeDelta);

  if (!Number.isFinite(latitudeDelta) || !Number.isFinite(longitudeDelta)) {
    return false;
  }

  return Math.max(latitudeDelta, longitudeDelta) <= 0.12;
}

export function getClusterRadiusMiles(region) {
  const latitudeDelta = Number(region?.latitudeDelta);
  const longitudeDelta = Number(region?.longitudeDelta);
  const zoomDelta = Math.max(
    Number.isFinite(latitudeDelta) ? latitudeDelta : 0,
    Number.isFinite(longitudeDelta) ? longitudeDelta : 0
  );

  if (!zoomDelta) {
    return 1.75;
  }

  if (zoomDelta <= 0.035) {
    return 0.18;
  }

  if (zoomDelta <= 0.08) {
    return 0.45;
  }

  if (zoomDelta <= 0.16) {
    return 0.9;
  }

  if (zoomDelta <= 0.3) {
    return 1.6;
  }

  return 2.8;
}

function createRouteMarker(route, coordinate, { selected = false } = {}) {
  return {
    kind: 'route',
    key: `route:${route.id}`,
    routeId: route.id,
    coordinate,
    selected,
    workAreaName: getRouteDisplayName(route),
    driverName: route.driver_name || 'Unassigned',
    completedStops: Number(route.completed_stops || 0),
    totalStops: Number(route.total_stops || 0)
  };
}

export function getRouteDisplayName(route) {
  const rawValue = String(route?.work_area_name || '').trim();

  if (!rawValue) {
    return '--';
  }

  const exactMatch = rawValue.match(/\b\d{3,4}\b/);

  if (exactMatch) {
    return exactMatch[0];
  }

  const digitsOnly = rawValue.replace(/\D+/g, '');

  return digitsOnly || rawValue;
}

export function buildRouteClusterMarkers(routes = [], { selectedRouteId = null, clusterRadiusMiles = 1.75 } = {}) {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || null;
  const otherRouteMarkers = routes
    .filter((route) => route.id !== selectedRouteId)
    .map((route) => {
      const coordinate = buildRouteCentroid(route);

      if (!coordinate) {
        return null;
      }

      return createRouteMarker(route, coordinate);
    })
    .filter(Boolean);

  const visited = new Set();
  const clusterMarkers = [];

  otherRouteMarkers.forEach((marker, index) => {
    if (visited.has(index)) {
      return;
    }

    const cluster = [marker];
    visited.add(index);

    otherRouteMarkers.forEach((candidate, candidateIndex) => {
      if (candidateIndex === index || visited.has(candidateIndex)) {
        return;
      }

      if (getDistanceMiles(marker.coordinate, candidate.coordinate) <= clusterRadiusMiles) {
        cluster.push(candidate);
        visited.add(candidateIndex);
      }
    });

    if (cluster.length === 1) {
      clusterMarkers.push(marker);
      return;
    }

    const latitude = cluster.reduce((sum, item) => sum + item.coordinate.latitude, 0) / cluster.length;
    const longitude = cluster.reduce((sum, item) => sum + item.coordinate.longitude, 0) / cluster.length;

    clusterMarkers.push({
      kind: 'cluster',
      key: `cluster:${cluster.map((item) => item.routeId).sort().join(',')}`,
      coordinate: {
        latitude,
        longitude
      },
      count: cluster.length,
      routeIds: cluster.map((item) => item.routeId),
      workAreaNames: cluster.map((item) => item.workAreaName)
    });
  });

  if (selectedRoute) {
    const selectedCoordinate = buildRouteCentroid(selectedRoute);

    if (selectedCoordinate) {
      clusterMarkers.unshift(createRouteMarker(selectedRoute, selectedCoordinate, { selected: true }));
    }
  }

  return clusterMarkers;
}

export function buildDriverPositionMarkers(routes = []) {
  return routes
    .map((route) => {
      const coordinate = toMapCoordinate(route?.last_position);

      if (!coordinate) {
        return null;
      }

      return {
        key: `driver:${route.id}`,
        routeId: route.id,
        coordinate,
        workAreaName: route.work_area_name || '--',
        driverName: route.driver_name || 'Unassigned',
        isOnline: Boolean(route.is_online),
        gpsFreshness: getGpsFreshness(route)
      };
    })
    .filter(Boolean);
}

function stopRequiresSignature(stop) {
  return (stop?.packages || []).some((pkg) => pkg?.requires_signature || pkg?.requires_adult_signature);
}

export function buildStopMarkers(route, { routeColor = null } = {}) {
  return (route?.stops || [])
    .map((stop) => {
      const coordinate = toMapCoordinate(stop);

      if (!coordinate) {
        return null;
      }

      return {
        key: `stop:${getStopCanonicalId(stop)}`,
        stopId: getStopCanonicalId(stop),
        coordinate,
        sequenceOrder: Number(stop.sequence_order || 0),
        status: stop.status || 'pending',
        routeColor: routeColor || getRouteColor(route),
        hasException: Boolean(stop.exception_code) || ['attempted', 'incomplete', 'pickup_attempted'].includes(stop.status),
        requiresSignature: stopRequiresSignature(stop),
        address: stop.address || 'Stop'
      };
    })
    .filter(Boolean);
}

export function getMapRegionFromCoordinates(coordinates = []) {
  if (!coordinates.length) {
    return {
      latitude: 33.1217,
      longitude: -117.0815,
      latitudeDelta: 0.22,
      longitudeDelta: 0.22
    };
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.55, 0.06),
    longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.55, 0.06)
  };
}

export function buildRouteFocusRegion(route) {
  if (!route) {
    return getMapRegionFromCoordinates([]);
  }

  const coordinates = [
    buildRouteCentroid(route),
    toMapCoordinate(route.last_position),
    ...(route.stops || []).map((stop) => toMapCoordinate(stop))
  ].filter(Boolean);

  return getMapRegionFromCoordinates(coordinates);
}

export function getGpsFreshness(route, nowMs = Date.now()) {
  const timestamp = getPositionTimestamp(route);

  if (!timestamp) {
    if (routeHasStarted(route)) {
      return {
        state: 'unavailable',
        elapsedMinutes: null,
        label: 'Location permission needed',
        shortLabel: 'Location needed'
      };
    }

    return {
      state: 'unavailable',
      elapsedMinutes: null,
      label: 'Driver not on route yet',
      shortLabel: 'Not started'
    };
  }

  const recordedTime = new Date(timestamp).getTime();

  if (!Number.isFinite(recordedTime)) {
    return {
      state: 'unavailable',
      elapsedMinutes: null,
      label: 'Location unavailable',
      shortLabel: 'No location'
    };
  }

  const elapsedMinutes = Math.max(0, Math.round((nowMs - recordedTime) / 60000));

  if (route?.is_online) {
    return {
      state: 'live',
      elapsedMinutes,
      label: elapsedMinutes <= 1 ? 'Location live now' : `Location live ${elapsedMinutes}m ago`,
      shortLabel: elapsedMinutes <= 1 ? 'Live' : `${elapsedMinutes}m`
    };
  }

  if (elapsedMinutes <= 10) {
    return {
      state: 'recent',
      elapsedMinutes,
      label: `Location updated ${elapsedMinutes}m ago`,
      shortLabel: `${elapsedMinutes}m`
    };
  }

  return {
    state: 'stale',
    elapsedMinutes,
    label: `Location updated ${elapsedMinutes}m ago`,
    shortLabel: `${elapsedMinutes}m`
  };
}

export function buildManagerOverviewStats(routes = []) {
  return (routes || []).reduce(
    (summary, route) => {
      const completedStops = Number(route?.completed_stops || 0);
      const totalStops = Number(route?.total_stops || 0);
      const deliveredPackages = Number(route?.delivered_packages || 0);
      const totalPackages = Number(route?.total_packages || 0);
      const timeCommitsCompleted = Number(route?.time_commits_completed || 0);
      const timeCommitsTotal = Number(route?.time_commits_total || 0);
      const exceptionStops = (route?.stops || []).filter(
        (stop) => stop?.exception_code || ['attempted', 'incomplete', 'pickup_attempted'].includes(stop?.status)
      ).length;
      const liveGps = getGpsFreshness(route).state === 'live';

      summary.routeSummary.total += 1;
      summary.routeSummary.completed += route?.status === 'complete' || (totalStops > 0 && completedStops >= totalStops) ? 1 : 0;
      summary.commitSummary.completed += timeCommitsCompleted;
      summary.commitSummary.total += timeCommitsTotal;
      summary.stopSummary.completed += completedStops;
      summary.stopSummary.total += totalStops;
      summary.stopSummary.exception += exceptionStops;
      summary.packageSummary.completed += deliveredPackages;
      summary.packageSummary.total += totalPackages;
      summary.packageSummary.pending += Math.max(totalPackages - deliveredPackages, 0);
      summary.pickupStops += getPickupStopCount(route);
      summary.liveDrivers += liveGps ? 1 : 0;

      return summary;
    },
    {
      routeSummary: {
        completed: 0,
        total: 0
      },
      commitSummary: {
        completed: 0,
        total: 0
      },
      stopSummary: {
        completed: 0,
        total: 0,
        exception: 0
      },
      packageSummary: {
        completed: 0,
        total: 0,
        pending: 0
      },
      pickupStops: 0,
      liveDrivers: 0
    }
  );
}

export function buildVisibleStopMarkers(routes = [], { selectedRoute = null, region = null, maxStopMarkers = 80 } = {}) {
  if (selectedRoute) {
    const routeColor = getRouteColor(selectedRoute, routes);
    return buildStopMarkers(selectedRoute).map((marker) => ({
      ...marker,
      routeColor,
      routeId: selectedRoute.id
    }));
  }

  if (!isMapZoomedIn(region)) {
    return [];
  }

  return routes
    .flatMap((route) => buildStopMarkers(route, { routeColor: getRouteColor(route, routes) }).map((marker) => ({
      ...marker,
      routeId: route.id
    })))
    .slice(0, maxStopMarkers);
}

export function buildManagerMapModel({ routes = [], selectedRouteId = null, region = null } = {}) {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || null;
  const routeMarkers = [];
  const routeCoordinates = routes.map((route) => buildRouteCentroid(route)).filter(Boolean);
  const driverMarkers = buildDriverPositionMarkers(routes);
  const stopMarkers = buildVisibleStopMarkers(routes, {
    selectedRoute,
    region
  });
  const coordinates = [
    ...routeCoordinates,
    ...driverMarkers.map((marker) => marker.coordinate),
    ...stopMarkers.map((marker) => marker.coordinate)
  ].filter(Boolean);

  return {
    selectedRoute,
    routeMarkers,
    driverMarkers,
    stopMarkers,
    region: region || getMapRegionFromCoordinates(coordinates)
  };
}

export function getSheetSnapLayout(screenHeight) {
  const expandedHeight = Math.max(360, Math.round(screenHeight * 0.8));
  const halfHeight = Math.max(290, Math.round(screenHeight * 0.5));
  const collapsedHeight = Math.max(150, Math.round(screenHeight * 0.22));
  const maxOffset = Math.max(expandedHeight - collapsedHeight, 0);

  return {
    collapsedHeight,
    expandedHeight,
    halfHeight,
    maxOffset,
    snapOffsets: {
      expanded: 0,
      half: Math.max(expandedHeight - halfHeight, 0),
      collapsed: maxOffset
    }
  };
}

export function clampSheetOffset(offset, layout) {
  return Math.min(Math.max(offset, 0), layout.maxOffset);
}

export function resolveNearestSheetSnap(offset, layout) {
  const entries = Object.entries(layout.snapOffsets);

  return entries.reduce((closest, entry) => {
    if (!closest) {
      return entry;
    }

    return Math.abs(entry[1] - offset) < Math.abs(closest[1] - offset) ? entry : closest;
  }, null)?.[0] || 'half';
}
