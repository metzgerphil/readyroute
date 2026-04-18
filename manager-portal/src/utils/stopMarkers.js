function getGoogleMaps() {
  if (!window.google?.maps) {
    throw new Error('Google Maps is not available');
  }

  return window.google.maps;
}

function getDriverInitials(driverName) {
  const parts = String(driverName || '').trim().split(/\s+/).filter(Boolean);

  if (!parts.length) {
    return 'RR';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function getStatusFill(status) {
  switch (status) {
    case 'pending':
      return '#ffffff';
    case 'delivered':
      return '#27ae60';
    case 'attempted':
      return '#f39c12';
    case 'incomplete':
      return '#e74c3c';
    default:
      return '#1a2332';
  }
}

function getStatusStroke(status, stopType, stop) {
  if (stopType === 'pickup') {
    return '#1f6d9b';
  }

  if (stop?.is_business) {
    return '#4d148c';
  }

  switch (status) {
    case 'delivered':
      return '#1e8449';
    case 'attempted':
      return '#d68910';
    case 'incomplete':
      return '#cb4335';
    case 'pending':
    default:
      return '#111111';
  }
}

function getStatusTextColor(status, stopType) {
  if (stopType === 'pickup') {
    return '#ffffff';
  }

  switch (status) {
    case 'pending':
      return '#111111';
    case 'delivered':
    case 'attempted':
    case 'incomplete':
    default:
      return '#ffffff';
  }
}

function getStopType(stop) {
  if (stop?.stop_type === 'combined') {
    return 'combined';
  }

  if (stop?.stop_type === 'pickup') {
    return 'pickup';
  }

  return 'delivery';
}

function getPendingStroke(stop) {
  if (stop?.is_business) {
    return '#4d148c';
  }

  if (stop?.is_apartment_unit) {
    return '#ff6200';
  }

  return '#111111';
}

export function createStopMarkerSVG(stop, isCurrentStop = false) {
  const maps = getGoogleMaps();
  const stopType = getStopType(stop);
  const isTimedStop = Boolean(stop?.has_time_commit);
  const size = isCurrentStop ? 40 : 32;
  const baseRadius = size / 2;
  const center = 24;
  const ringPadding = 6;
  const outerSize = size + ringPadding * 2 + 4;
  const viewBox = `0 0 ${outerSize} ${outerSize}`;
  const fill = stopType === 'pickup' || isTimedStop ? '#2980b9' : getStatusFill(stop?.status);
  const stroke =
    stop?.status === 'pending' && stopType !== 'pickup' && !isTimedStop
      ? getPendingStroke(stop)
      : getStatusStroke(stop?.status, stopType, stop);
  const textColor = stopType === 'pickup' || isTimedStop ? '#ffffff' : getStatusTextColor(stop?.status, stopType);
  const content = stopType === 'pickup' || isTimedStop ? '+' : String(stop?.sequence_order ?? '');
  const fontSize = stopType === 'pickup' || isTimedStop ? Math.max(18, size * 0.56) : Math.max(13, size * 0.4);
  const exceptionRing = stop?.exception_code && stop?.status === 'attempted'
    ? `<circle cx="${center}" cy="${center}" r="${baseRadius + 2.5}" fill="none" stroke="#e74c3c" stroke-width="2" />`
    : '';
  const businessBadge = stop?.is_business
    ? `
      <circle cx="${center + baseRadius - 2}" cy="${center + baseRadius - 2}" r="7" fill="#4d148c" />
      <text x="${center + baseRadius - 2}" y="${center + baseRadius + 1.2}" text-anchor="middle" font-size="8" font-weight="900" fill="#ffffff">B</text>
    `
    : '';
  const apartmentBadge = stop?.is_apartment_unit
    ? `
      <circle cx="${center - baseRadius + 4}" cy="${center - baseRadius + 4}" r="6" fill="#ff6200" stroke="#ffffff" stroke-width="1.25" />
      <text x="${center - baseRadius + 4}" y="${center - baseRadius + 6}" text-anchor="middle" font-size="7" font-weight="900" fill="#ffffff">A</text>
    `
    : '';
  const pickupBadge = stopType === 'combined'
    ? `
      <circle cx="${center + baseRadius - 3}" cy="${center - baseRadius + 3}" r="6" fill="#2980b9" stroke="#ffffff" stroke-width="1.25" />
      <text x="${center + baseRadius - 3}" y="${center - baseRadius + 5.2}" text-anchor="middle" font-size="9" font-weight="900" fill="#ffffff">+</text>
    `
    : '';
  const noteBadge = stop?.has_note
    ? `
      <circle cx="${center - baseRadius + 3}" cy="${center + baseRadius - 3}" r="6" fill="#111111" />
      <text x="${center - baseRadius + 3}" y="${center + baseRadius - 0.6}" text-anchor="middle" font-size="8" font-weight="900" fill="#ffffff">✏</text>
    `
    : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${outerSize}" height="${outerSize}" viewBox="${viewBox}">
      ${exceptionRing}
      <circle cx="${center}" cy="${center}" r="${baseRadius}" fill="${fill}" stroke="${stroke}" stroke-width="2" />
      <text
        x="${center}"
        y="${center + (stopType === 'pickup' ? fontSize * 0.22 : fontSize * 0.18)}"
        text-anchor="middle"
        font-size="${fontSize}"
        font-weight="900"
        fill="${textColor}"
        font-family="Arial, sans-serif"
      >${content}</text>
      ${apartmentBadge}
      ${businessBadge}
      ${pickupBadge}
      ${noteBadge}
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(outerSize, outerSize),
    anchor: new maps.Point(center, center)
  };
}

export function createDriverPositionMarker(driverName, routeStatus) {
  const maps = getGoogleMaps();
  const fillByStatus = {
    in_progress: '#1a2332',
    complete: '#27ae60',
    default: '#888888'
  };
  const fill = fillByStatus[routeStatus] || fillByStatus.default;
  const initials = getDriverInitials(driverName);
  const size = 44;
  const center = 22;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
      <circle cx="${center}" cy="${center}" r="22" fill="${fill}" />
      <text x="${center}" y="26.5" text-anchor="middle" font-size="14" font-weight="900" fill="#ffffff" font-family="Arial, sans-serif">${initials}</text>
    </svg>
  `;

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(size, size),
    anchor: new maps.Point(center, center)
  };
}

export function getMarkerZIndex(stop, isCurrentStop = false) {
  if (isCurrentStop) {
    return 1000;
  }

  switch (stop?.status) {
    case 'incomplete':
      return 500;
    case 'attempted':
      return 400;
    case 'pending':
      return 300;
    case 'delivered':
    default:
      return 100;
  }
}
