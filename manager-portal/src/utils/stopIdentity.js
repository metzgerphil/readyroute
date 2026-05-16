export function getCanonicalStopId(stop) {
  if (!stop) {
    return null;
  }

  const candidates = [
    stop.id,
    stop.stop_id,
    stop.stopId,
    stop.route_stop_id,
    stop.routeStopId,
    stop.manifest_stop_id,
    stop.manifestStopId,
    stop.sequence_id,
    stop.sequenceId
  ];

  for (const candidate of candidates) {
    if (candidate != null && String(candidate).trim()) {
      return String(candidate);
    }
  }

  if (stop.sid != null && String(stop.sid).trim() && String(stop.sid) !== '0') {
    return `sid:${String(stop.sid).trim()}`;
  }

  if (stop.route_id != null && stop.sequence_order != null) {
    return `route:${String(stop.route_id)}:seq:${String(stop.sequence_order)}`;
  }

  if (stop.sequence_order != null) {
    return `seq:${String(stop.sequence_order)}`;
  }

  return null;
}

export function isSameCanonicalStop(left, right) {
  const leftId = getCanonicalStopId(left);
  const rightId = getCanonicalStopId(right);

  return Boolean(leftId && rightId && leftId === rightId);
}
