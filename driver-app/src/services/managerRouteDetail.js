function toMapCoordinate(point) {
  const latitude = Number(point?.lat ?? point?.latitude);
  const longitude = Number(point?.lng ?? point?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    latitude,
    longitude
  };
}

function isCompletedStop(stop) {
  return stop?.status === 'delivered' || stop?.status === 'complete' || Boolean(stop?.completed_at);
}

function isExceptionStop(stop) {
  return Boolean(stop?.exception_code) || stop?.status === 'incomplete';
}

function formatExceptionCode(code) {
  const value = String(code || '').trim();

  if (!value) {
    return 'Exception';
  }

  if (/^\d+$/.test(value)) {
    return `Code ${value.padStart(2, '0')}`;
  }

  return `Code ${value.toUpperCase()}`;
}

export function getPackageProgress(stops = []) {
  const allPackages = (stops || []).flatMap((stop) => stop?.packages || []);

  return {
    delivered: (stops || []).reduce((count, stop) => count + (isCompletedStop(stop) ? (stop?.packages || []).length : 0), 0),
    total: allPackages.length
  };
}

export function getRouteWarnings(stops = []) {
  const pendingTimeCommits = (stops || []).filter((stop) => stop?.has_time_commit && !isCompletedStop(stop)).length;
  const exceptions = (stops || []).filter((stop) => isExceptionStop(stop)).length;
  const notedStops = (stops || []).filter((stop) => stop?.has_note || stop?.notes).length;

  return {
    exceptions,
    notedStops,
    pendingTimeCommits
  };
}

export function formatDriverFreshness(position, nowMs = Date.now()) {
  if (!position?.timestamp) {
    return 'GPS unavailable';
  }

  const recordedTime = new Date(position.timestamp).getTime();

  if (!Number.isFinite(recordedTime)) {
    return 'GPS unavailable';
  }

  const elapsedMinutes = Math.max(0, Math.round((nowMs - recordedTime) / 60000));
  return elapsedMinutes <= 1 ? 'Driver seen just now' : `Driver seen ${elapsedMinutes}m ago`;
}

export function getStopIndicatorLabels(stop) {
  const labels = [];

  if (isExceptionStop(stop)) {
    labels.push(formatExceptionCode(stop?.exception_code));
  }

  if (stop?.has_time_commit && !isCompletedStop(stop)) {
    labels.push('Time commit');
  }

  if (stop?.has_note || stop?.notes) {
    labels.push('Note');
  }

  if (stop?.packages?.some((item) => item.requires_signature)) {
    labels.push('Signature');
  }

  return labels;
}

export function buildRouteDetailMapModel({ route = null, stops = [], driverPosition = null } = {}) {
  const stopMarkers = (stops || [])
    .map((stop) => {
      const coordinate = toMapCoordinate(stop);

      if (!coordinate) {
        return null;
      }

      return {
        key: `stop:${stop.id}`,
        stopId: stop.id,
        coordinate,
        sequenceOrder: Number(stop.sequence_order || 0),
        status: stop.status || 'pending'
      };
    })
    .filter(Boolean);

  const routeCoordinate = route?.work_area_name && stopMarkers.length
    ? {
        latitude: stopMarkers.reduce((sum, marker) => sum + marker.coordinate.latitude, 0) / stopMarkers.length,
        longitude: stopMarkers.reduce((sum, marker) => sum + marker.coordinate.longitude, 0) / stopMarkers.length
      }
    : null;
  const driverCoordinate = toMapCoordinate(driverPosition);
  const coordinates = [
    routeCoordinate,
    driverCoordinate,
    ...stopMarkers.map((marker) => marker.coordinate)
  ].filter(Boolean);

  if (!coordinates.length) {
    return {
      routeMarker: null,
      driverMarker: null,
      stopMarkers: [],
      region: {
        latitude: 33.1217,
        longitude: -117.0815,
        latitudeDelta: 0.16,
        longitudeDelta: 0.16
      }
    };
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    routeMarker: routeCoordinate
      ? {
          coordinate: routeCoordinate,
          workAreaName: route?.work_area_name || '--'
        }
      : null,
    driverMarker: driverCoordinate
      ? {
          coordinate: driverCoordinate,
          driverName: driverPosition?.driver_name || route?.driver_name || 'Driver'
        }
      : null,
    stopMarkers,
    region: {
      latitude: (minLatitude + maxLatitude) / 2,
      longitude: (minLongitude + maxLongitude) / 2,
      latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.5, 0.05),
      longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.5, 0.05)
    }
  };
}
