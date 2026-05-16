function getRouteSortLabel(route) {
  return String(route?.work_area_name || route?.route_number || route?.route_name || route?.route_id || route?.id || '').trim();
}

function getRouteSortNumber(value) {
  const match = String(value || '').match(/\b\d{1,5}\b/);
  return match ? Number(match[0]) : null;
}

export function compareRouteLabels(leftValue, rightValue) {
  const leftLabel = String(leftValue || '').trim();
  const rightLabel = String(rightValue || '').trim();
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

  return leftLabel.localeCompare(rightLabel, undefined, { numeric: true, sensitivity: 'base' });
}

export function compareRoutesByWorkArea(left, right) {
  const labelComparison = compareRouteLabels(getRouteSortLabel(left), getRouteSortLabel(right));

  if (labelComparison !== 0) {
    return labelComparison;
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortRoutesByWorkArea(routes = []) {
  return [...(routes || [])].sort(compareRoutesByWorkArea);
}
