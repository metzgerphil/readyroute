import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import MapView, { Callout, Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';

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

export function getMapRegion({ currentStop, currentLocation }) {
  const stopCoordinate = toCoordinate(currentStop);

  if (stopCoordinate) {
    return {
      ...stopCoordinate,
      latitudeDelta: 0.035,
      longitudeDelta: 0.035
    };
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

export function getStopStatusColors(status, isCurrentStop, stopType, stop) {
  if (isCurrentStop) {
    return { fill: '#1a2332', border: '#101826', text: '#ffffff' };
  }

  if (stopType === 'pickup' || stop?.has_time_commit) {
    return { fill: '#2980b9', border: '#1f618d', text: '#ffffff' };
  }

  if (stop?.is_business) {
    return { fill: '#ffffff', border: '#4d148c', text: '#111111' };
  }

  if (stop?.is_apartment_unit || stop?.apartment_intelligence) {
    return { fill: '#ffffff', border: '#ff6200', text: '#111111' };
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

function MapPin({ isCurrentStop, now, stop }) {
  const stopType = getStopType(stop);
  const colors = getStopStatusColors(stop.status, isCurrentStop, stopType, stop);
  const hasTimeCommit = Boolean(stop.has_time_commit);
  const hasNote = Boolean(stop.has_note);
  const isApartment = Boolean(stop.is_apartment_unit || stop.apartment_intelligence);
  const pinSize = isCurrentStop ? 36 : 30;
  const ringSize = isCurrentStop ? 44 : 38;
  const mainLabel = stopType === 'pickup' || hasTimeCommit ? '+' : String(stop.sequence_order);
  const urgency = hasTimeCommit ? getTimeCommitUrgency(stop, now) : null;
  const urgencyStyles = getUrgencyStyles(urgency?.level);
  const pulseValue = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasTimeCommit || !urgency || (urgency.level !== 'urgent' && urgency.level !== 'overdue')) {
      pulseValue.stopAnimation();
      pulseValue.setValue(1);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, {
          toValue: 1.12,
          duration: 650,
          useNativeDriver: true
        }),
        Animated.timing(pulseValue, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true
        })
      ])
    );

    loop.start();

    return () => {
      loop.stop();
      pulseValue.setValue(1);
    };
  }, [hasTimeCommit, pulseValue, urgency?.level]);

  return (
    <Animated.View style={[styles.markerWrap, urgency && { transform: [{ scale: pulseValue }] }]}>
      <View style={[styles.markerRing, hasTimeCommit && urgencyStyles.ringStyle, { height: ringSize, width: ringSize }]}>
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
          <Text style={[styles.markerLabel, { color: colors.text }, stopType === 'pickup' && styles.markerPickupLabel]}>
            {mainLabel}
          </Text>

          {stop.is_business ? (
            <View style={styles.businessBadge}>
              <Text style={styles.businessBadgeText}>B</Text>
            </View>
          ) : null}

          {hasTimeCommit ? (
            <View style={[styles.timeCommitBadge, urgencyStyles.badgeStyle]}>
              <Text style={[styles.timeCommitBadgeText, urgencyStyles.badgeTextStyle]}>+</Text>
            </View>
          ) : null}

          {isApartment ? (
            <View style={styles.apartmentBadge}>
              <Text style={styles.apartmentBadgeText}>A</Text>
            </View>
          ) : null}

          {stopType === 'combined' ? (
            <View style={styles.combinedBadge}>
              <Text style={styles.combinedBadgeText}>+</Text>
            </View>
          ) : null}

          {hasNote ? (
            <View style={styles.noteBadge}>
              <Text style={styles.noteBadgeText}>✏</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Animated.View>
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
            <View style={[styles.legendDot, styles.legendDotPickup]}><Text style={styles.legendPickupText}>+</Text></View>
            <Text style={styles.legendRowText}>Pickup stop</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, styles.legendDotPickup]}><Text style={styles.legendPickupText}>+</Text></View>
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
              <View style={styles.legendMiniPickup}><Text style={styles.legendMiniText}>+</Text></View>
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
  const lastAutoCenteredStopIdRef = useRef(null);
  const [route, setRoute] = useState(null);
  const [stops, setStops] = useState([]);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [loadError, setLoadError] = useState(null);

  const pendingStops = useMemo(() => getPendingStops(stops), [stops]);
  const mappableStops = useMemo(() => getMappableStops(stops), [stops]);
  const nextPendingStop = pendingStops[0] || null;
  const selectedStop = useMemo(
    () => stops.find((stop) => stop.id === selectedStopId) || nextPendingStop || null,
    [nextPendingStop, selectedStopId, stops]
  );
  const stopsPerHourLabel = getStopsPerHourLabel(route?.stops_per_hour);
  const bannerBadges = getVisibleBannerBadges(selectedStop);
  const timeCommitAlertBadge = useMemo(() => getTimeCommitAlertBadge(selectedStop, currentTime), [currentTime, selectedStop]);
  const quickIntel = getQuickIntel(selectedStop);
  const stopTools = getCompactStopTools(selectedStop);
  const initialRegion = useMemo(
    () => getMapRegion({ currentStop: selectedStop, currentLocation }),
    [currentLocation, selectedStop]
  );

  useEffect(() => {
    if (!selectedStopId && nextPendingStop?.id) {
      setSelectedStopId(nextPendingStop.id);
    }
  }, [nextPendingStop?.id, selectedStopId]);

  useEffect(() => {
    const incomingSelectedStopId = screenRoute?.params?.selectedStopId;

    if (incomingSelectedStopId) {
      setSelectedStopId(incomingSelectedStopId);
      navigation.setParams({ selectedStopId: undefined });
    }
  }, [navigation, screenRoute?.params?.selectedStopId]);

  useEffect(() => {
    lastAutoCenteredStopIdRef.current = null;
  }, [selectedStop?.id]);

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

    async function bootstrap() {
      try {
        await Location.requestForegroundPermissionsAsync();
        const position = await Location.getCurrentPositionAsync({});

        if (isMounted) {
          setCurrentLocation(position);
        }
      } catch (_error) {
        // Location is optional for initial render.
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
    const currentStopCoordinate = toCoordinate(selectedStop);

    if (!map || !currentStopCoordinate) {
      return;
    }

    if (lastAutoCenteredStopIdRef.current === selectedStop.id) {
      return;
    }

    map.animateCamera(
      {
        center: currentStopCoordinate
      },
      { duration: 500 }
    );
    lastAutoCenteredStopIdRef.current = selectedStop.id;
  }, [selectedStop?.id]);

  async function refreshRoute({ allowStateUpdate = true, showAlert = true, isRetry = false } = {}) {
    if (allowStateUpdate && isRetry) {
      setIsRetryingLoad(true);
    }

    try {
      const response = await api.get('/routes/today');
      const nextRoute = response.data?.route || null;

      if (!allowStateUpdate) {
        return;
      }

      setRoute(nextRoute);
      setStops(nextRoute?.stops || []);
      setLoadError(null);
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

  async function handleOpenNavigation() {
    if (!selectedStop?.address) {
      return;
    }

    const { nativeGoogleMapsUrl, webGoogleMapsUrl } = buildGoogleNavigationUrls(selectedStop.address);

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

  function handleSelectStop(stopId) {
    setSelectedStopId(stopId);
  }

  function handleRecenter() {
    const map = mapRef.current;
    const currentStopCoordinate = toCoordinate(selectedStop);

    if (!map || !currentStopCoordinate) {
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

  if (!route || !selectedStop) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.emptyTitle}>No active stop right now</Text>
          <Text style={styles.emptyText}>Your route is either complete or still waiting to be assigned.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <MapView
          // Let the driver use the map like a normal phone map.
          initialRegion={initialRegion}
          provider={PROVIDER_GOOGLE}
          ref={mapRef}
          rotateEnabled
          scrollEnabled
          showsUserLocation
          zoomEnabled
          style={styles.map}
        >
          {currentLocation?.coords ? (
            <Marker
              coordinate={{
                latitude: currentLocation.coords.latitude,
                longitude: currentLocation.coords.longitude
              }}
              pinColor="#2563eb"
              title="Current location"
            />
          ) : null}

          {mappableStops.map((stop) => {
            const coordinate = toCoordinate(stop);

            if (!coordinate) {
              return null;
            }

            const isCurrentStop = stop.id === selectedStop.id;
            const timeCommitCallout = getTimeCommitCallout(stop);
            const timeCommitUrgency = getTimeCommitUrgency(stop, currentTime);
            const urgencyStyles = getUrgencyStyles(timeCommitUrgency?.level);
            const packageCount = stop.packages?.length || 0;

            return (
              <Marker coordinate={coordinate} key={stop.id} onPress={() => handleSelectStop(stop.id)} testID={`stop-marker-${stop.id}`}>
                <MapPin isCurrentStop={isCurrentStop} now={currentTime} stop={stop} />
                <Callout onPress={() => handleOpenStopDetail(stop.id)} tooltip={false}>
                  <View style={styles.calloutCard}>
                    <Text style={styles.calloutTitle}>ST#{stop.sequence_order}</Text>
                    <Text numberOfLines={2} style={styles.calloutAddress}>
                      {stop.address}
                    </Text>
                    {timeCommitCallout ? (
                      <>
                        <Text style={[styles.calloutWindowTitle, urgencyStyles.calloutStyle]}>{timeCommitCallout.title}</Text>
                        {timeCommitCallout.subtitle ? (
                          <Text style={[styles.calloutWindowSubtitle, urgencyStyles.calloutTextStyle]}>{timeCommitCallout.subtitle}</Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.calloutWindowSubtitle}>Tap to open stop details</Text>
                    )}
                    <Text style={styles.calloutPackages}>
                      {packageCount} {packageCount === 1 ? 'package' : 'packages'}
                    </Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}
        </MapView>

        <View pointerEvents="box-none" style={styles.topOverlay}>
          <View style={styles.banner}>
            <View style={styles.bannerMetaRow}>
              <View style={styles.bannerMetaPill}>
                <Text style={styles.bannerMetaPillText}>Selected ST#{selectedStop.sequence_order}</Text>
              </View>
              {nextPendingStop?.sequence_order && nextPendingStop.sequence_order !== selectedStop.sequence_order ? (
                <View style={[styles.bannerMetaPill, styles.bannerMetaPillMuted]}>
                  <Text style={[styles.bannerMetaPillText, styles.bannerMetaPillTextMuted]}>
                    Next ST#{nextPendingStop.sequence_order}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.bannerAddressRow}>
              <Pressable onPress={() => handleOpenStopDetail(selectedStop.id)} style={styles.bannerContentButton}>
                <Text numberOfLines={2} style={styles.bannerAddress}>
                  {selectedStop.address}
                </Text>
              </Pressable>
              <Pressable onPress={handleOpenNavigation} style={styles.navigateButton}>
                <Text style={styles.navigateButtonText}>Nav</Text>
              </Pressable>
            </View>
            <Pressable onPress={() => handleOpenStopDetail(selectedStop.id)} style={styles.bannerDetailsPressable}>
              {selectedStop.contact_name ? <Text style={styles.bannerContact}>Attn: {selectedStop.contact_name}</Text> : null}
              {bannerBadges.length || timeCommitAlertBadge ? (
                <View style={styles.bannerBadgeRow}>
                  {bannerBadges.map((badge) => (
                    <View key={`${badge.type}-${badge.label}`} style={[styles.bannerPill, styles[`bannerPill_${badge.type}`]]}>
                      <Text style={[styles.bannerPillText, styles[`bannerPillText_${badge.type}`]]}>{badge.label}</Text>
                    </View>
                  ))}
                  {timeCommitAlertBadge ? (
                    <View style={[styles.bannerPill, styles[`bannerPill_${timeCommitAlertBadge.type}`]]}>
                      <Text style={[styles.bannerPillText, styles[`bannerPillText_${timeCommitAlertBadge.type}`]]}>
                        {timeCommitAlertBadge.label}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.bannerPackages}>
                {selectedStop.packages?.length || 0} {(selectedStop.packages?.length || 0) === 1 ? 'package' : 'packages'}
              </Text>
            </Pressable>
            {quickIntel.length ? (
              <View style={styles.quickIntelRow}>
                {quickIntel.map((item) => (
                  <View key={item.key} style={[styles.quickIntelChip, styles[`quickIntelChip_${item.tone}`]]}>
                    <Text style={[styles.quickIntelChipText, styles[`quickIntelChipText_${item.tone}`]]}>{item.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>

        <MapLegend expanded={legendExpanded} onToggle={() => setLegendExpanded((current) => !current)} />

        <View style={styles.mapControlStack}>
          <Pressable onPress={handleRecenter} style={styles.mapControlButton}>
            <Text style={styles.mapControlButtonText}>Center</Text>
          </Pressable>
          <Pressable onPress={() => handleOpenStopDetail(selectedStop.id)} style={styles.mapControlButton}>
            <Text style={styles.mapControlButtonText}>Intel</Text>
          </Pressable>
        </View>

        <View pointerEvents="box-none" style={styles.bottomOverlay}>
          <View style={styles.toolsPanel}>
            <View style={styles.toolsChipRow}>
              {stopTools.map((tool) => (
                <Pressable
                  key={tool.key}
                  onPress={() => handleOpenStopDetail(selectedStop.id)}
                  style={[styles.toolsChip, styles[`toolsChip_${tool.tone}`]]}
                >
                  <Text style={[styles.toolsChipText, styles[`toolsChipText_${tool.tone}`]]}>{tool.label}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => handleOpenStopDetail(selectedStop.id)} style={[styles.toolsChip, styles.toolsChip_note]}>
                <Text style={[styles.toolsChipText, styles.toolsChipText_note]}>Open details</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.bottomBar}>
            <Text style={styles.stopsPerHour}>{stopsPerHourLabel}</Text>
            <Pressable
              disabled={isSubmitting}
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
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 10
  },
  bottomOverlay: {
    bottom: 0,
    left: 0,
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
  bannerPackages: {
    color: '#65727d',
    fontSize: 15,
    marginTop: 2
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
  navigateButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  toolsPanel: {
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderColor: '#e7e2da',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 6
    },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6
  },
  toolsChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  toolsChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  toolsChip_apartment: {
    backgroundColor: '#f5f3ff'
  },
  toolsChip_location: {
    backgroundColor: '#ecfeff'
  },
  toolsChip_note: {
    backgroundColor: '#fff3e8'
  },
  toolsChipText: {
    fontSize: 12,
    fontWeight: '800'
  },
  toolsChipText_apartment: {
    color: '#6d28d9'
  },
  toolsChipText_location: {
    color: '#0f766e'
  },
  toolsChipText_note: {
    color: '#c45100'
  },
  map: {
    flex: 1
  },
  mapControlStack: {
    gap: 10,
    position: 'absolute',
    right: 12,
    top: 184,
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
    justifyContent: 'center'
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
  markerLabel: {
    fontSize: 13,
    fontWeight: '800'
  },
  markerPickupLabel: {
    fontSize: 18,
    marginTop: -1
  },
  businessBadge: {
    alignItems: 'center',
    backgroundColor: '#4d148c',
    borderRadius: 7,
    bottom: -1,
    height: 14,
    justifyContent: 'center',
    position: 'absolute',
    right: -1,
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
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -7,
    position: 'absolute',
    top: -7,
    width: 14
  },
  timeCommitBadgeText: {
    color: '#ffffff',
    fontSize: 10,
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
    left: -1,
    position: 'absolute',
    top: -1,
    width: 14
  },
  apartmentBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800'
  },
  combinedBadge: {
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
  combinedBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900'
  },
  noteBadge: {
    alignItems: 'center',
    backgroundColor: '#ff6200',
    borderRadius: 7,
    bottom: -1,
    height: 14,
    justifyContent: 'center',
    left: -1,
    position: 'absolute',
    width: 14
  },
  noteBadgeText: {
    color: '#ffffff',
    fontSize: 8,
    fontWeight: '800'
  },
  calloutCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    maxWidth: 220,
    minWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  calloutTitle: {
    color: '#173042',
    fontSize: 13,
    fontWeight: '800'
  },
  calloutAddress: {
    color: '#5f6b76',
    fontSize: 12,
    marginTop: 3
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
    backgroundColor: '#FF6200',
    borderColor: '#ffffff',
    borderRadius: 7,
    borderWidth: 1,
    height: 14,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -7,
    position: 'absolute',
    top: -3,
    width: 14
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
    marginTop: 10,
    paddingBottom: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: 8
    },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 8
  },
  stopsPerHour: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center'
  },
  completeButton: {
    alignItems: 'center',
    backgroundColor: '#27AE60',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 54,
    width: '100%'
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
