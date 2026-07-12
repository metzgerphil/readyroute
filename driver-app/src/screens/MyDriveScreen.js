import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import api from '../services/api';
import appTheme from '../theme/appTheme';
import { getPinColorMode, removeClockInTime, saveClockInTime, subscribePinColorMode } from '../services/auth';
import { fetchDriverDriveRoute, getCachedDriverDriveRoute } from '../services/driverRouteCache';
import {
  getAlwaysLocationPermission,
  postDriverLocation,
  requestAlwaysLocationPermission,
  startDriverLocationTracking,
  stopDriverLocationTracking
} from '../services/driverLocationTracking';
import { getApiErrorMessage } from '../utils/apiError';
import { getSidBucketTheme } from '../utils/sidBuckets';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const shouldUseGoogleProvider = Platform.OS !== 'ios' || Boolean(String(googleMapsApiKey).trim());
export const DRIVER_LOCATION_POST_INTERVAL_MS = 5000;
export const DRIVER_LOCATION_POST_DISTANCE_MILES = 0.006;

function getDriverLocationAccuracy() {
  return Location.Accuracy?.BestForNavigation || Location.Accuracy?.Highest || Location.Accuracy?.High || undefined;
}

function getDriverLocationWatchOptions() {
  const accuracy = getDriverLocationAccuracy();

  return {
    ...(accuracy ? { accuracy } : {}),
    distanceInterval: 1,
    timeInterval: 1000,
    mayShowUserSettingsDialog: true
  };
}

export function getPendingStops(stops) {
  return (stops || []).filter((stop) => stop.status === 'pending');
}

export function getMappableStops(stops) {
  return (stops || []).filter((stop) => toCoordinate(stop));
}

export function getStopsPerHourLabel(value) {
  if (value === null || value === undefined) {
    return '-- stops/hr';
  }

  return `${value} stops/hr`;
}

export function hasGrantedLocationPermission(permission) {
  return Boolean(permission?.granted || permission?.status === 'granted');
}

export function shouldPromptForLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return !status || status === 'undetermined';
}

export function isBlockedLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return status === 'denied' && !permission?.canAskAgain;
}

export function isDeniedLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return status === 'denied' || (!status && permission?.granted === false);
}

export function getLocationRequirementCopy() {
  return {
    title: 'Enable location for route tracking',
    body: 'ReadyRoute uses your location while you are on route so your manager can see route progress, support dispatch decisions, and locate drivers during the workday.',
    bullets: [
      'Shows your route location to your manager while you are working.',
      'Helps dispatch support pickups, rescues, and route progress.',
      'Keeps the fleet map accurate during the day.'
    ],
    secondary: 'You can manage location access later in your device settings.',
    blocked: 'Location access is required to run a route in ReadyRoute.'
  };
}

export function getPostDispatchChangeNotice(route) {
  const policyCode = route?.post_dispatch_change_policy?.code || 'none';

  if (policyCode === 'manager_review_required') {
    return {
      title: 'Route changed after dispatch',
      body: 'FCC changed this route after it went live and work has already started. Check with your manager before continuing if anything looks different.'
    };
  }

  if (policyCode === 'driver_warning') {
    return {
      title: 'Route updated after dispatch',
      body: 'FCC changed this route after it went live. Review stop order and details carefully before moving on.'
    };
  }

  return null;
}

export function formatBreakLabel(breakType) {
  switch (breakType) {
    case 'lunch':
      return 'Lunch';
    case 'other':
      return 'Break';
    case 'rest':
    default:
      return 'Break';
  }
}

export function getBreakAutoEndTimestamp(activeBreak) {
  if (!activeBreak?.started_at) {
    return null;
  }

  if (activeBreak?.scheduled_end_at) {
    return activeBreak.scheduled_end_at;
  }

  const startedAtMs = new Date(activeBreak.started_at).getTime();

  if (!Number.isFinite(startedAtMs)) {
    return null;
  }

  const durationMinutes = activeBreak.break_type === 'lunch' ? 30 : 15;
  return new Date(startedAtMs + durationMinutes * 60 * 1000).toISOString();
}

