import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';
import { getPinColorMode, removeClockInTime, saveClockInTime, subscribePinColorMode } from '../services/auth';
import { getSidBucketTheme } from '../utils/sidBuckets';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const shouldUseGoogleProvider = Platform.OS !== 'ios' || Boolean(String(googleMapsApiKey).trim());

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

export function getStopType(stop) {
  if (stop?.stop_type === 'combined' || (stop?.has_delivery && stop?.has_pickup)) {
    return 'combined';
  }

  if (stop?.stop_type === 'pickup' || stop?.is_pickup || stop?.has_pickup) {
    return 'pickup';
  }

  return 'delivery';
}

export function getBannerBadges(stop) {
  const badges = [];
  const stopType = getStopType(stop);

  if (stop?.is_business) {
    badges.push({ label: 'BUSINESS', type: 'business' });
  }

  if (stopType === 'pickup') {
    badges.push({ label: 'PICKUP', type: 'pickup' });
  } else if (stopType === 'combined') {
    badges.push({ label: 'DELIVERY + PICKUP', type: 'combined' });
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

function getSidBadgeStyle(sid, pinColorMode = 'sid') {
  if (pinColorMode !== 'sid') {
    return null;
  }

  const theme = getSidBucketTheme(sid);

  if (!theme) {
    return null;
  }

  return {
    backgroundColor: theme.fill,
    borderColor: theme.border,
    textColor: theme.text
  };
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

  if (apartmentIntel?.floor != null) {
    intel.push({
      key: 'floor',
      label: apartmentIntel.verified ? `Floor ${apartmentIntel.floor} verified` : `Floor ${apartmentIntel.floor}`,
      tone: 'apartment'
    });
  } else if (stop?.floor_label) {
    intel.push({ key: 'floor-label', label: stop.floor_label, tone: 'building' });
  } else if (displayLocationType && displayLocationType !== 'house' && displayLocationType !== 'apartment') {
    intel.push({ key: 'location-type', label: String(displayLocationType).toUpperCase(), tone: 'building' });
  }

  if (propertyIntel?.access_note) {
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
  const groupedCount = Number(stop?.property_intel?.grouped_stop_count || 0);
  const isApartmentGroup = Boolean(
    stop?.is_apartment_unit ||
      stop?.apartment_intelligence ||
      stop?.property_intel?.location_type === 'apartment'
  );

  if (!normalizedAddress || groupedCount <= 1 || !isApartmentGroup) {
    return null;
  }

  return normalizedAddress;
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

function buildMapItems(stops) {
  const sortedStops = [...(stops || [])].sort((a, b) => Number(a.sequence_order || 0) - Number(b.sequence_order || 0));
  const groupedItems = new Map();
  const items = [];

  for (const stop of sortedStops) {
    const coordinate = toCoordinate(stop);

    if (!coordinate) {
      continue;
    }

    const groupKey = getStopGroupKey(stop);

    if (!groupKey) {
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
        (sum, stop) => sum + Number(stop?.packages?.length || stop?.package_count || stop?.pkg_count || 0),
        0
      ),
      label: String(representativeStop?.sequence_order || stopsInGroup[0]?.sequence_order || ''),
      groupCount: stopsInGroup.length
    };
  });
}

function MapPin({ isCurrentStop, now, stop, labelOverride = null, groupCount = 0, pinColorMode = 'sid' }) {
  const stopType = getStopType(stop);
  const colors = getStopStatusColors(stop.status, isCurrentStop, stopType, stop, pinColorMode);
  const hasTimeCommit = Boolean(stop.has_time_commit);
  const isApartment = Boolean(stop.is_apartment_unit || stop.apartment_intelligence);
  const hasPickupWork = stopType === 'pickup' || stopType === 'combined';
  const pinSize = isCurrentStop ? 34 : 28;
  const ringSize = isCurrentStop ? 44 : 36;
  const mainLabel = labelOverride || String(stop.sequence_order);
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
          <Text style={[styles.markerLabel, { color: colors.text }, isCurrentStop && styles.currentMarkerLabel]}>
            {mainLabel}
          </Text>

          {stop.is_business ? (
            <View style={styles.businessBadge}>
              <Text style={styles.businessBadgeText}>B</Text>
            </View>
          ) : null}

          {hasTimeCommit ? (
            <View style={[styles.timeCommitBadge, urgencyStyles.badgeStyle]}>
              <Text style={[styles.timeCommitBadgeText, urgencyStyles.badgeTextStyle]}>TC</Text>
            </View>
          ) : null}

          {isApartment ? (
            <View style={styles.apartmentBadge}>
              <Text style={styles.apartmentBadgeText}>A</Text>
            </View>
          ) : null}

          {hasPickupWork ? (
            <View style={styles.pickupBadge}>
              <Text style={styles.pickupBadgeText}>+</Text>
            </View>
          ) : null}

          {groupCount > 1 ? (
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
              <View style={styles.legendMiniTimeCommit}><Text style={styles.legendMiniTimeCommitText}>TC</Text></View>
            </View>
            <Text style={styles.legendRowText}>Time commit window</Text>
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
  const [hasLocationAccess, setHasLocationAccess] = useState(true);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [selectedMapItemId, setSelectedMapItemId] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [loadError, setLoadError] = useState(null);
  const [markersNeedRefresh, setMarkersNeedRefresh] = useState(true);
  const [markerRefreshVersion, setMarkerRefreshVersion] = useState(0);
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
  const selectedPackageCount = selectedStop?.packages?.length || 0;
  const selectedGroupPackageCount = selectedStopGroup?.packageCount || 0;
  const driverHeading = getDriverHeading(currentLocation);
  const laborButtonLabel = clockedInAt ? 'Clock Out' : 'Clock In';
  const initialRegion = useMemo(
    () => getMapRegion({ currentStop: selectedStop || selectedStopGroup?.representativeStop || null, currentLocation, mappableStops }),
    [currentLocation, mappableStops, selectedStop, selectedStopGroup]
  );

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
      headerRight: () => (
        <Pressable onPress={() => navigation.navigate('Manifest', { selectedStopId: selectedStop?.id || null })} style={styles.headerButton}>
          <Text style={styles.headerButtonText}>List</Text>
        </Pressable>
      )
    });
  }, [navigation, selectedStop?.id]);

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
    setMarkersNeedRefresh(true);
    setMarkerRefreshVersion((current) => current + 1);

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
      refreshRoute({ allowStateUpdate: true, showAlert: false });
      return undefined;
    }

    activeBreakTimerRef.current = setTimeout(() => {
      refreshRoute({ allowStateUpdate: true, showAlert: false });
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
      try {
        const currentPermission = await Location.getForegroundPermissionsAsync();
        const permission = shouldPromptForLocationPermission(currentPermission)
          ? await Location.requestForegroundPermissionsAsync()
          : currentPermission;
        const granted = hasGrantedLocationPermission(permission);

        if (isMounted) {
          setHasLocationAccess(granted);
        }

        if (!granted) {
          return;
        }

        const position = await Location.getCurrentPositionAsync({});

        if (isMounted) {
          setCurrentLocation(position);
        }
      } catch (_error) {
        if (isMounted) {
          setHasLocationAccess(false);
        }
      }

      try {
        await refreshRoute({ allowStateUpdate: isMounted });
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

    const positionInterval = setInterval(() => {
      postCurrentPosition();
    }, 30000);

    const rateInterval = setInterval(() => {
      refreshRoute({ allowStateUpdate: true, showAlert: false });
    }, 60000);

    postCurrentPosition();

    return () => {
      clearInterval(positionInterval);
      clearInterval(rateInterval);
    };
  }, [route?.id]);

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

  async function refreshRoute({ allowStateUpdate = true, showAlert = true, isRetry = false } = {}) {
    if (allowStateUpdate && isRetry) {
      setIsRetryingLoad(true);
    }

    try {
      const [routeResponse, timecardStatusResponse] = await Promise.all([
        api.get('/routes/today'),
        api.get('/timecards/status')
      ]);
      const nextRoute = routeResponse.data?.route || null;
      const nextDriverDay = routeResponse.data?.driver_day || {
        status: nextRoute ? 'dispatched' : 'unassigned'
      };
      const activeBreakState = timecardStatusResponse.data?.active_break || null;
      const serverClockInAt =
        timecardStatusResponse.data?.active_timecard?.clock_in || timecardStatusResponse.data?.clock_in_at || null;

      if (!allowStateUpdate) {
        return;
      }

      setRoute(nextRoute);
      setDriverDay(nextDriverDay);
      setStops(nextRoute?.stops || []);
      setClockedInAt(serverClockInAt);
      setActiveBreak(activeBreakState);
      setLoadError(null);

      if (serverClockInAt) {
        Promise.resolve(saveClockInTime(serverClockInAt)).catch(() => {});
      } else {
        Promise.resolve(removeClockInTime()).catch(() => {});
      }
    } catch (error) {
      if (allowStateUpdate) {
        const message = error.response?.data?.error || 'Unable to load route details.';
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

  async function postCurrentPosition() {
    if (!route?.id) {
      return;
    }

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      const permission = shouldPromptForLocationPermission(currentPermission)
        ? await Location.requestForegroundPermissionsAsync()
        : currentPermission;

      if (!hasGrantedLocationPermission(permission)) {
        setHasLocationAccess(false);
        return;
      }

      setHasLocationAccess(true);
      const position = await Location.getCurrentPositionAsync({});
      setCurrentLocation(position);

      await api.post('/routes/position', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        route_id: route.id
      });
    } catch (_error) {
      // Keep the driver flow resilient and retry later.
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
      const message = error.response?.data?.error || 'Unable to update clock status right now.';
      Alert.alert('Clock update failed', message);
    } finally {
      setIsUpdatingClock(false);
    }
  }

  function handleLaborAction() {
    if (!clockedInAt) {
      handleClockToggle();
      return;
    }

    if (activeBreak) {
      Alert.alert('Manage labor', 'Choose what you want to do next.', [
        {
          text: `End ${formatBreakLabel(activeBreak.break_type)}`,
          onPress: () => endActiveBreak()
        },
        {
          text: 'Clock Out',
          onPress: () => handleClockToggle()
        },
        {
          text: 'Cancel',
          style: 'cancel'
        }
      ]);
      return;
    }

    Alert.alert('Manage labor', 'Choose what you want to do next.', [
      {
        text: 'Break',
        onPress: () => startBreak('rest')
      },
      {
        text: 'Lunch',
        onPress: () => startBreak('lunch')
      },
      {
        text: 'Clock Out',
        onPress: () => handleClockToggle()
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
      const message = error.response?.data?.error || 'Unable to start break right now.';
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
      const message = error.response?.data?.error || 'Unable to end break right now.';
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

  function handleOpenStopDetail(stopId) {
    if (!navigation || !stopId) {
      return;
    }

    navigation.navigate('StopDetail', { stopId });
  }

  function handleSelectMapItem(itemId) {
    setSelectedMapItemId((current) => (current === itemId ? null : itemId));
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

  async function handleCompleteStop() {
    if (!selectedStop || isSubmitting) {
      return;
    }

    const stopId = selectedStop.id;
    const nextStatus = getStopType(selectedStop) === 'pickup' ? 'pickup_complete' : 'delivered';

    setIsSubmitting(true);

    try {
      await api.patch(`/routes/stops/${stopId}/complete`, {
        status: nextStatus
      });

      setStops((previousStops) =>
        previousStops.map((stop) =>
          stop.id === stopId
            ? {
                ...stop,
                status: nextStatus,
                completed_at: new Date().toISOString()
              }
            : stop
        )
      );

      setRoute((previousRoute) =>
        previousRoute
          ? {
              ...previousRoute,
              completed_stops: Number(previousRoute.completed_stops || 0) + 1
            }
          : previousRoute
      );
      setSelectedMapItemId(null);

      await refreshRoute({ allowStateUpdate: true, showAlert: true });
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to complete this stop right now.';
      Alert.alert('Stop update failed', message);
    } finally {
      setIsSubmitting(false);
    }
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
                <Text style={styles.locationNoticeTitle}>Location sharing required</Text>
                <Text style={styles.locationNoticeBody}>
                  ReadyRoute needs live location access so managers can track active drivers while you are using the app.
                </Text>
                <Pressable
                  onPress={() => Linking.openSettings?.().catch(() => {})}
                  style={styles.locationNoticeButton}
                >
                  <Text style={styles.locationNoticeButtonText}>Open Settings</Text>
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
            <View style={styles.selectedStopCard}>
              <View style={styles.calloutHeaderRow}>
                <View style={styles.groupedCardHeading}>
                  <Text style={styles.groupedCardTitle}>{selectedStopGroup.primaryAddress}</Text>
                  {selectedStopGroup.localityLine ? (
                    <Text style={styles.groupedCardSubtitle}>{selectedStopGroup.localityLine}</Text>
                  ) : null}
                </View>
                <Pressable onPress={() => handleOpenNavigationForStop(selectedStopGroup.representativeStop)} style={styles.calloutNavButton}>
                  <Text style={styles.calloutNavButtonText}>Nav</Text>
                </Pressable>
              </View>
              <Text style={styles.groupedCardCount}>
                {selectedStopGroup.stops.length} apartment deliveries
                {selectedGroupPackageCount ? ` · ${selectedGroupPackageCount} ${selectedGroupPackageCount === 1 ? 'package' : 'packages'}` : ''}
              </Text>
              <View style={styles.groupedStopTable}>
                {selectedStopGroup.stops.map((stop) => {
                  const sidBadgeStyle = getSidBadgeStyle(stop.sid, pinColorMode);

                  return (
                    <Pressable
                      key={stop.id}
                      onPress={() => handleOpenStopDetail(stop.id)}
                      style={styles.groupedStopRow}
                    >
                      <View
                        style={[
                          styles.groupedStopSequenceBadge,
                          sidBadgeStyle
                            ? {
                                backgroundColor: sidBadgeStyle.backgroundColor,
                                borderColor: sidBadgeStyle.borderColor
                              }
                            : null
                        ]}
                      >
                        <Text
                          style={[
                            styles.groupedStopSequenceBadgeText,
                            sidBadgeStyle ? { color: sidBadgeStyle.textColor } : null
                          ]}
                        >
                          {stop.sid || stop.sequence_order}
                        </Text>
                      </View>
                      <View style={styles.groupedStopMain}>
                        <Text style={styles.groupedStopUnitLabel}>{getGroupedStopUnitLabel(stop)}</Text>
                        <Text style={styles.groupedStopMeta}>
                          {stop.contact_name ? stop.contact_name : 'No contact name'}
                          {(stop.packages?.length || stop.package_count || stop.pkg_count) ? ` · ${Number(stop.packages?.length || stop.package_count || stop.pkg_count)} pkg` : ''}
                        </Text>
                      </View>
                      <View style={[styles.groupedStopStatusPill, styles[`groupedStopStatusPill_${stop.status}`]]}>
                        <Text style={[styles.groupedStopStatusText, styles[`groupedStopStatusText_${stop.status}`]]}>
                          {stop.status === 'pickup_complete'
                            ? 'Done'
                            : stop.status === 'delivered'
                              ? 'Done'
                              : stop.status === 'attempted'
                                ? 'Attempted'
                                : stop.status === 'incomplete'
                                  ? 'Issue'
                                  : 'Pending'}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : selectedStop ? (
            <View style={styles.selectedStopCard}>
              <View style={styles.calloutHeaderRow}>
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
                <Pressable onPress={() => handleOpenNavigationForStop(selectedStop)} style={styles.calloutNavButton}>
                  <Text style={styles.calloutNavButtonText}>Nav</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => handleOpenStopDetail(selectedStop.id)} style={styles.selectedStopCardPressable}>
                <Text numberOfLines={2} style={styles.calloutAddress}>
                  {selectedStop.address}
                </Text>
                {selectedStop.contact_name ? <Text style={styles.calloutContact}>Attn: {selectedStop.contact_name}</Text> : null}
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
                ) : (
                  <Text style={styles.calloutWindowSubtitle}>Tap to open stop details</Text>
                )}
                <Text style={styles.calloutPackages}>
                  {selectedPackageCount} {selectedPackageCount === 1 ? 'package' : 'packages'}
                </Text>
              </Pressable>
            </View>
          ) : null}

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
          </View>

          <View style={styles.laborActionRow}>
            <Pressable
              disabled={isUpdatingClock || isUpdatingBreak || (!route && !clockedInAt)}
              onPress={handleLaborAction}
              style={[
                styles.laborActionButton,
                styles.clockButton,
                (isUpdatingClock || isUpdatingBreak || (!route && !clockedInAt)) && styles.buttonDisabled
              ]}
            >
              {isUpdatingClock || isUpdatingBreak ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.laborActionButtonText}>{laborButtonLabel}</Text>
              )}
            </Pressable>
          </View>

        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  container: {
    flex: 1,
    position: 'relative'
  },
  topOverlay: {
    left: 0,
    paddingHorizontal: 12,
    paddingTop: 6,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10
  },
  dispatchNoticeCard: {
    backgroundColor: 'rgba(255, 244, 232, 0.97)',
    borderColor: '#ffcfad',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  locationNoticeCard: {
    backgroundColor: 'rgba(255, 241, 230, 0.98)',
    borderColor: '#ffbf8c',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  locationNoticeTitle: {
    color: '#173042',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4
  },
  locationNoticeBody: {
    color: '#6a4a2a',
    fontSize: 13,
    lineHeight: 18
  },
  locationNoticeButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ff7a1a',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 34,
    paddingHorizontal: 12
  },
  locationNoticeButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  dispatchNoticeTitle: {
    color: '#9a3412',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4
  },
  dispatchNoticeBody: {
    color: '#7c4a22',
    fontSize: 13,
    lineHeight: 18
  },
  bottomOverlay: {
    bottom: 0,
    left: 0,
    paddingBottom: 10,
    paddingHorizontal: 12,
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
    color: '#173042',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 10
  },
  emptyText: {
    color: '#65727d',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center'
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#173042',
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 48,
    minWidth: 132,
    paddingHorizontal: 18
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
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
    gap: 10,
    position: 'absolute',
    right: 12,
    top: 112,
    zIndex: 9
  },
  mapControlButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#e7e2da',
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 72,
    paddingHorizontal: 12,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 6
    },
    shadowOpacity: 0.1,
    shadowRadius: 14,
    elevation: 5
  },
  mapControlButtonText: {
    color: '#173042',
    fontSize: 13,
    fontWeight: '800'
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
    shadowOpacity: 0.24,
    shadowRadius: 4
  },
  currentMarkerRing: {
    borderColor: '#111111',
    borderWidth: 3
  },
  markerLabel: {
    fontSize: 12,
    fontWeight: '800'
  },
  currentMarkerLabel: {
    fontSize: 13
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
    borderRadius: 8,
    borderWidth: 1,
    height: 16,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -9,
    position: 'absolute',
    paddingHorizontal: 3,
    top: -8,
    minWidth: 18
  },
  timeCommitBadgeText: {
    color: '#ffffff',
    fontSize: 7,
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
    gap: 10
  },
  calloutTitle: {
    color: '#173042',
    fontSize: 13,
    fontWeight: '800'
  },
  calloutTitleBadge: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#d7e0e8',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 10
  },
  calloutNavButton: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 10,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 54,
    paddingHorizontal: 10
  },
  calloutNavButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  calloutAddress: {
    color: '#5f6b76',
    fontSize: 12,
    marginTop: 3
  },
  calloutContact: {
    color: '#7a848d',
    fontSize: 11,
    marginTop: 4
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
  calloutPackages: {
    color: '#65727d',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 8
  },
  selectedStopCard: {
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderColor: '#e7e2da',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8
  },
  selectedStopCardPressable: {
    marginTop: 8
  },
  groupedCardHeading: {
    flex: 1,
    gap: 2
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
  groupedCardCount: {
    color: '#65727d',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10
  },
  groupedStopTable: {
    gap: 8,
    marginTop: 10
  },
  groupedStopRow: {
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  groupedStopSequenceBadge: {
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    borderColor: '#e0f2fe',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 56,
    paddingHorizontal: 8
  },
  groupedStopSequenceBadgeText: {
    color: '#0f4c81',
    fontSize: 12,
    fontWeight: '800'
  },
  groupedStopMain: {
    flex: 1,
    gap: 3
  },
  groupedStopUnitLabel: {
    color: '#173042',
    fontSize: 15,
    fontWeight: '800'
  },
  groupedStopMeta: {
    color: '#6b7782',
    fontSize: 12,
    fontWeight: '600'
  },
  groupedStopStatusPill: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: 10
  },
  groupedStopStatusPill_pending: {
    backgroundColor: '#eef2f7'
  },
  groupedStopStatusPill_delivered: {
    backgroundColor: '#dcfce7'
  },
  groupedStopStatusPill_pickup_complete: {
    backgroundColor: '#dcfce7'
  },
  groupedStopStatusPill_attempted: {
    backgroundColor: '#fef3c7'
  },
  groupedStopStatusPill_incomplete: {
    backgroundColor: '#fee2e2'
  },
  groupedStopStatusText: {
    fontSize: 11,
    fontWeight: '800'
  },
  groupedStopStatusText_pending: {
    color: '#475569'
  },
  groupedStopStatusText_delivered: {
    color: '#166534'
  },
  groupedStopStatusText_pickup_complete: {
    color: '#166534'
  },
  groupedStopStatusText_attempted: {
    color: '#92400e'
  },
  groupedStopStatusText_incomplete: {
    color: '#b91c1c'
  },
  legendContainer: {
    alignItems: 'flex-end',
    bottom: 168,
    position: 'absolute',
    right: 12,
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
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 20,
    marginTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 8,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8
  },
  laborActionRow: {
    alignItems: 'center',
    marginTop: 10
  },
  laborActionButton: {
    alignItems: 'center',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    width: '68%'
  },
  laborActionButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800'
  },
  clockButton: {
    backgroundColor: '#2f2f2f'
  },
  bottomStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8
  },
  bottomStatColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  bottomStatLabel: {
    color: '#7a8792',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  bottomStatValue: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center'
  },
  completeButton: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#27AE60',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
    width: '68%'
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800'
  },
  buttonDisabled: {
    opacity: 0.6
  },
  headerButton: {
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10
  },
  headerButtonText: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700'
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
