export function getPinWorkflowMeta(stop) {
  if (!stop || stop.lat == null || stop.lng == null) {
    return {
      shortLabel: 'NEEDS PIN',
      badgeClassName: 'pin-needs',
      title: 'Missing pin',
      detail: 'This stop does not have a usable map pin yet.',
      recommendation: 'Attach GPX coordinates, upload a learned pin, or correct the stop pin from the field.'
    };
  }

  if (stop.location_correction || stop.geocode_source === 'driver_verified') {
    return {
      shortLabel: 'SAVED PIN',
      badgeClassName: 'pin-saved',
      title: 'Saved team pin',
      detail: 'This stop is using a corrected pin saved by your team.',
      recommendation: 'Only adjust this if the driver reports the saved pin is still wrong.'
    };
  }

  if (stop.geocode_source === 'manifest') {
    return {
      shortLabel: 'ROUTE PIN',
      badgeClassName: 'pin-manifest',
      title: 'Route-file pin',
      detail: 'This pin came directly from the uploaded route file, such as GPX coordinates.',
      recommendation: 'Trust this first unless the stop lands at the wrong entrance or building.'
    };
  }

  if (stop.geocode_source === 'manifest_geocoded' || stop.geocode_source === 'google') {
    return {
      shortLabel: 'LEARNED PIN',
      badgeClassName: 'pin-google',
      title: 'Learned map pin',
      detail: 'ReadyRoute created this pin from the stop address and cached it for reuse.',
      recommendation: 'Review if the stop is a complex apartment, office park, or dock-sensitive business.'
    };
  }

  if (stop.geocode_source) {
    const label = String(stop.geocode_source).replace(/_/g, ' ');
    return {
      shortLabel: `${label.toUpperCase()} PIN`,
      badgeClassName: 'pin-other',
      title: `${label} pin`,
      detail: 'This stop has a usable stored pin from an alternate mapping source.',
      recommendation: 'Confirm it looks right on the route map before dispatch.'
    };
  }

  return {
    shortLabel: 'MAPPED PIN',
    badgeClassName: 'pin-other',
    title: 'Mapped pin',
    detail: 'This stop has a usable pin, but the exact source is not labeled.',
    recommendation: 'Spot-check the stop if it is operationally important.'
  };
}

export function getParsedProfileChips(stop) {
  if (!stop) {
    return [];
  }

  return [
    stop.location_type ? `Detected ${String(stop.location_type).toUpperCase()}` : null,
    stop.secondary_address_type ? `Secondary ${String(stop.secondary_address_type).toUpperCase()}` : null,
    stop.unit_label ? `Unit ${stop.unit_label}` : null,
    stop.suite_label ? `Suite ${stop.suite_label}` : null,
    stop.building_label || null,
    stop.floor_label || null
  ].filter(Boolean);
}

export function getPropertyWorkflowHint(stop) {
  const profile = getParsedProfileChips(stop);
  const pinMeta = getPinWorkflowMeta(stop);

  return {
    profile,
    pinMeta
  };
}