export function formatLaborTime(timestamp) {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

export function formatStopScanTime(timestamp) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function formatFedExExceptionCode(code) {
  const value = String(code || '').trim();

  if (!value) {
    return null;
  }

  return /^\d+$/.test(value) ? `Code ${value.padStart(2, '0')}` : `Code ${value.toUpperCase()}`;
}

export function getMarkerRenderKey({ itemId, isCurrentStop, refreshVersion }) {
  return `${itemId}:${isCurrentStop ? 'selected' : 'idle'}:${refreshVersion}`;
}

export function getDriverHeading(location) {
  const heading = Number(location?.coords?.heading);

  if (!Number.isFinite(heading) || heading < 0) {
    return 0;
  }

  return heading;
}

export function toCoordinate(stop) {
  if (!stop || stop.lat === null || stop.lat === undefined || stop.lng === null || stop.lng === undefined) {
    return null;
  }

  return {
    latitude: Number(stop.lat),
    longitude: Number(stop.lng)
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

export function shouldPostDriverLocationUpdate({
  forcePost = false,
  lastPostedAt = 0,
  lastPostedCoordinate = null,
  now = Date.now(),
  position
}) {
  const coords = position?.coords;

  if (!coords || !Number.isFinite(Number(coords.latitude)) || !Number.isFinite(Number(coords.longitude))) {
    return false;
  }

  if (forcePost || !lastPostedAt || !lastPostedCoordinate) {
    return true;
  }

  const nextCoordinate = {
    latitude: Number(coords.latitude),
    longitude: Number(coords.longitude)
  };

  return (
    now - lastPostedAt >= DRIVER_LOCATION_POST_INTERVAL_MS ||
    getDistanceMiles(lastPostedCoordinate, nextCoordinate) >= DRIVER_LOCATION_POST_DISTANCE_MILES
  );
}

export function getFocusCoordinates({ currentLocation, selectedStop }) {
  const stopCoordinate = toCoordinate(selectedStop);

  if (!stopCoordinate) {
    return [];
  }

  const coordinates = [stopCoordinate];

  if (currentLocation?.coords) {
    const driverCoordinate = {
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude
    };

    if (getDistanceMiles(driverCoordinate, stopCoordinate) <= 20) {
      coordinates.unshift(driverCoordinate);
    }
  }

  return coordinates;
}

export function getMapRegion({ currentStop, currentLocation, mappableStops = [] }) {
  const stopCoordinate = toCoordinate(currentStop);

  if (stopCoordinate) {
    return {
      ...stopCoordinate,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035
    };
  }

  if (mappableStops.length) {
    const coordinates = mappableStops.map((stop) => toCoordinate(stop)).filter(Boolean);

    if (coordinates.length) {
      const latitudes = coordinates.map((coordinate) => coordinate.latitude);
      const longitudes = coordinates.map((coordinate) => coordinate.longitude);
      const minLatitude = Math.min(...latitudes);
      const maxLatitude = Math.max(...latitudes);
      const minLongitude = Math.min(...longitudes);
      const maxLongitude = Math.max(...longitudes);

      return {
        latitude: (minLatitude + maxLatitude) / 2,
        longitude: (minLongitude + maxLongitude) / 2,
        latitudeDelta: Math.max((maxLatitude - minLatitude) * 1.4, 0.04),
        longitudeDelta: Math.max((maxLongitude - minLongitude) * 1.4, 0.04)
      };
    }
  }

  if (currentLocation?.coords) {
    return {
      latitude: currentLocation.coords.latitude,
      longitude: currentLocation.coords.longitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05
    };
  }

  return {
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08
  };
}

export function formatTimeCommitLine(stop) {
  if (!stop?.has_time_commit) {
    return null;
  }

  if (stop?.ready_time && stop?.close_time) {
    return `TC: ${stop.ready_time}–${stop.close_time}`;
  }

  if (stop?.close_time) {
    return `TC closes ${stop.close_time}`;
  }

  if (stop?.ready_time) {
    return `TC ready ${stop.ready_time}`;
  }

  return null;
}

export function parseClockTime(value, now = new Date()) {
  if (!value || value === '00:00') {
    return null;
  }

  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const date = new Date(now);
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return date;
}

export function getTimeCommitUrgency(stop, now = new Date()) {
  if (!stop?.has_time_commit) {
    return null;
  }

  const closeAt = parseClockTime(stop?.close_time, now);

  if (!closeAt) {
    return null;
  }

  const minutesUntilClose = Math.round((closeAt.getTime() - now.getTime()) / 60000);

  if (minutesUntilClose < 0) {
    return {
      level: 'overdue',
      minutesUntilClose,
      label: `${Math.abs(minutesUntilClose)} min overdue`,
      shortLabel: 'Overdue'
    };
  }

  if (minutesUntilClose <= 30) {
    return {
      level: 'urgent',
      minutesUntilClose,
      label: `${minutesUntilClose} min left`,
      shortLabel: `${minutesUntilClose}m left`
    };
  }

  if (minutesUntilClose <= 60) {
    return {
      level: 'warning',
      minutesUntilClose,
      label: `${minutesUntilClose} min left`,
      shortLabel: `${minutesUntilClose}m left`
    };
  }

  return {
    level: 'normal',
    minutesUntilClose,
    label: `Closes in ${minutesUntilClose} min`,
    shortLabel: `${minutesUntilClose}m left`
  };
}

export function getStopStatusColors(status, isCurrentStop, stopType, stop, pinColorMode = 'sid') {
  if (isCurrentStop) {
    return { fill: '#1a2332', border: '#101826', text: '#ffffff' };
  }

  switch (status) {
    case 'delivered':
    case 'pickup_complete':
      return { fill: '#27ae60', border: '#1e8449', text: '#ffffff' };
    case 'attempted':
    case 'pickup_attempted':
      return { fill: '#f39c12', border: '#d68910', text: '#ffffff' };
    case 'incomplete':
      return { fill: '#e74c3c', border: '#cb4335', text: '#ffffff' };
    case 'pending':
    default:
      if (pinColorMode === 'sid') {
        const sidTheme = getSidBucketTheme(stop?.sid);

        if (sidTheme) {
          return { fill: '#ffffff', border: sidTheme.border, text: sidTheme.border };
        }
      }

      return { fill: '#ffffff', border: '#111111', text: '#111111' };
  }
}

export function getMapPinSize(stop, isCurrentStop = false, labelOverride = null) {
  const label = String(labelOverride || stop?.sequence_order || '');
  const hasLongStopNumber = label.length >= 3;

  if (isCurrentStop) {
    return hasLongStopNumber ? 38 : 34;
  }

  return hasLongStopNumber ? 34 : 28;
}

export function getStopType(stop) {
  if (stop?.stop_type === 'combined' || (stop?.has_delivery && stop?.has_pickup)) {
    return 'combined';
  }

  if (stop?.stop_type === 'pickup' || stop?.is_pickup || stop?.has_pickup) {
    return 'pickup';
  }

  return 'delivery';
}

export function getMapPinServiceBadgeLabel(stop) {
  const explicitlyHasPickup = Boolean(
    stop?.stop_type === 'pickup' ||
      stop?.stop_type === 'combined' ||
      stop?.has_pickup ||
      stop?.is_pickup
  );
  const explicitlyDeliveryOnly = Boolean(
    !explicitlyHasPickup &&
      (stop?.stop_type === 'delivery' || stop?.has_delivery === true)
  );

  if (explicitlyHasPickup) {
    return 'P';
  }

  if (stop?.has_time_commit && explicitlyDeliveryOnly) {
    return 'T';
  }

  return null;
}

export function isStopComplete(stop) {
  return Boolean(
    stop?.completed_at ||
      ['delivered', 'attempted', 'incomplete', 'pickup_complete', 'pickup_attempted'].includes(stop?.status)
  );
}

export function getStopStatusLabel(stop) {
  switch (stop?.status) {
    case 'delivered':
      return 'Delivered';
    case 'pickup_complete':
      return 'Picked up';
    case 'attempted':
      return 'Attempted';
    case 'pickup_attempted':
      return 'Pickup attempted';
    case 'incomplete':
      return 'Incomplete';
    default:
      return 'Pending';
  }
}

export function getStopTypeLabel(stop) {
  switch (getStopType(stop)) {
    case 'pickup':
      return 'Pickup';
    case 'combined':
      return 'Delivery + Pickup';
    default:
      return 'Delivery';
  }
}

export function getGroupProgressSummary(group) {
  const groupStops = group?.stops || [];
  const completedCount = groupStops.filter(isStopComplete).length;

  return {
    completedCount,
    totalCount: groupStops.length,
    label: `${completedCount} of ${groupStops.length} complete`
  };
}

export function getStopPackageCount(stop) {
  if (Array.isArray(stop?.packages)) {
    return stop.packages.length;
  }

  return Number(stop?.package_count || stop?.pkg_count || stop?.pickup_package_count || 0);
}

export function getBannerBadges(stop) {
  const badges = [];
  const stopType = getStopType(stop);

  if (stop?.is_business) {
    badges.push({ label: 'BUSINESS', type: 'business' });
  }

  if (stopType === 'pickup') {
    badges.push({ label: 'Pickup', type: 'pickup' });
  } else if (stopType === 'combined') {
    badges.push({ label: 'Delivery + Pickup', type: 'combined' });
  }

  if (stop?.has_time_commit && stop?.ready_time && stop?.close_time) {
    badges.push({ label: `TC: ${stop.ready_time}–${stop.close_time}`, type: 'timeCommit' });
  } else if (stop?.has_time_commit && stop?.close_time) {
    badges.push({ label: `TC closes ${stop.close_time}`, type: 'timeCommit' });
  } else if (stop?.has_time_commit && stop?.ready_time) {
    badges.push({ label: `TC ready ${stop.ready_time}`, type: 'timeCommit' });
  }

  if (stop?.has_note) {
    badges.push({ label: '• NOTE', type: 'note' });
  }

  return badges;
}

export function getVisibleBannerBadges(stop) {
  return getBannerBadges(stop).slice(0, 3);
}

function OpenBoxIcon({ color = '#6f7d87', size = 16 }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M12 9.5L7 12.5V19L12 21.5L17 19V12.5L12 9.5Z"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <Path
        d="M12 9.5L6.8 7.2L3.8 9.8L9 12M12 9.5L17.2 7.2L20.2 9.8L15 12"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <Path
        d="M9 12L12 9.5L15 12"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <Path d="M12 9.5V21.5" fill="none" stroke={color} strokeWidth={1.8} />
    </Svg>
  );
}

export function formatWarningFlag(flag) {
  switch (flag) {
    case 'dog':
      return 'Dog alert';
    case 'gate':
      return 'Gate';
    case 'stairs':
      return 'Stairs';
    case 'lobby':
      return 'Locked lobby';
    case 'reception':
      return 'Reception';
    case 'loading_dock':
      return 'Dock';
    case 'parking':
      return 'Parking';
    case 'elevator':
      return 'Elevator';
    default:
      return String(flag || '')
        .replace(/_/g, ' ')
        .replace(/\b([a-z])/g, (_match, letter) => letter.toUpperCase());
  }
}

export function getQuickIntel(stop) {
  const intel = [];
  const propertyIntel = stop?.property_intel;
  const apartmentIntel = stop?.apartment_intelligence;
  const displayLocationType = propertyIntel?.location_type || stop?.location_type;
  const groupedCount = Number(propertyIntel?.grouped_stop_count || propertyIntel?.grouped_stops?.length || 0);
  const warningFlags = propertyIntel?.warning_flags || [];
  const accessCode = String(propertyIntel?.access_code || '').trim();

  if (apartmentIntel?.floor != null) {
    intel.push({
      key: 'floor',
      label: apartmentIntel.verified ? `Floor ${apartmentIntel.floor} verified` : `Floor ${apartmentIntel.floor}`,
      tone: 'apartment'
    });
  } else if (stop?.floor_label) {
    intel.push({ key: 'floor-label', label: stop.floor_label, tone: 'building' });
  } else if (
    displayLocationType &&
    displayLocationType !== 'house' &&
    displayLocationType !== 'apartment' &&
    !(stop?.is_business && String(displayLocationType).toLowerCase() === 'business')
  ) {
    intel.push({ key: 'location-type', label: String(displayLocationType).toUpperCase(), tone: 'building' });
  }

  if (accessCode) {
    intel.push({ key: 'access-code', label: `CODE ${accessCode.toUpperCase()}`, tone: 'warning' });
  } else if (propertyIntel?.access_note) {
    intel.push({ key: 'access', label: 'Access note', tone: 'warning' });
  } else if (warningFlags[0]) {
    intel.push({ key: `flag-${warningFlags[0]}`, label: formatWarningFlag(warningFlags[0]), tone: 'warning' });
  }

  if (groupedCount > 1) {
    intel.push({ key: 'grouped', label: `${groupedCount} grouped stops`, tone: 'grouped' });
  }

  return intel.slice(0, 3);
}

export function getStopTools(stop) {
  const tools = [];

  if (!stop) {
    return tools;
  }

  if (stop.is_apartment_unit || stop.apartment_intelligence) {
    tools.push({
      key: 'floor',
      label: stop.apartment_intelligence?.verified ? 'Floor verified' : 'Confirm floor',
      tone: 'apartment'
    });
  }

  if (stop.location_correction) {
    tools.push({
      key: 'pin-saved',
      label: 'Saved pin active',
      tone: 'location'
    });
  } else {
    tools.push({
      key: 'pin',
      label: 'Save correct pin',
      tone: 'location'
    });
  }

  tools.push({
    key: 'note',
    label: stop.has_note ? 'Future note saved' : 'Add future note',
    tone: 'note'
  });

  return tools;
}

export function getCompactStopTools(stop) {
  return getStopTools(stop).slice(0, 2);
}

export function buildGoogleNavigationUrls(address) {
  const destination = encodeURIComponent(address || '');

  return {
    nativeGoogleMapsUrl: `comgooglemaps://?daddr=${destination}&directionsmode=driving`,
    webGoogleMapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`
  };
}

export function getTimeCommitCallout(stop) {
  if (!stop?.has_time_commit) {
    return null;
  }

  const stopType = getStopType(stop);
  const urgency = getTimeCommitUrgency(stop);

  if (stopType === 'pickup' && stop?.ready_time && stop?.close_time) {
    return {
      title: `Pickup window: ${stop.ready_time} — ${stop.close_time}`,
      subtitle: urgency ? urgency.label : `Business closes at ${stop.close_time}`
    };
  }

  if (stop?.ready_time && stop?.close_time) {
    return {
      title: `Deliver between ${stop.ready_time} and ${stop.close_time}`,
      subtitle: urgency?.level === 'normal' ? null : urgency?.label || null
    };
  }

  if (stop?.close_time) {
    return {
      title: `Complete before ${stop.close_time}`,
      subtitle: urgency?.label || null
    };
  }

  if (stop?.ready_time) {
    return {
      title: `Ready at ${stop.ready_time}`,
      subtitle: null
    };
  }

  return null;
}

function getUrgencyStyles(level) {
  switch (level) {
    case 'overdue':
      return {
        ringStyle: styles.markerRingOverdue,
        badgeStyle: styles.timeCommitBadgeOverdue,
        badgeTextStyle: styles.timeCommitBadgeTextLight,
        pillStyle: styles.bannerPill_overdue,
        pillTextStyle: styles.bannerPillText_overdue,
        calloutStyle: styles.calloutWindowOverdue,
        calloutTextStyle: styles.calloutWindowTextOverdue
      };
    case 'urgent':
      return {
        ringStyle: styles.markerRingUrgent,
        badgeStyle: styles.timeCommitBadgeUrgent,
        badgeTextStyle: styles.timeCommitBadgeTextLight,
        pillStyle: styles.bannerPill_urgent,
        pillTextStyle: styles.bannerPillText_urgent,
        calloutStyle: styles.calloutWindowUrgent,
        calloutTextStyle: styles.calloutWindowTextUrgent
      };
    case 'warning':
      return {
        ringStyle: styles.markerRingWarning,
        badgeStyle: styles.timeCommitBadgeWarning,
        badgeTextStyle: styles.timeCommitBadgeTextLight,
        pillStyle: styles.bannerPill_warning,
        pillTextStyle: styles.bannerPillText_warning,
        calloutStyle: styles.calloutWindowWarning,
        calloutTextStyle: styles.calloutWindowTextWarning
      };
    default:
      return {
        ringStyle: styles.markerRingActive,
        badgeStyle: styles.timeCommitBadge,
        badgeTextStyle: styles.timeCommitBadgeText,
        calloutStyle: null,
        calloutTextStyle: null
      };
  }
}

function getTimeCommitAlertBadge(stop, now = new Date()) {
  const urgency = getTimeCommitUrgency(stop, now);

  if (!urgency || urgency.level === 'normal') {
    return null;
  }

  return {
    label: urgency.label,
    type: urgency.level
  };
}

function getStopGroupKey(stop) {
  const normalizedAddress = String(stop?.property_intel?.normalized_address || '').trim();

  if (normalizedAddress) {
    return normalizedAddress.toLowerCase();
  }

  const primaryAddress = getStopPrimaryAddress(stop);
  const localityLine = getStopLocalityLine(stop);
  const fallbackAddress = `${primaryAddress}|${localityLine}`.trim();

  return fallbackAddress ? fallbackAddress.toLowerCase() : null;
}

function getStopPrimaryAddress(stop) {
  const fullAddress = String(stop?.address || '').trim();
  const secondary = String(stop?.address_line2 || '').trim();

  if (!fullAddress) {
    return '';
  }

  const parts = fullAddress.split(',').map((part) => part.trim()).filter(Boolean);

  if (secondary && parts.length > 1 && parts[1] === secondary) {
    return parts[0];
  }

  return parts[0] || fullAddress;
}

function getStopLocalityLine(stop) {
  const fullAddress = String(stop?.address || '').trim();
  const secondary = String(stop?.address_line2 || '').trim();

  if (!fullAddress) {
    return '';
  }

  const parts = fullAddress.split(',').map((part) => part.trim()).filter(Boolean);

  if (secondary && parts.length > 1 && parts[1] === secondary) {
    return parts.slice(2).join(', ');
  }

  return parts.slice(1).join(', ');
}

function getGroupedStopUnitLabel(stop) {
  const unitNumber = stop?.apartment_intelligence?.unit_number || stop?.property_intel?.unit;

  if (unitNumber) {
    return `Unit ${unitNumber}`;
  }

  if (stop?.address_line2) {
    return stop.address_line2;
  }

  return getStopPrimaryAddress(stop);
}

function hasDistinctLocationDetail(stop) {
  return Boolean(
    stop?.apartment_intelligence?.unit_number ||
      stop?.property_intel?.unit ||
      stop?.address_line2 ||
      stop?.is_apartment_unit ||
      stop?.apartment_intelligence
  );
}

function buildMapItems(stops) {
  const sortedStops = [...(stops || [])].sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));
  const addressBuckets = new Map();

  for (const stop of sortedStops) {
    const groupKey = getStopGroupKey(stop);

    if (!groupKey) {
      continue;
    }

    const bucket = addressBuckets.get(groupKey) || [];
    bucket.push(stop);
    addressBuckets.set(groupKey, bucket);
  }

  const groupedItems = new Map();
  const items = [];

  for (const stop of sortedStops) {
    const coordinate = toCoordinate(stop);

    if (!coordinate) {
      continue;
    }

    const groupKey = getStopGroupKey(stop);
    const stopsAtAddress = groupKey ? addressBuckets.get(groupKey) || [] : [];
    const shouldGroupAddress =
      stopsAtAddress.length > 1 &&
      (stopsAtAddress.some((item) => hasDistinctLocationDetail(item)) ||
        new Set(stopsAtAddress.map((item) => String(item?.address_line2 || item?.apartment_intelligence?.unit_number || item?.property_intel?.unit || '').trim().toLowerCase()).filter(Boolean)).size > 1);

    if (!groupKey || !shouldGroupAddress) {
      items.push({
        type: 'stop',
        id: `stop:${stop.id}`,
        coordinate,
        stop
      });
      continue;
    }

    let group = groupedItems.get(groupKey);

    if (!group) {
      group = {
        type: 'group',
        id: `group:${groupKey}`,
        groupKey,
        stops: [],
        coordinates: []
      };
      groupedItems.set(groupKey, group);
      items.push(group);
    }

    group.stops.push(stop);
    group.coordinates.push(coordinate);
  }

  return items.map((item) => {
    if (item.type !== 'group') {
      return item;
    }

    const stopsInGroup = [...item.stops].sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));
    const representativeStop = stopsInGroup.find((stop) => stop.status === 'pending') || stopsInGroup[0];
    const coordinates = item.coordinates.length ? item.coordinates : stopsInGroup.map((stop) => toCoordinate(stop)).filter(Boolean);
    const latitude = coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) / coordinates.length;
    const longitude = coordinates.reduce((sum, coordinate) => sum + coordinate.longitude, 0) / coordinates.length;

    return {
      type: 'group',
      id: item.id,
      groupKey: item.groupKey,
      coordinate: { latitude, longitude },
      stops: stopsInGroup,
      representativeStop,
      primaryAddress: getStopPrimaryAddress(representativeStop),
      localityLine: getStopLocalityLine(representativeStop),
      packageCount: stopsInGroup.reduce(
        (sum, stop) => sum + getStopPackageCount(stop),
        0
      ),
      label: '+',
      groupCount: stopsInGroup.length
    };
  });
}

function MapPin({ isCurrentStop, now, stop, labelOverride = null, groupCount = 0, pinColorMode = 'sid' }) {
  const stopType = getStopType(stop);
  const colors = getStopStatusColors(stop.status, isCurrentStop, stopType, stop, pinColorMode);
  const hasTimeCommit = Boolean(stop.has_time_commit);
  const isApartment = Boolean(stop.is_apartment_unit || stop.apartment_intelligence);
  const serviceBadgeLabel = getMapPinServiceBadgeLabel(stop);
  const mainLabel = labelOverride || String(stop.sequence_order);
  const hasLongStopNumber = String(mainLabel || '').length >= 3;
  const pinSize = getMapPinSize(stop, isCurrentStop, labelOverride);
  const ringSize = Math.max(pinSize + (isCurrentStop ? 10 : 8), isCurrentStop ? 44 : 36);
  const urgency = hasTimeCommit ? getTimeCommitUrgency(stop, now) : null;
  const urgencyStyles = getUrgencyStyles(urgency?.level);

  return (
    <View style={styles.markerWrap}>
      <View
        style={[
          styles.markerRing,
          hasTimeCommit && urgencyStyles.ringStyle,
          isCurrentStop && styles.currentMarkerRing,
          { height: ringSize, width: ringSize }
        ]}
      >
        <View
          style={[
            styles.markerCore,
            {
              backgroundColor: colors.fill,
              borderColor: colors.border,
              height: pinSize,
              width: pinSize,
              borderRadius: pinSize / 2
            },
            isCurrentStop && styles.currentMarkerCore
          ]}
        >
          <Text
            style={[
              styles.markerLabel,
              hasLongStopNumber && styles.markerLabelLarge,
              { color: colors.text },
              isCurrentStop && styles.currentMarkerLabel
            ]}
          >
            {mainLabel}
          </Text>

          {stop.is_business ? (
            <View style={styles.businessBadge}>
              <Text style={styles.businessBadgeText}>B</Text>
            </View>
          ) : null}

          {hasTimeCommit ? (
            <View style={[styles.timeCommitBadge, urgencyStyles.badgeStyle]}>
              <Text style={[styles.timeCommitBadgeText, urgencyStyles.badgeTextStyle]}>{serviceBadgeLabel || 'TC'}</Text>
            </View>
          ) : null}

          {isApartment ? (
            <View style={styles.apartmentBadge}>
              <Text style={styles.apartmentBadgeText}>A</Text>
            </View>
          ) : null}

          {serviceBadgeLabel && !hasTimeCommit ? (
            <View style={styles.pickupBadge}>
              <Text style={styles.pickupBadgeText}>{serviceBadgeLabel}</Text>
            </View>
          ) : null}

          {groupCount > 1 && !labelOverride ? (
            <View style={styles.groupCountBadge}>
              <Text style={styles.groupCountBadgeText}>{groupCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function DriverLocationMarker({ heading = 0 }) {
  return (
    <View style={styles.driverMarkerWrap}>
      <View style={styles.driverMarkerShadow}>
        <View style={styles.driverMarkerHalo} />
        <View style={[styles.driverMarkerArrow, { transform: [{ rotate: `${heading}deg` }] }]}>
          <View style={styles.driverMarkerArrowHead} />
          <View style={styles.driverMarkerArrowTail} />
        </View>
      </View>
    </View>
  );
}

function MapLegend({ expanded, onToggle }) {
  return (
    <View style={styles.legendContainer}>
      {expanded ? (
        <View style={styles.legendPanel}>
          <Text style={styles.legendTitle}>Map Key</Text>
          <View style={styles.legendTableHeader}>
            <Text style={styles.legendTableHeaderText}>Map</Text>
            <Text style={styles.legendTableHeaderText}>Stop Type</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPending]}><Text style={styles.legendDotText}>1</Text></View>
            <Text style={styles.legendRowText}>Pending delivery</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotDelivered]} />
            <Text style={styles.legendRowText}>Delivered</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotAttempted]} />
            <Text style={styles.legendRowText}>Attempted</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotIncomplete]} />
            <Text style={styles.legendRowText}>Incomplete</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPendingBusiness]}>
              <Text style={styles.legendDotText}>1</Text>
              <View style={styles.legendMiniBusiness}><Text style={styles.legendMiniText}>B</Text></View>
            </View>
            <Text style={styles.legendRowText}>Business stop</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPendingApartment]}>
              <Text style={styles.legendDotText}>1</Text>
              <View style={styles.legendMiniApartment}><Text style={styles.legendMiniText}>A</Text></View>
            </View>
            <Text style={styles.legendRowText}>Apartment / unit stop</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPending]}>
              <Text style={styles.legendDotText}>1</Text>
              <View style={styles.legendMiniPickup}><Text style={styles.legendMiniText}>P</Text></View>
            </View>
            <Text style={styles.legendRowText}>Pickup stop</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPending]}>
              <Text style={styles.legendDotText}>1</Text>
              <View style={styles.legendMiniTimeCommit}><Text style={styles.legendMiniText}>T</Text></View>
            </View>
            <Text style={styles.legendRowText}>Timed delivery</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPending]}>
              <Text style={styles.legendDotText}>1</Text>
              <View style={styles.legendMiniNote}><Text style={styles.legendMiniText}>✏</Text></View>
            </View>
            <Text style={styles.legendRowText}>Has delivery note</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPending]}>
              <Text style={styles.legendDotText}>1</Text>
              <View style={styles.legendMiniPickup}><Text style={styles.legendMiniText}>P</Text></View>
            </View>
            <Text style={styles.legendRowText}>Combined delivery + pickup</Text>
          </View>
        </View>
      ) : null}
      <Pressable onPress={onToggle} style={styles.legendButton}>
        <Text style={styles.legendButtonText}>?</Text>
      </Pressable>
    </View>
  );
}

export default function MyDriveScreen({ navigation, route: screenRoute }) {
  const mapRef = useRef(null);
  const lastFittedRouteIdRef = useRef(null);
  const activeBreakTimerRef = useRef(null);
  const markerRefreshTimerRef = useRef(null);
  const hasInitializedMarkerRefreshRef = useRef(false);
  const isMountedRef = useRef(true);
  const fullRouteHydrationVersionRef = useRef(0);
  const [route, setRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [clockedInAt, setClockedInAt] = useState(null);
  const [activeBreak, setActiveBreak] = useState(null);
  const [driverDay, setDriverDay] = useState({ status: 'unknown' });
  const [isLoading, setIsLoading] = useState(true);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUpdatingClock, setIsUpdatingClock] = useState(false);
  const [isUpdatingBreak, setIsUpdatingBreak] = useState(false);
  const [hasLocationAccess, setHasLocationAccess] = useState(false);
  const [isLocationPermissionBlocked, setIsLocationPermissionBlocked] = useState(false);
  const [isLocationPermissionDenied, setIsLocationPermissionDenied] = useState(false);
  const [isResolvingLocationPermission, setIsResolvingLocationPermission] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [selectedMapItemId, setSelectedMapItemId] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [loadError, setLoadError] = useState(null);
  const [markersNeedRefresh, setMarkersNeedRefresh] = useState(true);
  const [markerRefreshVersion, setMarkerRefreshVersion] = useState(1);
  const [pinColorMode, setPinColorMode] = useState('sid');

  const mappableStops = useMemo(() => getMappableStops(stops), [stops]);
  const mapItems = useMemo(() => buildMapItems(mappableStops), [mappableStops]);
  const selectedMapItem = useMemo(
    () => mapItems.find((item) => item.id === selectedMapItemId) || null,
    [mapItems, selectedMapItemId]
  );
  const selectedStop = useMemo(
    () => (selectedMapItem?.type === 'stop' ? selectedMapItem.stop : null),
    [selectedMapItem]
  );
  const selectedStopGroup = useMemo(
    () => (selectedMapItem?.type === 'group' ? selectedMapItem : null),
    [selectedMapItem]
  );
  const stopsPerHourLabel = getStopsPerHourLabel(route?.stops_per_hour);
  const postDispatchNotice = getPostDispatchChangeNotice(route);
  const deliveredStopCount = useMemo(
    () => stops.filter((stop) => stop.status === 'delivered' || stop.status === 'pickup_complete').length,
    [stops]
  );
  const totalStopCount = route?.total_stops || stops.length || 0;
  const completionSummaryLabel = `${deliveredStopCount}/${totalStopCount}`;
  const selectedStopBadges = getVisibleBannerBadges(selectedStop);
  const selectedTimeCommitAlertBadge = useMemo(() => getTimeCommitAlertBadge(selectedStop, currentTime), [currentTime, selectedStop]);
  const selectedQuickIntel = getQuickIntel(selectedStop);
  const selectedTimeCommitCallout = getTimeCommitCallout(selectedStop);
  const selectedTimeCommitUrgency = getTimeCommitUrgency(selectedStop, currentTime);
  const selectedUrgencyStyles = getUrgencyStyles(selectedTimeCommitUrgency?.level);
  const selectedPackageCount = getStopPackageCount(selectedStop);
  const selectedExceptionCode = formatFedExExceptionCode(selectedStop?.exception_code);
  const selectedScanTime = formatStopScanTime(selectedStop?.scanned_at || selectedStop?.completed_at);
  const selectedGroupPackageCount = selectedStopGroup?.packageCount || 0;
  const selectedGroupProgress = getGroupProgressSummary(selectedStopGroup);
  const selectedGroupAllComplete =
    selectedGroupProgress.totalCount > 0 && selectedGroupProgress.completedCount >= selectedGroupProgress.totalCount;
  const driverHeading = getDriverHeading(currentLocation);
  const locationRequirementCopy = getLocationRequirementCopy();
  const locationPermissionDenied = isLocationPermissionBlocked || isLocationPermissionDenied;
  const locationButtonLabel = locationPermissionDenied ? 'Open Settings' : 'Enable Location';
  const breakButtonLabel = activeBreak ? `End ${formatBreakLabel(activeBreak.break_type)}` : 'Break';
  const initialRegion = useMemo(
    () => getMapRegion({ currentStop: selectedStop || selectedStopGroup?.representativeStop || null, currentLocation, mappableStops }),
    [currentLocation, mappableStops, selectedStop, selectedStopGroup]
  );

  useEffect(() => () => {
    isMountedRef.current = false;
    fullRouteHydrationVersionRef.current += 1;
  }, []);

  function applyRoutePayload(payload = {}) {
    const nextRoute = payload?.route || null;

    setRoute(nextRoute);
    setDriverDay(
      payload?.driver_day || {
        status: nextRoute ? 'dispatched' : 'unassigned'
      }
    );
    setStops(nextRoute?.stops || []);
    setLoadError(null);
  }

  useEffect(() => {
    const incomingSelectedStopId = screenRoute?.params?.selectedStopId;

    if (incomingSelectedStopId) {
      const matchingItem = mapItems.find((item) =>
        item.type === 'group'
          ? item.stops.some((stop) => stop.id === incomingSelectedStopId)
          : item.stop.id === incomingSelectedStopId
      );
      setSelectedMapItemId(matchingItem ? matchingItem.id : `stop:${incomingSelectedStopId}`);
      navigation.setParams({ selectedStopId: undefined });
    }
  }, [mapItems, navigation, screenRoute?.params?.selectedStopId]);

  useLayoutEffect(() => {
    if (!navigation) {
      return;
    }

    navigation.setOptions({
      headerTitle: '',
      headerTransparent: true,
      headerLeft: () => (
        <Pressable onPress={() => navigation.goBack()} style={[styles.headerButton, styles.headerButtonSurface]}>
          <Text style={styles.headerButtonText}>My Drive</Text>
        </Pressable>
      ),
      headerRight: () => (
        <Pressable
          onPress={() =>
            selectedStopGroup
              ? handleOpenGroupedStops(selectedStopGroup)
              : navigation.navigate('Manifest', { selectedStopId: selectedStop?.id || null })
          }
          style={[styles.headerButton, styles.headerButtonSurface]}
        >
          <Text style={styles.headerButtonText}>List</Text>
        </Pressable>
      )
    });
  }, [navigation, selectedStop?.id, selectedStopGroup]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPinColorPreference() {
      const storedMode = await getPinColorMode().catch(() => null);

      if (isMounted && (storedMode === 'sid' || storedMode === 'black')) {
        setPinColorMode(storedMode);
      }
    }

    loadPinColorPreference();
    const unsubscribe = navigation.addListener?.('focus', loadPinColorPreference);

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, [navigation]);

  useEffect(() => {
    return subscribePinColorMode((nextMode) => {
      if (nextMode === 'sid' || nextMode === 'black') {
        setPinColorMode(nextMode);
      }
    });
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test') {
      return undefined;
    }

    if (hasInitializedMarkerRefreshRef.current) {
      setMarkersNeedRefresh(true);
      setMarkerRefreshVersion((current) => current + 1);
    } else {
      hasInitializedMarkerRefreshRef.current = true;
    }

    if (markerRefreshTimerRef.current) {
      clearTimeout(markerRefreshTimerRef.current);
    }

    markerRefreshTimerRef.current = setTimeout(() => {
      setMarkersNeedRefresh(false);
      markerRefreshTimerRef.current = null;
    }, 250);

    return () => {
      if (markerRefreshTimerRef.current) {
        clearTimeout(markerRefreshTimerRef.current);
        markerRefreshTimerRef.current = null;
      }
    };
  }, [pinColorMode, selectedMapItemId, stops]);

  useEffect(() => {
    const autoEndAt = getBreakAutoEndTimestamp(activeBreak);

    if (activeBreakTimerRef.current) {
      clearTimeout(activeBreakTimerRef.current);
      activeBreakTimerRef.current = null;
    }

    if (!autoEndAt) {
      return undefined;
    }

    const remainingMs = new Date(autoEndAt).getTime() - Date.now();

    if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
      refreshRoute({ allowStateUpdate: true, hydrateDetails: false, showAlert: false });
      return undefined;
    }

    activeBreakTimerRef.current = setTimeout(() => {
      refreshRoute({ allowStateUpdate: true, hydrateDetails: false, showAlert: false });
    }, remainingMs + 250);

    return () => {
      if (activeBreakTimerRef.current) {
        clearTimeout(activeBreakTimerRef.current);
        activeBreakTimerRef.current = null;
      }
    };
  }, [activeBreak]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      const cachedDriveRoute = await getCachedDriverDriveRoute().catch(() => null);

      if (isMounted && cachedDriveRoute?.route) {
        applyRoutePayload(cachedDriveRoute);
        setIsLoading(false);
      }

      try {
        const permissionState = await getAlwaysLocationPermission();
        const currentPermission = permissionState.background || permissionState.foreground;
        const granted = permissionState.granted;

        if (isMounted) {
          setHasLocationAccess(granted);
          setIsLocationPermissionBlocked(isBlockedLocationPermission(currentPermission));
          setIsLocationPermissionDenied(!granted && isDeniedLocationPermission(currentPermission));
        }

        if (!granted) {
          return;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: getDriverLocationAccuracy()
        });

        if (isMounted) {
          setCurrentLocation(position);
        }
      } catch (_error) {
        if (isMounted) {
          setHasLocationAccess(false);
          setIsLocationPermissionBlocked(false);
          setIsLocationPermissionDenied(false);
        }
      }

      try {
        await refreshRoute({ allowStateUpdate: isMounted, hydrateDetails: true });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!route?.id) {
      return undefined;
    }

    if (route.status === 'complete' || route.status === 'completed') {
      Promise.resolve(stopDriverLocationTracking()).catch(() => {});
      return undefined;
    }

    const rateInterval = setInterval(() => {
      refreshRoute({ allowStateUpdate: true, hydrateDetails: false, showAlert: false });
    }, 60000);

    let isActive = true;
    let locationSubscription = null;

    async function startLocationWatch() {
      try {
        const permissionState = await getAlwaysLocationPermission();
        const currentPermission = permissionState.background || permissionState.foreground;

        if (!isActive) {
          return;
        }

        if (!permissionState.granted) {
          setHasLocationAccess(false);
          setIsLocationPermissionBlocked(isBlockedLocationPermission(currentPermission));
          setIsLocationPermissionDenied(isDeniedLocationPermission(currentPermission));
          return;
        }

        setHasLocationAccess(true);
        setIsLocationPermissionBlocked(false);
        setIsLocationPermissionDenied(false);

        await startDriverLocationTracking(route.id);

        const initialPosition = await Location.getCurrentPositionAsync({
          accuracy: getDriverLocationAccuracy()
        });

        if (!isActive) {
          return;
        }

        await handleDriverLocationUpdate(initialPosition, { forcePost: true });

        const subscription = await Location.watchPositionAsync(getDriverLocationWatchOptions(), (position) => {
          handleDriverLocationUpdate(position);
        });

        if (!isActive) {
          subscription?.remove?.();
          return;
        }

        locationSubscription = subscription;
      } catch (_error) {
        if (isActive) {
          setHasLocationAccess(false);
        }
      }
    }

    startLocationWatch();

    return () => {
      isActive = false;
      locationSubscription?.remove?.();
      clearInterval(rateInterval);
    };
  }, [route?.id, route?.status]);

  useEffect(() => {
    if (route?.status === 'complete' || route?.status === 'completed') {
      Promise.resolve(stopDriverLocationTracking()).catch(() => {});
    }
  }, [route?.status]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !route?.id || !mappableStops.length || selectedMapItem) {
      return;
    }

    if (lastFittedRouteIdRef.current === route.id) {
      return;
    }

    const coordinates = mappableStops.map((stop) => toCoordinate(stop)).filter(Boolean);

    if (!coordinates.length) {
      return;
    }

    map.fitToCoordinates(coordinates, {
      animated: false,
      edgePadding: {
        top: 110,
        right: 40,
        bottom: 220,
        left: 40
      }
    });

    lastFittedRouteIdRef.current = route.id;
  }, [mappableStops, route?.id, selectedMapItem]);

  async function hydrateFullRoute({ routeId, hydrationVersion }) {
    try {
      const routeResponse = await api.get('/routes/today');
      const fullRoute = routeResponse.data?.route || null;

      if (
        !isMountedRef.current ||
        hydrationVersion !== fullRouteHydrationVersionRef.current ||
        (routeId && fullRoute?.id && fullRoute.id !== routeId)
      ) {
        return;
      }

      setRoute(fullRoute);
      setDriverDay(
        routeResponse.data?.driver_day || {
          status: fullRoute ? 'dispatched' : 'unassigned'
        }
      );
      setStops(fullRoute?.stops || []);
    } catch (_error) {
      // The fast drive payload is already on screen; keep this hydration silent.
    }
  }

  async function refreshRoute({ allowStateUpdate = true, hydrateDetails = true, showAlert = true, isRetry = false } = {}) {
    if (allowStateUpdate && isRetry) {
      setIsRetryingLoad(true);
    }

    try {
      const hydrationVersion = fullRouteHydrationVersionRef.current + 1;
      fullRouteHydrationVersionRef.current = hydrationVersion;
      const [routeResponse, timecardStatusResponse] = await Promise.all([
        fetchDriverDriveRoute(),
        api.get('/timecards/status')
      ]);
      const nextRoute = routeResponse?.route || null;
      const activeBreakState = timecardStatusResponse.data?.active_break || null;
      const serverClockInAt =
        timecardStatusResponse.data?.active_timecard?.clock_in || timecardStatusResponse.data?.clock_in_at || null;

      if (!allowStateUpdate) {
        return;
      }

      applyRoutePayload(routeResponse);
      setClockedInAt(serverClockInAt);
      setActiveBreak(activeBreakState);

      if (serverClockInAt) {
        Promise.resolve(saveClockInTime(serverClockInAt)).catch(() => {});
      } else {
        Promise.resolve(removeClockInTime()).catch(() => {});
      }

      if (hydrateDetails && nextRoute?.id && process.env.NODE_ENV !== 'test') {
        Promise.resolve(hydrateFullRoute({ routeId: nextRoute.id, hydrationVersion })).catch(() => {});
      }
    } catch (error) {
      if (allowStateUpdate) {
        const message = getApiErrorMessage(error, 'Unable to load route details.');
        setLoadError(message);
        if (showAlert) {
          Alert.alert('Route unavailable', message);
        }
      }
    } finally {
      if (allowStateUpdate) {
        setIsRetryingLoad(false);
      }
    }
  }

  async function handleRetryLoad() {
    await refreshRoute({ allowStateUpdate: true, showAlert: false, isRetry: true });
  }

  async function handleDriverLocationUpdate(position, { forcePost = false } = {}) {
    if (position?.coords) {
      setCurrentLocation(position);
    }

    if (!route?.id) {
      return;
    }

    try {
      await postDriverLocation(route.id, position, { force: forcePost });
    } catch (_error) {
      // Keep the driver flow resilient and retry later.
    }
  }

  async function handleEnableLocation() {
    if (locationPermissionDenied) {
      Linking.openSettings?.().catch(() => {});
      return;
    }

    setIsResolvingLocationPermission(true);

    try {
      const permissionState = await requestAlwaysLocationPermission();
      const permission = permissionState.background || permissionState.foreground;
      const granted = permissionState.granted;

      setHasLocationAccess(granted);
      setIsLocationPermissionBlocked(isBlockedLocationPermission(permission));
      setIsLocationPermissionDenied(!granted && isDeniedLocationPermission(permission));

      if (!granted) {
        return;
      }

      await startDriverLocationTracking(route?.id);

      const position = await Location.getCurrentPositionAsync({
        accuracy: getDriverLocationAccuracy()
      });
      setCurrentLocation(position);
      await handleDriverLocationUpdate(position, { forcePost: true });
    } catch (_error) {
      setHasLocationAccess(false);
      setIsLocationPermissionDenied(false);
    } finally {
      setIsResolvingLocationPermission(false);
    }
  }

  async function handleClockToggle() {
    if (!route && !clockedInAt) {
      Alert.alert('No route assigned', 'You need a route assigned today before clocking in.');
      return;
    }

    setIsUpdatingClock(true);

    try {
      if (clockedInAt) {
        await api.post('/timecards/clock-out');
        await removeClockInTime();
        setClockedInAt(null);
        setActiveBreak(null);
      } else {
        const response = await api.post('/timecards/clock-in', {
          route_id: route?.id
        });
        const timestamp = response.data?.clock_in_at || new Date().toISOString();
        await saveClockInTime(timestamp);
        setClockedInAt(timestamp);
      }
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to update clock status right now.');
      Alert.alert('Clock update failed', message);
    } finally {
      setIsUpdatingClock(false);
    }
  }

  function handleBreakToggle() {
    if (!clockedInAt) {
      Alert.alert('Clock in first', 'Drivers need to clock in before starting a break or lunch.');
      return;
    }

    if (activeBreak) {
      endActiveBreak();
      return;
    }

    Alert.alert('Start break', 'Choose the type of break you are taking.', [
      {
        text: 'Break',
        onPress: () => startBreak('rest')
      },
      {
        text: 'Lunch',
        onPress: () => startBreak('lunch')
      },
      {
        text: 'Cancel',
        style: 'cancel'
      }
    ]);
  }

  async function startBreak(breakType) {
    setIsUpdatingBreak(true);

    try {
      const response = await api.post('/timecards/breaks/start', {
        break_type: breakType
      });
      setActiveBreak(response.data?.active_break || null);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to start break right now.');
      Alert.alert('Break update failed', message);
    } finally {
      setIsUpdatingBreak(false);
    }
  }

  async function endActiveBreak() {
    setIsUpdatingBreak(true);

    try {
      await api.post('/timecards/breaks/end');
      setActiveBreak(null);
    } catch (error) {
      const message = getApiErrorMessage(error, 'Unable to end break right now.');
      Alert.alert('Break update failed', message);
    } finally {
      setIsUpdatingBreak(false);
    }
  }

  async function handleOpenNavigationForStop(stop) {
    if (!stop?.address) {
      return;
    }

    const { nativeGoogleMapsUrl, webGoogleMapsUrl } = buildGoogleNavigationUrls(stop.address);

    try {
      const canOpenNative = await Linking.canOpenURL(nativeGoogleMapsUrl);
      await Linking.openURL(canOpenNative ? nativeGoogleMapsUrl : webGoogleMapsUrl);
    } catch (_error) {
      Alert.alert('Navigation unavailable', 'Unable to open Google Maps right now.');
    }
  }

  async function handleSaveGroupPin(group) {
    const representativeStop = group?.representativeStop || group?.stops?.[0];

    if (!representativeStop?.id) {
      return;
    }

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!hasGrantedLocationPermission(permission)) {
        Alert.alert('Location needed', 'Allow location access to save the corrected pin for this address.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: getDriverLocationAccuracy()
      });
      await api.patch(`/routes/stops/${representativeStop.id}/correct-location`, {
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        label: 'Driver verified grouped address pin'
      });
      setCurrentLocation(location);
      await refreshRoute({ allowStateUpdate: true, showAlert: false });
      Alert.alert('Pin saved', 'This corrected pin was saved for this address.');
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to save this pin right now.';
      Alert.alert('Save failed', message);
    }
  }

  async function handleFlagGroupRoad(group) {
    const representativeStop = group?.representativeStop || group?.stops?.[0];
    const stopCoordinate = toCoordinate(representativeStop);

    if (!representativeStop?.id || !stopCoordinate) {
      Alert.alert('Stop pin unavailable', 'This grouped address does not have a usable pin yet.');
      return;
    }

    try {
      const permission = await Location.requestForegroundPermissionsAsync();

      if (!hasGrantedLocationPermission(permission)) {
        Alert.alert('Location needed', 'Allow location access to flag the road from your current position.');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: getDriverLocationAccuracy()
      });
      await api.post(`/routes/stops/${representativeStop.id}/flag-road`, {
        lat_start: location.coords.latitude,
        lng_start: location.coords.longitude,
        lat_end: stopCoordinate.latitude,
        lng_end: stopCoordinate.longitude,
        flag_type: 'problem',
        notes: 'Road flagged from grouped address view'
      });
      setCurrentLocation(location);
      Alert.alert('Road flagged', 'Your route team will see this address-level issue.');
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to flag this road right now.';
      Alert.alert('Flag failed', message);
    }
  }

  function handleOpenStopDetail(stopId) {
    if (!navigation || !stopId) {
      return;
    }

    navigation.navigate('StopDetail', { stopId });
  }

  function handleOpenGroupedStops(group) {
    if (!navigation || !group?.stops?.length) {
      return;
    }

    navigation.navigate('Manifest', {
      groupAddress: group.primaryAddress,
      groupStopIds: group.stops.map((stop) => stop.id),
      selectedStopId: group.stops[0]?.id || null
    });
  }

  function handleSelectMapItem(itemId) {
    setSelectedMapItemId((current) => (current === itemId ? null : itemId));
  }

  function handleCenterOnDriver() {
    const map = mapRef.current;

    if (!map || !currentLocation?.coords) {
      return;
    }

    map.animateCamera(
      {
        center: {
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude
        },
        zoom: 17
      },
      { duration: 500 }
    );
  }

  function handleRecenter() {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (!selectedMapItem) {
      const coordinates = [];

      if (currentLocation?.coords) {
        coordinates.push({
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude
        });
      }

      coordinates.push(...mappableStops.map((stop) => toCoordinate(stop)).filter(Boolean));

      if (coordinates.length > 1) {
        map.fitToCoordinates(coordinates, {
          animated: true,
          edgePadding: {
            top: 120,
            right: 40,
            bottom: 120,
            left: 40
          }
        });
      }

      return;
    }

    if (selectedStopGroup) {
      const coordinates = selectedStopGroup.stops.map((stop) => toCoordinate(stop)).filter(Boolean);

      if (!coordinates.length) {
        return;
      }

      map.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: {
          top: 140,
          right: 40,
          bottom: 220,
          left: 40
        }
      });
      return;
    }

    const currentStopCoordinate = toCoordinate(selectedStop);

    if (!currentStopCoordinate || !selectedStop) {
      return;
    }

    const coordinates = getFocusCoordinates({ currentLocation, selectedStop });

    if (coordinates.length > 1) {
      map.fitToCoordinates(coordinates, {
        animated: true,
        edgePadding: {
          top: 220,
          right: 40,
          bottom: 180,
          left: 40
        }
      });
      return;
    }

    map.animateToRegion(
      {
        ...currentStopCoordinate,
        latitudeDelta: 0.035,
        longitudeDelta: 0.035
      },
      500
    );
  }

  function updateCompletedStopState(stopId, updates) {
    setStops((previousStops) =>
      previousStops.map((stop) =>
        stop.id === stopId
          ? {
              ...stop,
              ...updates
            }
          : stop
      )
    );
  }

  function incrementRouteCompletedStops() {
    setRoute((previousRoute) =>
      previousRoute
        ? {
            ...previousRoute,
            completed_stops: Number(previousRoute.completed_stops || 0) + 1
          }
        : previousRoute
    );
  }

  async function completeIndividualStop(stopToComplete, extraPayload = {}) {
    if (!stopToComplete || isSubmitting) {
      return;
    }

    const stopId = stopToComplete.id;
    const nextStatus = extraPayload.status || (getStopType(stopToComplete) === 'pickup' ? 'pickup_complete' : 'delivered');
    const wasComplete = isStopComplete(stopToComplete);

    setIsSubmitting(true);

    try {
      await api.patch(`/routes/stops/${stopId}/complete`, {
        ...extraPayload,
        status: nextStatus
      });

      updateCompletedStopState(stopId, {
        status: nextStatus,
        completed_at: new Date().toISOString(),
        delivery_type_code: extraPayload.delivery_type_code !== undefined ? extraPayload.delivery_type_code : stopToComplete.delivery_type_code,
        exception_code: extraPayload.exception_code !== undefined ? extraPayload.exception_code : stopToComplete.exception_code
      });

      if (!wasComplete) {
        incrementRouteCompletedStops();
      }

      await refreshRoute({ allowStateUpdate: true, showAlert: true });
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to complete this stop right now.';
      Alert.alert('Stop update failed', message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompleteStop() {
    await completeIndividualStop(selectedStop);
    setSelectedMapItemId(null);
  }

  function promptForStopCode(stopToCode, codeType) {
    if (!stopToCode || isSubmitting) {
      return;
    }

    const isException = codeType === 'exception';
    const title = isException ? 'Add exception code' : 'Add delivery code';
    const message = isException
      ? 'Enter the exception code for this stop only.'
      : 'Enter the delivery code for this stop only.';
    const submitLabel = isException ? 'Save exception' : 'Save delivery code';

    if (typeof Alert.prompt === 'function') {
      Alert.prompt(
        title,
        message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: submitLabel,
            onPress: (value) => handleApplyStopCode(stopToCode, codeType, value)
          }
        ],
        'plain-text'
      );
      return;
    }

    Alert.alert(title, 'Open stop details to add this code on devices that do not support inline code entry.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open details', onPress: () => handleOpenStopDetail(stopToCode.id) }
    ]);
  }

  function handleAddGroupedStopCode(stopToCode) {
    if (!stopToCode || isSubmitting) {
      return;
    }

    Alert.alert('Add code', 'Apply a code to this stop only.', [
      {
        text: 'Delivery code',
        onPress: () => promptForStopCode(stopToCode, 'delivery')
      },
      {
        text: 'Exception code',
        onPress: () => promptForStopCode(stopToCode, 'exception')
      },
      {
        text: 'Cancel',
        style: 'cancel'
      }
    ]);
  }

  async function handleApplyStopCode(stopToCode, codeType, rawCode) {
    const code = String(rawCode || '').trim();

    if (!code) {
      Alert.alert('Code required', 'Enter a code before saving.');
      return;
    }

    if (codeType === 'exception') {
      await completeIndividualStop(stopToCode, {
        status: getStopType(stopToCode) === 'pickup' ? 'pickup_attempted' : 'attempted',
        exception_code: code
      });
      return;
    }

    await completeIndividualStop(stopToCode, {
      status: getStopType(stopToCode) === 'pickup' ? 'pickup_complete' : 'delivered',
      delivery_type_code: code,
      exception_code: null
    });
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <ActivityIndicator color="#FF6200" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !route) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.emptyTitle}>Route unavailable</Text>
          <Text style={styles.emptyText}>{loadError}</Text>
          <Pressable
            disabled={isRetryingLoad}
            onPress={handleRetryLoad}
            style={[styles.retryButton, isRetryingLoad ? styles.buttonDisabled : null]}
          >
            {isRetryingLoad ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.retryButtonText}>Retry</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!route) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.emptyTitle}>
            {driverDay?.status === 'awaiting_dispatch' ? 'Route staged for dispatch' : 'No active stop right now'}
          </Text>
          <Text style={styles.emptyText}>
            {driverDay?.status === 'awaiting_dispatch'
              ? 'Your route is staged in ReadyRoute and will appear here as soon as your lead manager dispatches the day.'
              : 'Your route is either complete or still waiting to be assigned.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        {postDispatchNotice || !hasLocationAccess ? (
          <View pointerEvents="box-none" style={styles.topOverlay}>
            {!hasLocationAccess ? (
              <View style={styles.locationNoticeCard}>
                <Text style={styles.locationNoticeTitle}>{locationRequirementCopy.title}</Text>
                <Text style={styles.locationNoticeBody}>{locationRequirementCopy.body}</Text>
                <View style={styles.locationNoticeBullets}>
                  {locationRequirementCopy.bullets.map((bullet) => (
                    <View key={bullet} style={styles.locationNoticeBulletRow}>
                      <Text style={styles.locationNoticeBulletDot}>•</Text>
                      <Text style={styles.locationNoticeBulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.locationNoticeSecondary}>
                  {locationPermissionDenied ? locationRequirementCopy.blocked : locationRequirementCopy.secondary}
                </Text>
                <Pressable
                  disabled={isResolvingLocationPermission}
                  onPress={handleEnableLocation}
                  style={[styles.locationNoticeButton, isResolvingLocationPermission ? styles.buttonDisabled : null]}
                >
                  {isResolvingLocationPermission ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.locationNoticeButtonText}>{locationButtonLabel}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}
            {postDispatchNotice ? (
              <View style={styles.dispatchNoticeCard}>
                <Text style={styles.dispatchNoticeTitle}>{postDispatchNotice.title}</Text>
                <Text style={styles.dispatchNoticeBody}>{postDispatchNotice.body}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <MapView
          // Let the driver use the map like a normal phone map.
          initialRegion={initialRegion}
          provider={shouldUseGoogleProvider ? PROVIDER_GOOGLE : undefined}
          ref={mapRef}
          rotateEnabled
          scrollEnabled
          zoomEnabled
          style={styles.map}
        >
          {currentLocation?.coords ? (
            <Marker
              coordinate={{
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude
              }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              title="Current location"
              tracksViewChanges={false}
            >
              <DriverLocationMarker heading={driverHeading} />
            </Marker>
          ) : null}

          {mapItems.map((item) => {
            const stop = item.type === 'group' ? item.representativeStop : item.stop;
            const coordinate = item.coordinate;
            const isCurrentStop = selectedMapItem?.id === item.id;
            const markerKey = getMarkerRenderKey({
              itemId: item.id,
              isCurrentStop,
              refreshVersion: markerRefreshVersion
            });

            return (
              <Marker
                anchor={{ x: 0.5, y: 0.5 }}
                coordinate={coordinate}
                key={markerKey}
                onPress={() => handleSelectMapItem(item.id)}
                testID={`stop-marker-${item.id}`}
                tracksViewChanges={markersNeedRefresh || isCurrentStop}
                zIndex={isCurrentStop ? 1000 : item.type === 'group' ? 500 : 1}
              >
                <MapPin
                  groupCount={item.type === 'group' ? item.groupCount : 0}
                  isCurrentStop={isCurrentStop}
                  labelOverride={item.type === 'group' ? item.label : null}
                  now={currentTime}
                  pinColorMode={pinColorMode}
                  stop={stop}
                />
              </Marker>
            );
          })}
        </MapView>

        <MapLegend expanded={legendExpanded} onToggle={() => setLegendExpanded((current) => !current)} />

        <View style={styles.mapControlStack}>
          {currentLocation?.coords ? (
            <Pressable
              accessibilityLabel="Center on my location"
              onPress={handleCenterOnDriver}
              style={styles.mapControlButton}
            >
              <Text style={styles.mapControlButtonText}>Me</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={handleRecenter} style={styles.mapControlButton}>
            <Text style={styles.mapControlButtonText}>Center</Text>
          </Pressable>
          {selectedStop ? (
            <Pressable onPress={() => handleOpenStopDetail(selectedStop.id)} style={styles.mapControlButton}>
              <Text style={styles.mapControlButtonText}>Intel</Text>
            </Pressable>
          ) : null}
        </View>

        <View pointerEvents="box-none" style={styles.bottomOverlay}>
	          {selectedStopGroup ? (
	            <View style={[styles.selectedStopCard, selectedGroupAllComplete ? styles.groupedCardComplete : null]}>
	              <View style={styles.calloutHeaderRow}>
	                <View style={styles.groupedCardHeading}>
	                  <Text style={styles.groupedCardTitle}>{selectedStopGroup.primaryAddress}</Text>
	                  {selectedStopGroup.localityLine ? (
	                    <Text style={styles.groupedCardSubtitle}>{selectedStopGroup.localityLine}</Text>
	                  ) : null}
	                  <Text style={styles.groupedCardHelperText}>Same address, separate stops</Text>
	                </View>
	                <View style={styles.groupedCardActions}>
	                  <Pressable
	                    accessibilityLabel="Close selected stop"
	                    onPress={() => setSelectedMapItemId(null)}
                    style={styles.calloutCloseButton}
                    testID="selected-stop-close-button"
                  >
	                    <Text style={styles.calloutCloseButtonText}>×</Text>
	                  </Pressable>
	                </View>
	              </View>
	              <View style={styles.groupedCardSummaryRow}>
	                <View style={styles.groupedCardCountPill}>
	                  <Text style={styles.groupedCardCountPillText}>{selectedStopGroup.stops.length} stops at this address</Text>
	                </View>
	                <View style={[styles.groupedCardProgressPill, selectedGroupAllComplete ? styles.groupedCardProgressPillDone : null]}>
	                  <Text style={styles.groupedCardProgressText}>{selectedGroupProgress.label}</Text>
	                </View>
	                <View style={styles.groupedCardPackagePill}>
	                  <OpenBoxIcon color={appTheme.colors.orangeDeep} size={16} />
	                  <Text style={styles.groupedCardPackageText}>{`Total packages: ${selectedGroupPackageCount}`}</Text>
	                </View>
	              </View>
	              <View style={styles.groupedSharedActions}>
	                <Pressable onPress={() => handleOpenNavigationForStop(selectedStopGroup.representativeStop)} style={styles.groupedSharedActionButton}>
	                  <Text style={styles.groupedSharedActionButtonText}>Navigate</Text>
	                </Pressable>
	                <Pressable onPress={() => handleSaveGroupPin(selectedStopGroup)} style={styles.groupedSharedActionButton}>
	                  <Text style={styles.groupedSharedActionButtonText}>Save pin</Text>
	                </Pressable>
	                <Pressable onPress={() => handleFlagGroupRoad(selectedStopGroup)} style={styles.groupedSharedActionButton}>
	                  <Text style={styles.groupedSharedActionButtonText}>Flag road</Text>
	                </Pressable>
	                <Pressable onPress={() => handleOpenStopDetail(selectedStopGroup.representativeStop?.id)} style={styles.groupedSharedActionButton}>
	                  <Text style={styles.groupedSharedActionButtonText}>Delivery intel</Text>
	                </Pressable>
	              </View>
	              <View style={styles.groupedStopActionList}>
	                {selectedStopGroup.stops.map((groupedStop) => {
                  const groupedStopPackages = getStopPackageCount(groupedStop);
                  const groupedStopDeliveryCode = groupedStop.delivery_type_code
                    ? `Delivery ${groupedStop.delivery_type_code}`
                    : null;
                  const groupedStopExceptionCode = formatFedExExceptionCode(groupedStop.exception_code);
                  const groupedStopStatus = getStopStatusLabel(groupedStop);
                  const groupedStopComplete = isStopComplete(groupedStop);
                  return (
	                    <View key={groupedStop.id} style={styles.groupedStopActionCard} testID={`grouped-stop-card-${groupedStop.id}`}>
	                      <View style={styles.groupedStopActionHeader}>
	                        <View style={styles.groupedStopActionIdentity}>
	                          <Text style={styles.groupedStopActionTitle}>
	                            {groupedStop.sid ? `SID ${groupedStop.sid}` : `Stop ${groupedStop.sequence_order}`}
	                          </Text>
                          <Text style={styles.groupedStopActionSubtitle}>
                            {[
                              groupedStop.sequence_order ? `#${groupedStop.sequence_order}` : null,
                              getGroupedStopUnitLabel(groupedStop),
                              groupedStop.contact_name || null
                            ].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
	                        <View style={[styles.groupedStopStatusPill, groupedStopComplete ? styles.groupedStopStatusPillDone : null]}>
	                          <Text style={[styles.groupedStopStatusText, groupedStopComplete ? styles.groupedStopStatusTextDone : null]}>
	                            {groupedStopStatus}
	                          </Text>
	                        </View>
                      </View>
                      <View style={styles.groupedStopActionMetaRow}>
                        <View style={styles.groupedStopMetaPill}>
                          <OpenBoxIcon color={appTheme.colors.orangeDeep} size={14} />
                          <Text style={styles.groupedStopMetaText}>{groupedStopPackages}</Text>
                        </View>
                        <View style={styles.groupedStopMetaPill}>
                          <Text style={styles.groupedStopMetaText}>{getStopTypeLabel(groupedStop)}</Text>
                        </View>
                        {groupedStopDeliveryCode ? (
                          <View style={styles.groupedStopCodePill}>
                            <Text style={styles.groupedStopCodeText}>{groupedStopDeliveryCode}</Text>
                          </View>
                        ) : null}
                        {groupedStopExceptionCode ? (
                          <View style={styles.groupedStopCodePill}>
                            <Text style={styles.groupedStopCodeText}>{groupedStopExceptionCode}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.groupedStopActionButtonRow}>
	                        <Pressable
	                          disabled={isSubmitting || groupedStopComplete}
	                          onPress={() => completeIndividualStop(groupedStop)}
                          style={[
                            styles.groupedStopPrimaryButton,
                            (isSubmitting || groupedStopComplete) && styles.buttonDisabled
                          ]}
                          testID={`grouped-stop-complete-${groupedStop.id}`}
	                        >
	                          <Text style={styles.groupedStopPrimaryButtonText}>{groupedStopComplete ? 'Complete' : 'Complete'}</Text>
	                        </Pressable>
	                        <Pressable
	                          disabled={isSubmitting}
	                          onPress={() => handleAddGroupedStopCode(groupedStop)}
	                          style={[styles.groupedStopSecondaryButton, isSubmitting && styles.buttonDisabled]}
	                          testID={`grouped-stop-add-code-${groupedStop.id}`}
	                        >
	                          <Text style={styles.groupedStopSecondaryButtonText}>Add code</Text>
	                        </Pressable>
	                        <Pressable onPress={() => handleOpenStopDetail(groupedStop.id)} style={styles.groupedStopSecondaryButton}>
	                          <Text style={styles.groupedStopSecondaryButtonText}>{groupedStop.has_note ? 'Edit note' : 'Add note'}</Text>
	                        </Pressable>
	                      </View>
	                    </View>
	                  );
                })}
              </View>
              <Pressable onPress={() => handleOpenGroupedStops(selectedStopGroup)} style={styles.groupedStopsListButton}>
                <Text style={styles.groupedStopsListButtonText}>View stops at this + pin</Text>
              </Pressable>
            </View>
          ) : selectedStop ? (
            <View style={styles.selectedStopCard}>
              <View style={styles.calloutHeaderRow}>
                <View style={styles.selectedStopHeaderLeft}>
                  <View
                    style={[
                      styles.calloutTitleBadge,
                      pinColorMode === 'sid' && getSidBucketTheme(selectedStop.sid)
                        ? {
                            backgroundColor: getSidBucketTheme(selectedStop.sid).fill,
                            borderColor: getSidBucketTheme(selectedStop.sid).border
                          }
                        : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.calloutTitle,
                        pinColorMode === 'sid' && getSidBucketTheme(selectedStop.sid)
                          ? { color: getSidBucketTheme(selectedStop.sid).text }
                          : null
                      ]}
                    >
                      {selectedStop.sid ? `SID ${selectedStop.sid}` : `Stop ${selectedStop.sequence_order}`}
                    </Text>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="Close selected stop"
                  onPress={() => setSelectedMapItemId(null)}
                  style={styles.calloutCloseButton}
                  testID="selected-stop-close-button"
                >
                  <Text style={styles.calloutCloseButtonText}>×</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() => handleOpenStopDetail(selectedStop.id)}
                style={styles.selectedStopCardPressable}
                testID="selected-stop-card-action"
              >
                <Text numberOfLines={2} style={styles.calloutAddress}>
                  {selectedStop.address}
                </Text>
                {selectedStop.contact_name ? <Text style={styles.calloutContact}>{selectedStop.contact_name}</Text> : null}
                <View style={styles.calloutPackageInfoRow}>
                  <View style={styles.calloutPackageInfoLeft}>
                    <View style={styles.calloutPackageRow}>
                      <OpenBoxIcon color={appTheme.colors.orangeDeep} size={18} />
                      <Text style={styles.calloutPackageCount}>{selectedPackageCount}</Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => handleOpenNavigationForStop(selectedStop)}
                    style={styles.calloutNavButton}
                    testID="selected-stop-nav-button"
                  >
                    <Text style={styles.calloutNavButtonText}>Nav</Text>
                  </Pressable>
                </View>
                {selectedStopBadges.length || selectedTimeCommitAlertBadge ? (
                  <View style={styles.calloutBadgeRow}>
                    {selectedStopBadges.map((badge) => (
                      <View key={`${selectedStop.id}-${badge.type}-${badge.label}`} style={[styles.calloutBadge, styles[`bannerPill_${badge.type}`]]}>
                        <Text style={[styles.calloutBadgeText, styles[`bannerPillText_${badge.type}`]]}>{badge.label}</Text>
                      </View>
                    ))}
                    {selectedTimeCommitAlertBadge ? (
                      <View style={[styles.calloutBadge, styles[`bannerPill_${selectedTimeCommitAlertBadge.type}`]]}>
                        <Text style={[styles.calloutBadgeText, styles[`bannerPillText_${selectedTimeCommitAlertBadge.type}`]]}>
                          {selectedTimeCommitAlertBadge.label}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {selectedQuickIntel.length ? (
                  <View style={styles.calloutIntelRow}>
                    {selectedQuickIntel.map((item) => (
                      <View key={`${selectedStop.id}-${item.key}`} style={[styles.calloutIntelChip, styles[`quickIntelChip_${item.tone}`]]}>
                        <Text style={[styles.calloutIntelChipText, styles[`quickIntelChipText_${item.tone}`]]}>{item.label}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {selectedTimeCommitCallout ? (
                  <>
                    <Text style={[styles.calloutWindowTitle, selectedUrgencyStyles.calloutStyle]}>{selectedTimeCommitCallout.title}</Text>
                    {selectedTimeCommitCallout.subtitle ? (
                      <Text style={[styles.calloutWindowSubtitle, selectedUrgencyStyles.calloutTextStyle]}>{selectedTimeCommitCallout.subtitle}</Text>
                    ) : null}
                  </>
                ) : null}
                {selectedExceptionCode || selectedScanTime ? (
                  <View style={styles.calloutScanRow}>
                    {selectedExceptionCode ? (
                      <View style={styles.calloutExceptionPill}>
                        <Text style={styles.calloutExceptionPillText}>{selectedExceptionCode}</Text>
                      </View>
                    ) : null}
                    {selectedScanTime ? <Text style={styles.calloutScanTime}>{selectedScanTime}</Text> : null}
                  </View>
                ) : null}
              </Pressable>
            </View>
          ) : null}

          <View style={styles.driverControlPanel}>
            <View style={styles.bottomBar}>
              <View style={styles.bottomStatsRow}>
                <View style={styles.bottomStatColumn}>
                  <Text style={styles.bottomStatLabel}>Stops/hr</Text>
                  <Text style={styles.bottomStatValue}>{stopsPerHourLabel}</Text>
                </View>
                <View style={styles.bottomStatColumn}>
                  <Text style={styles.bottomStatLabel}>Delivered</Text>
                  <Text style={styles.bottomStatValue}>{completionSummaryLabel}</Text>
                </View>
              </View>
              {selectedStopGroup ? (
                <View style={styles.groupedBottomHint}>
                  <Text style={styles.groupedBottomHintText}>Complete stops individually above.</Text>
                </View>
              ) : (
                <Pressable
                  disabled={isSubmitting || !selectedStop}
                  onPress={handleCompleteStop}
                  style={[styles.completeButton, isSubmitting && styles.buttonDisabled]}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.completeButtonText}>Complete</Text>
                  )}
                </Pressable>
              )}
            </View>

            <View style={styles.laborActionRow}>
              <Pressable
                disabled={isUpdatingClock || (!route && !clockedInAt)}
                onPress={handleClockToggle}
                style={[
                  styles.laborActionButton,
                  styles.clockButton,
                  (isUpdatingClock || (!route && !clockedInAt)) && styles.buttonDisabled
                ]}
              >
                {isUpdatingClock ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.laborActionButtonText}>{clockedInAt ? 'Clock Out' : 'Clock In'}</Text>
                )}
              </Pressable>
              <Pressable
                disabled={isUpdatingBreak || !clockedInAt}
                onPress={handleBreakToggle}
                style={[
                  styles.laborActionButton,
                  activeBreak ? styles.breakButtonActive : styles.breakButtonIdle,
                  (isUpdatingBreak || !clockedInAt) && styles.buttonDisabled
                ]}
              >
                {isUpdatingBreak ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={[styles.laborActionButtonText, activeBreak ? styles.breakButtonTextActive : styles.breakButtonTextIdle]}>
                    {breakButtonLabel}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: appTheme.colors.surface
  },
  container: {
    flex: 1,
    position: 'relative'
  },
  topOverlay: {
    left: 0,
    paddingHorizontal: appTheme.spacing.sm,
    paddingTop: appTheme.spacing.xs,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10
  },
  dispatchNoticeCard: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  locationNoticeCard: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    marginBottom: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  locationNoticeTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xxs
  },
  locationNoticeBody: {
    color: appTheme.colors.infoText,
    fontSize: appTheme.typography.caption,
    lineHeight: 18
  },
  locationNoticeBullets: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  locationNoticeBulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  locationNoticeBulletDot: {
    color: appTheme.colors.orange,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 18
  },
  locationNoticeBulletText: {
    color: appTheme.colors.textSecondary,
    flex: 1,
    fontSize: appTheme.typography.caption,
    lineHeight: 18
  },
  locationNoticeSecondary: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    lineHeight: 18,
    marginTop: appTheme.spacing.sm
  },
  locationNoticeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.sm,
    justifyContent: 'center',
    marginTop: appTheme.spacing.sm,
    minHeight: 34,
    paddingHorizontal: 12
  },
  locationNoticeButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  dispatchNoticeTitle: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xxs
  },
  dispatchNoticeBody: {
    color: appTheme.colors.infoText,
    fontSize: appTheme.typography.caption,
    lineHeight: 18
  },
  bottomOverlay: {
    bottom: 0,
    gap: appTheme.spacing.sm,
    left: 0,
    paddingBottom: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.sm,
    position: 'absolute',
    right: 0,
    zIndex: 10
  },
  centeredState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  emptyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.sm
  },
  emptyText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body,
    textAlign: 'center'
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.charcoal,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    marginTop: appTheme.spacing.lg,
    minHeight: 48,
    minWidth: 132,
    paddingHorizontal: appTheme.spacing.lg
  },
  retryButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  banner: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 22,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    zIndex: 2,
    elevation: 6
  },
  bannerContentButton: {
    flex: 1,
    gap: 2
  },
  bannerMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8
  },
  bannerMetaPill: {
    backgroundColor: '#173042',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  bannerMetaPillMuted: {
    backgroundColor: '#edf2f7'
  },
  bannerMetaPillText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  bannerMetaPillTextMuted: {
    color: '#415466'
  },
  bannerDetailsPressable: {
    gap: 2
  },
  bannerMeta: {
    color: '#65727d',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2
  },
  bannerAddress: {
    color: '#1f2a33',
    flex: 1,
    fontSize: 18,
    fontWeight: '800'
  },
  bannerAddressRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  bannerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  bannerPackages: {
    color: '#65727d',
    fontSize: 15,
    marginTop: 2
  },
  bannerCollapsedHint: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderColor: '#e7e2da',
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: '86%',
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 6
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4
  },
  bannerCollapsedHintText: {
    color: '#51606b',
    fontSize: 12,
    fontWeight: '700'
  },
  quickIntelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10
  },
  quickIntelChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  quickIntelChip_apartment: {
    backgroundColor: '#f5f3ff'
  },
  quickIntelChip_building: {
    backgroundColor: '#eef6ff'
  },
  quickIntelChip_warning: {
    backgroundColor: '#fff3e8'
  },
  quickIntelChip_grouped: {
    backgroundColor: '#eefbf3'
  },
  quickIntelChipText: {
    fontSize: 12,
    fontWeight: '800'
  },
  quickIntelChipText_apartment: {
    color: '#6d28d9'
  },
  quickIntelChipText_building: {
    color: '#1d4ed8'
  },
  quickIntelChipText_warning: {
    color: '#c45100'
  },
  quickIntelChipText_grouped: {
    color: '#157347'
  },
  bannerContact: {
    color: '#7a848d',
    fontSize: 13,
    marginTop: 4
  },
  bannerBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6
  },
  bannerPill: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 24,
    paddingHorizontal: 10
  },
  bannerPill_business: {
    backgroundColor: '#111111'
  },
  bannerPill_pickup: {
    backgroundColor: '#2980b9'
  },
  bannerPill_combined: {
    backgroundColor: '#efe8ff'
  },
  bannerPill_timeCommit: {
    backgroundColor: '#fff3cd'
  },
  bannerPill_warning: {
    backgroundColor: '#ffedd5'
  },
  bannerPill_urgent: {
    backgroundColor: '#fee2e2'
  },
  bannerPill_overdue: {
    backgroundColor: '#dc2626'
  },
  bannerPill_note: {
    backgroundColor: '#fff1e7'
  },
  bannerPillText: {
    fontSize: 11,
    fontWeight: '800'
  },
  bannerPillText_business: {
    color: '#ffffff'
  },
  bannerPillText_pickup: {
    color: '#ffffff'
  },
  bannerPillText_combined: {
    color: '#6d28d9'
  },
  bannerPillText_timeCommit: {
    color: '#8a4b08'
  },
  bannerPillText_warning: {
    color: '#9a3412'
  },
  bannerPillText_urgent: {
    color: '#b91c1c'
  },
  bannerPillText_overdue: {
    color: '#ffffff'
  },
  bannerPillText_note: {
    color: '#FF6200'
  },
  navigateButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FF6200',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 11
  },
  bannerDismissButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#f8fafc',
    borderColor: '#d7e0e8',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 11
  },
  bannerDismissButtonText: {
    color: '#415466',
    fontSize: 13,
    fontWeight: '800'
  },
  navigateButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  map: {
    flex: 1
  },
  driverMarkerWrap: {
    alignItems: 'center',
    height: 48,
    justifyContent: 'center',
    width: 48
  },
  driverMarkerShadow: {
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 6
    },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    width: 40,
    elevation: 6
  },
  driverMarkerHalo: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe7ff',
    height: 36,
    position: 'absolute',
    width: 36
  },
  driverMarkerArrow: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  driverMarkerArrowHead: {
    backgroundColor: 'transparent',
    borderBottomColor: 'transparent',
    borderBottomWidth: 0,
    borderLeftColor: 'transparent',
    borderLeftWidth: 8,
    borderRightColor: 'transparent',
    borderRightWidth: 8,
    borderTopColor: '#2563eb',
    borderTopWidth: 18,
    height: 0,
    width: 0
  },
  driverMarkerArrowTail: {
    backgroundColor: '#2563eb',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    height: 8,
    marginTop: -1,
    width: 4
  },
  mapControlStack: {
    gap: appTheme.spacing.sm,
    position: 'absolute',
    right: appTheme.spacing.sm,
    top: 116,
    zIndex: 9
  },
  mapControlButton: {
    ...appTheme.shadows.card,
    alignItems: 'center',
    backgroundColor: appTheme.colors.mapOverlaySurface,
    borderColor: appTheme.colors.mapOverlayBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 68,
    paddingHorizontal: appTheme.spacing.sm
  },
  mapControlButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  markerWrap: {
    alignItems: 'center',
    height: 60,
    justifyContent: 'center',
    width: 60
  },
  markerRing: {
    alignItems: 'center',
    borderRadius: 24,
    justifyContent: 'center'
  },
  markerRingActive: {
    borderColor: '#FF6200',
    borderWidth: 2
  },
  markerRingWarning: {
    borderColor: '#f59e0b',
    borderWidth: 3
  },
  markerRingUrgent: {
    borderColor: '#ef4444',
    borderWidth: 3
  },
  markerRingOverdue: {
    borderColor: '#b91c1c',
    borderWidth: 3
  },
  markerCore: {
    alignItems: 'center',
    borderWidth: 2,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 4
  },
  currentMarkerCore: {
    borderColor: appTheme.colors.orange,
    borderWidth: 3,
    shadowOpacity: 0.24,
    shadowRadius: 8
  },
  currentMarkerRing: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange,
    borderWidth: 3
  },
  markerLabel: {
    fontSize: 12,
    fontWeight: '800'
  },
  markerLabelLarge: {
    fontSize: 12
  },
  currentMarkerLabel: {
    fontSize: 14
  },
  businessBadge: {
    alignItems: 'center',
    backgroundColor: '#4d148c',
    borderRadius: 7,
    borderColor: '#ffffff',
    borderWidth: 1,
    bottom: -4,
    height: 14,
    justifyContent: 'center',
    position: 'absolute',
    right: -4,
    width: 14
  },
  businessBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800'
  },
  timeCommitBadge: {
    alignItems: 'center',
    backgroundColor: '#2980b9',
    borderColor: '#ffffff',
    borderRadius: 9,
    borderWidth: 1,
    height: 18,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -10,
    minWidth: 20,
    position: 'absolute',
    paddingHorizontal: 3,
    top: -14
  },
  timeCommitBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900'
  },
  timeCommitBadgeWarning: {
    backgroundColor: '#f59e0b'
  },
  timeCommitBadgeUrgent: {
    backgroundColor: '#ef4444'
  },
  timeCommitBadgeOverdue: {
    backgroundColor: '#b91c1c'
  },
  timeCommitBadgeTextLight: {
    color: '#ffffff'
  },
  apartmentBadge: {
    alignItems: 'center',
    backgroundColor: '#ff6200',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    left: -4,
    position: 'absolute',
    top: -4,
    width: 14
  },
  apartmentBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800'
  },
  pickupBadge: {
    alignItems: 'center',
    backgroundColor: '#2980b9',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
    top: -1,
    width: 14
  },
  pickupBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900'
  },
  groupCountBadge: {
    alignItems: 'center',
    backgroundColor: '#173042',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 1,
    bottom: -4,
    height: 14,
    justifyContent: 'center',
    minWidth: 14,
    paddingHorizontal: 0,
    position: 'absolute',
    right: -4,
    width: 14
  },
  groupCountBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900'
  },
  calloutCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    maxWidth: 250,
    minWidth: 210,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  calloutHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: appTheme.spacing.md
  },
  selectedStopHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    flexWrap: 'wrap',
    gap: appTheme.spacing.sm,
    paddingRight: appTheme.spacing.sm
  },
  calloutTitle: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  calloutTitleBadge: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: appTheme.spacing.sm
  },
  calloutNavButton: {
    ...appTheme.shadows.lifted,
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.md,
    display: 'flex',
    height: 44,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 72,
    paddingHorizontal: appTheme.spacing.md
  },
  calloutNavButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy,
    includeFontPadding: false,
    lineHeight: appTheme.typography.lineHeights.body,
    textAlign: 'center',
    textAlignVertical: 'center'
  },
  calloutCloseButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44
  },
  calloutCloseButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: 26
  },
  calloutAddress: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleSmall
  },
  calloutContact: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  calloutBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  calloutBadge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 22,
    paddingHorizontal: 9
  },
  calloutBadgeText: {
    fontSize: 10,
    fontWeight: '800'
  },
  calloutIntelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8
  },
  calloutIntelChip: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  calloutIntelChipText: {
    fontSize: 10,
    fontWeight: '800'
  },
  calloutWindowTitle: {
    color: '#8a4b08',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 8
  },
  calloutWindowSubtitle: {
    color: '#8a4b08',
    fontSize: 11,
    marginTop: 2
  },
  calloutWindowWarning: {
    color: '#9a3412'
  },
  calloutWindowUrgent: {
    color: '#b91c1c'
  },
  calloutWindowOverdue: {
    color: '#991b1b'
  },
  calloutWindowTextWarning: {
    color: '#9a3412'
  },
  calloutWindowTextUrgent: {
    color: '#b91c1c',
    fontWeight: '800'
  },
  calloutWindowTextOverdue: {
    color: '#991b1b',
    fontWeight: '800'
  },
  calloutPackageRow: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surfaceTint,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.xs
  },
  calloutPackageInfoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between',
    marginTop: appTheme.spacing.sm
  },
  calloutPackageInfoLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.sm,
    paddingRight: appTheme.spacing.sm
  },
  calloutPackageCount: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  calloutScanRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8
  },
  calloutExceptionPill: {
    backgroundColor: '#fff1e8',
    borderColor: '#fed7aa',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  calloutExceptionPillText: {
    color: '#c2410c',
    fontSize: 11,
    fontWeight: '900'
  },
  calloutScanTime: {
    color: '#173042',
    fontSize: 12,
    fontWeight: '900'
  },
  selectedStopCard: {
    ...appTheme.shadows.sheet,
    backgroundColor: appTheme.colors.mapOverlaySurface,
    borderColor: appTheme.colors.mapOverlayBorder,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.md
  },
  groupedCardComplete: {
    borderColor: '#86efac'
  },
  selectedStopCardPressable: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  groupedCardHeading: {
    flex: 1,
    gap: 2
  },
  groupedCardActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  groupedCardTitle: {
    color: '#173042',
    fontSize: 18,
    fontWeight: '800'
  },
  groupedCardSubtitle: {
    color: '#6b7782',
    fontSize: 13,
    fontWeight: '600'
  },
  groupedCardHelperText: {
    color: appTheme.colors.orangeDeep,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: 2
  },
  groupedCardSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  groupedCardCountPill: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 5
  },
  groupedCardCountPillText: {
    color: appTheme.colors.orangeDeep,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedCardProgressPill: {
    backgroundColor: '#ecfdf5',
    borderColor: '#bbf7d0',
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 5
  },
  groupedCardProgressPillDone: {
    backgroundColor: '#dcfce7',
    borderColor: '#86efac'
  },
  groupedCardProgressText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedCardPackagePill: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 5
  },
  groupedCardPackageText: {
    color: appTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedSharedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  groupedSharedActionButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.sm
  },
  groupedSharedActionButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopPreview: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: 6,
    marginTop: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm
  },
  groupedStopPreviewRow: {
    gap: 2
  },
  groupedStopPreviewUnit: {
    color: appTheme.colors.textPrimary,
    fontSize: 13,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopPreviewMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.bold
  },
  groupedStopPreviewMore: {
    color: appTheme.colors.orangeDeep,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopActionList: {
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.sm
  },
  groupedStopActionCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.sm
  },
  groupedStopActionHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between'
  },
  groupedStopActionIdentity: {
    flex: 1,
    gap: 2
  },
  groupedStopActionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopActionSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  groupedStopStatusPill: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 5
  },
  groupedStopStatusPillDone: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0'
  },
  groupedStopStatusText: {
    color: appTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopStatusTextDone: {
    color: '#166534'
  },
  groupedStopActionMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  groupedStopMetaPill: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderRadius: appTheme.radius.pill,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 5
  },
  groupedStopMetaText: {
    color: appTheme.colors.textPrimary,
    fontSize: 11,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopCodePill: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 5
  },
  groupedStopCodeText: {
    color: '#c2410c',
    fontSize: 11,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopActionButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  groupedStopPrimaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.green,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: appTheme.spacing.sm
  },
  groupedStopPrimaryButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopSecondaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: appTheme.spacing.sm
  },
  groupedStopSecondaryButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedStopsListButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.lg,
    justifyContent: 'center',
    marginTop: appTheme.spacing.sm,
    minHeight: 44,
    paddingHorizontal: appTheme.spacing.md
  },
  groupedStopsListButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  legendContainer: {
    alignItems: 'flex-end',
    bottom: 182,
    position: 'absolute',
    right: appTheme.spacing.sm,
    zIndex: 9
  },
  legendPanel: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#e9ded2',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3
  },
  legendTitle: {
    color: '#173042',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 6
  },
  legendTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  legendTableHeaderText: {
    color: '#73818c',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginTop: 6
  },
  legendRowText: {
    color: '#173042',
    flex: 1,
    fontSize: 11,
    fontWeight: '700'
  },
  legendDot: {
    alignItems: 'center',
    borderRadius: 11,
    height: 22,
    justifyContent: 'center',
    position: 'relative',
    width: 22
  },
  legendDotPending: {
    backgroundColor: '#ffffff',
    borderColor: '#111111',
    borderWidth: 2
  },
  legendDotPendingBusiness: {
    backgroundColor: '#ffffff',
    borderColor: '#4d148c',
    borderWidth: 2
  },
  legendDotPendingApartment: {
    backgroundColor: '#ffffff',
    borderColor: '#ff6200',
    borderWidth: 2
  },
  legendDotDelivered: {
    backgroundColor: '#27ae60'
  },
  legendDotAttempted: {
    backgroundColor: '#f39c12'
  },
  legendDotIncomplete: {
    backgroundColor: '#e74c3c'
  },
  legendDotPickup: {
    backgroundColor: '#2980b9',
    borderColor: '#1f618d',
    borderWidth: 2
  },
  legendDotTimeCommit: {
    backgroundColor: 'transparent',
    borderColor: '#FF6200',
    borderWidth: 3
  },
  legendDotText: {
    color: '#111111',
    fontSize: 10,
    fontWeight: '900'
  },
  legendPickupText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900'
  },
  legendMiniBusiness: {
    alignItems: 'center',
    backgroundColor: '#4d148c',
    borderRadius: 7,
    bottom: -2,
    height: 14,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    width: 14
  },
  legendMiniApartment: {
    alignItems: 'center',
    backgroundColor: '#ff6200',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    left: -2,
    position: 'absolute',
    top: -2,
    width: 14
  },
  legendMiniPickup: {
    alignItems: 'center',
    backgroundColor: '#2980b9',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    position: 'absolute',
    right: -2,
    top: -2,
    width: 14
  },
  legendMiniTimeCommit: {
    alignItems: 'center',
    backgroundColor: '#2980b9',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -9,
    position: 'absolute',
    top: -3,
    width: 18
  },
  legendMiniNote: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 7,
    bottom: -2,
    height: 14,
    justifyContent: 'center',
    left: -2,
    position: 'absolute',
    width: 14
  },
  legendMiniText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '900'
  },
  legendMiniTimeCommitText: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '900'
  },
  legendButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#d7c7b8',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32
  },
  legendButtonText: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '800'
  },
  bottomBar: {
    paddingTop: appTheme.spacing.xxs
  },
  driverControlPanel: {
    ...appTheme.shadows.sheet,
    backgroundColor: appTheme.colors.mapOverlaySurface,
    borderColor: appTheme.colors.mapOverlayBorder,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.md,
    paddingBottom: appTheme.spacing.sm
  },
  laborActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'center',
    marginTop: appTheme.spacing.sm
  },
  laborActionButton: {
    alignItems: 'center',
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.md,
    width: '44%'
  },
  laborActionButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  clockButton: {
    backgroundColor: appTheme.colors.charcoal
  },
  breakButtonIdle: {
    backgroundColor: appTheme.colors.purple
  },
  breakButtonActive: {
    backgroundColor: '#5838bf'
  },
  breakButtonTextIdle: {
    color: '#ffffff'
  },
  breakButtonTextActive: {
    color: '#ffffff'
  },
  bottomStatsRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.sm
  },
  bottomStatColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  bottomStatLabel: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold,
    marginBottom: appTheme.spacing.xxs,
    textTransform: 'uppercase'
  },
  bottomStatValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy,
    textAlign: 'center'
  },
  completeButton: {
    ...appTheme.shadows.card,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: appTheme.colors.green,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 50,
    width: '72%'
  },
  completeButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  groupedBottomHint: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: appTheme.spacing.md,
    width: '72%'
  },
  groupedBottomHintText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    textAlign: 'center'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  headerButton: {
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: appTheme.spacing.md
  },
  headerButtonSurface: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.mapOverlaySurface,
    borderColor: appTheme.colors.mapOverlayBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1
  },
  headerButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.bold
  },
  stopPin: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 2,
    height: 36,
    justifyContent: 'center',
    width: 36
  },
  currentStopPin: {
    backgroundColor: '#173042'
  },
  incompleteStopPin: {
    backgroundColor: '#CC0000'
  },
  stopPinText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  }
});
