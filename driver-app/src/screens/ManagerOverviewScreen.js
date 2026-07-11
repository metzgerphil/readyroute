import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import RouteMetricIcon from '../components/RouteMetricIcon';
import AppCard from '../components/ui/AppCard';
import AppButton from '../components/ui/AppButton';
import ProgressBar from '../components/ui/ProgressBar';
import StatusBadge from '../components/ui/StatusBadge';
import api from '../services/api';
import {
  buildRouteDetailMapModel,
  formatDriverFreshness,
  getPackageProgress,
  getRouteWarnings,
  getStopIndicatorLabels
} from '../services/managerRouteDetail';
import {
  buildManagerMapModel,
  buildRouteFocusRegion,
  clampSheetOffset,
  getGpsFreshness,
  getDriverInitials,
  getPickupStopCount,
  getRouteColor,
  getRouteDisplayName,
  getSheetSnapLayout,
  getStopCanonicalId,
  resolveNearestSheetSnap,
  sortManagerRoutes
} from '../services/managerOperations';
import appTheme from '../theme/appTheme';

const shouldUseGoogleProvider = Platform.OS === 'android';
const STOP_CARD_FALLBACK_HEIGHT = 104;
const STOP_SCROLL_VIEW_POSITION = 0.08;
const STOP_SCROLL_MAX_RETRIES = 10;
const STOP_SCROLL_RETRY_DELAY_MS = 80;

export function getTodayOperationsDate() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function shiftOperationsDate(dateString, dayOffset) {
  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return getTodayOperationsDate();
  }

  date.setDate(date.getDate() + dayOffset);
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function formatOperationsDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return 'Selected day';
  }

  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

export function formatSyncLabel(timestamp) {
  if (!timestamp) {
    return 'Waiting for route sync';
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return 'Waiting for route sync';
  }

  return `Last sync ${date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })}`;
}

function formatMetricRatio(completed, total) {
  return `${Number(completed || 0)} of ${Number(total || 0)}`;
}

function getRouteExceptionCount(route) {
  if (route?.exception_count != null) {
    return Number(route.exception_count || 0);
  }

  return (route?.stops || []).filter((stop) =>
    Boolean(stop?.exception_code) ||
    ['attempted', 'incomplete', 'pickup_attempted'].includes(stop?.status)
  ).length;
}

function formatStopTimestamp(timestamp) {
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

function formatExceptionCode(code) {
  const value = String(code || '').trim();

  if (!value) {
    return null;
  }

  return /^\d+$/.test(value) ? `Code ${value.padStart(2, '0')}` : `Code ${value.toUpperCase()}`;
}

function formatStatusLabel(status) {
  const rawValue = String(status || '').trim();

  if (!rawValue) {
    return 'Pending';
  }

  return rawValue
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function getStatusTone(status) {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'complete') {
    return 'complete';
  }

  if (normalized === 'in_progress') {
    return 'active';
  }

  if (normalized === 'pending' || normalized === 'assigned') {
    return 'pending';
  }

  return 'neutral';
}

function formatGpsLabel(route) {
  const freshness = getGpsFreshness(route);

  if (freshness.state === 'unavailable' || freshness.elapsedMinutes == null) {
    return freshness.label || 'Location permission needed';
  }

  if (freshness.elapsedMinutes <= 1) {
    return 'Location updated now';
  }

  if (freshness.elapsedMinutes < 60) {
    return `Location updated ${freshness.elapsedMinutes}m ago`;
  }

  if (freshness.elapsedMinutes < 1440) {
    return `Location updated ${Math.round(freshness.elapsedMinutes / 60)}h ago`;
  }

  return `Location updated ${Math.round(freshness.elapsedMinutes / 1440)}d ago`;
}

function getGpsTone(route) {
  const freshness = getGpsFreshness(route);

  if (freshness.state === 'unavailable') {
    return 'danger';
  }

  if (freshness.elapsedMinutes != null && freshness.elapsedMinutes >= 1440) {
    return 'warning';
  }

  return 'neutral';
}

function getProgressPercent(completed, total) {
  const safeTotal = Number(total || 0);

  if (!safeTotal) {
    return 0;
  }

  return Math.round((Number(completed || 0) / safeTotal) * 100);
}

function buildDashboardStats(routes = [], syncStatus = {}) {
  const driverKeys = new Set();

  const totals = (routes || []).reduce((summary, route) => {
    summary.completedStops += Number(route.completed_stops || 0);
    summary.totalStops += Number(route.total_stops || 0);
    summary.deliveredPackages += Number(route.delivered_packages || 0);
    summary.totalPackages += Number(route.total_packages || 0);
    summary.pickupStops += getPickupStopCount(route);
    summary.pickupStopsCompleted += Number(route.pickup_stops_completed || route.completed_pickup_stops || 0);
    summary.exceptions += getRouteExceptionCount(route);

    const driverKey = route.driver_id || route.driver_name;
    if (driverKey) {
      driverKeys.add(String(driverKey));
    }

    return summary;
  }, {
    completedStops: 0,
    deliveredPackages: 0,
    exceptions: 0,
    pickupStops: 0,
    pickupStopsCompleted: 0,
    totalPackages: 0,
    totalStops: 0
  });

  return {
    ...totals,
    driverCount: Number(syncStatus.drivers_on_road ?? driverKeys.size),
    routeCount: Number(syncStatus.routes_today ?? routes.length)
  };
}

function DashboardSummaryCard({ accent = 'orange', icon, label, value }) {
  const iconColor = accent === 'warning'
    ? appTheme.colors.warningText
    : accent === 'purple'
      ? appTheme.colors.purple
      : appTheme.colors.orange;

  return (
    <AppCard style={styles.dashboardSummaryCard}>
      <RouteMetricIcon color={iconColor} name={icon} size={appTheme.icons.lg} />
      <Text style={styles.dashboardSummaryValue}>{value}</Text>
      <Text style={styles.dashboardSummaryLabel}>{label}</Text>
    </AppCard>
  );
}

function DashboardProgressRow({ completed, icon, label, total }) {
  return (
    <View style={styles.dashboardProgressRow}>
      <View style={styles.dashboardProgressHeader}>
        <View style={styles.dashboardProgressTitleRow}>
          <RouteMetricIcon color={appTheme.colors.charcoalSoft} name={icon} size={appTheme.icons.sm} />
          <Text style={styles.dashboardProgressLabel}>{label}</Text>
        </View>
        <Text style={styles.dashboardProgressValue}>{formatMetricRatio(completed, total)}</Text>
      </View>
      <ProgressBar progress={getProgressPercent(completed, total)} />
    </View>
  );
}

function DashboardOverview({ onOpenRoutes, routes, routesAssigned, routesToday, syncStatus, updatedLabel }) {
  const stats = useMemo(() => buildDashboardStats(routes, syncStatus), [routes, syncStatus]);
  const hasPickups = stats.pickupStops > 0;

  return (
    <View style={styles.dashboardOverview}>
      <View style={styles.dashboardSummaryGrid}>
        <DashboardSummaryCard icon="route" label="Routes" value={stats.routeCount} />
        <DashboardSummaryCard accent="purple" icon="drivers" label="Drivers" value={stats.driverCount} />
        <DashboardSummaryCard accent="warning" icon="warning" label="Exceptions" value={stats.exceptions} />
      </View>

      <AppCard style={styles.dashboardProgressCard}>
        <View style={styles.dashboardProgressCardHeader}>
          <View>
            <Text style={styles.dashboardProgressCardTitle}>Operational progress</Text>
            <Text style={styles.dashboardProgressCardMeta}>
              {routesAssigned} of {routesToday} assigned • {updatedLabel}
            </Text>
          </View>
          <AppButton
            label="View All Routes"
            onPress={onOpenRoutes}
            style={styles.viewAllButton}
            textStyle={styles.viewAllButtonText}
            variant="outline"
          />
        </View>

        <DashboardProgressRow
          completed={stats.completedStops}
          icon="stop"
          label="Stops progress"
          total={stats.totalStops}
        />
        <DashboardProgressRow
          completed={stats.deliveredPackages}
          icon="package"
          label="Packages progress"
          total={stats.totalPackages}
        />
        {hasPickups ? (
          <DashboardProgressRow
            completed={stats.pickupStopsCompleted}
            icon="pickup"
            label="Pickups progress"
            total={stats.pickupStops}
          />
        ) : null}
      </AppCard>
    </View>
  );
}

function getStopStableKey(stop) {
  return getStopCanonicalId(stop);
}

function DetailMetric({ icon, label, value, tone = 'default' }) {
  const textColor = tone === 'warning' ? appTheme.colors.warningText : appTheme.colors.textPrimary;
  const iconColor = tone === 'warning' ? appTheme.colors.warningText : appTheme.colors.charcoalSoft;

  return (
    <View style={[styles.detailMetricCell, tone === 'warning' ? styles.detailMetricCellWarning : null]}>
      <View style={styles.detailMetricHeader}>
        <RouteMetricIcon color={iconColor} name={icon} size={appTheme.icons.sm} />
        <Text style={[styles.detailMetricLabel, { color: tone === 'warning' ? appTheme.colors.warningText : appTheme.colors.textSecondary }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.detailMetricValue, { color: textColor }]}>{value}</Text>
    </View>
  );
}

export default function ManagerOverviewScreen({
  csaWorkspaceVersion = 0,
  identity,
  navigation,
  onLogout,
  route
}) {
  const requestedDate = route?.params?.date || null;
  const requestedRouteId = route?.params?.selectedRouteId || null;
  const initialDate = requestedRouteId && requestedDate ? requestedDate : getTodayOperationsDate();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [payload, setPayload] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(requestedRouteId);
  const [selectedRouteDetail, setSelectedRouteDetail] = useState(null);
  const [selectedDriverPosition, setSelectedDriverPosition] = useState(null);
  const [isDetailRefreshing, setIsDetailRefreshing] = useState(false);
  const [routeDetailErrorMessage, setRouteDetailErrorMessage] = useState('');
  const [mapRegion, setMapRegion] = useState(null);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [showRouteDetails, setShowRouteDetails] = useState(false);
  const [sheetMode, setSheetMode] = useState('collapsed');
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetOffsetRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const stopListRef = useRef(null);
  const stopScrollRetryTimeoutRef = useRef(null);
  const sheetLayout = useMemo(
    () => getSheetSnapLayout(Math.max(windowHeight - insets.top, 520)),
    [insets.top, windowHeight]
  );

  async function loadRoutes({ isRefresh = false } = {}) {
    if (isRefresh) {
      setIsRefreshing(true);
    }

    try {
      const response = await api.get('/manager/routes', {
        authMode: 'manager',
        params: {
          date: selectedDate
        }
      });
      const nextPayload = response.data || null;
      const nextRoutes = nextPayload?.routes || [];
      const targetRouteId = selectedRouteId || requestedRouteId;
      const targetRoute = targetRouteId ? nextRoutes.find((item) => item.id === targetRouteId) : null;
      setPayload(nextPayload);
      setErrorMessage('');
      setLastUpdatedAt(new Date().toISOString());
      setSelectedRouteId((current) => {
        const nextSelection = current || requestedRouteId;
        return nextSelection && nextRoutes.some((item) => item.id === nextSelection) ? nextSelection : null;
      });
      if (targetRoute) {
        setMapRegion(buildRouteFocusRegion(targetRoute));
      } else {
        setMapRegion(buildManagerMapModel({ routes: nextRoutes }).region);
      }
    } catch (_error) {
      setErrorMessage('Unable to load manager operations right now.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadRoutes();
  }, [selectedDate, csaWorkspaceVersion]);

  useEffect(() => {
    setSelectedRouteId(null);
    setSelectedRouteDetail(null);
    setSelectedDriverPosition(null);
    setSelectedStopId(null);
    setShowRouteDetails(false);
    setRouteDetailErrorMessage('');
  }, [csaWorkspaceVersion]);

  useEffect(() => {
    if (requestedRouteId && requestedDate && requestedDate !== selectedDate) {
      setSelectedDate(requestedDate);
    }
  }, [requestedDate, requestedRouteId, selectedDate]);

  useEffect(() => {
    if (!requestedRouteId) {
      return;
    }

    setSelectedRouteId(requestedRouteId);
    setShowRouteDetails(false);
    const requestedRoute = routes.find((item) => item.id === requestedRouteId) || null;

    if (requestedRoute) {
      setMapRegion(buildRouteFocusRegion(requestedRoute));
    }

    animateSheetTo('half');
  }, [requestedRouteId, routes]);

  useEffect(() => {
    const nextOffset = sheetLayout.snapOffsets[sheetMode];
    sheetOffsetRef.current = nextOffset;
    sheetTranslateY.setValue(nextOffset);
  }, [sheetLayout, sheetMode, sheetTranslateY]);

  const routes = useMemo(() => sortManagerRoutes(payload?.routes || []), [payload?.routes]);
  const syncStatus = payload?.sync_status || {};
  const mapModel = useMemo(
    () => buildManagerMapModel({ routes, selectedRouteId, region: mapRegion }),
    [routes, selectedRouteId, mapRegion]
  );
  const selectedRoute = mapModel.selectedRoute;
  const selectedRouteSummary = selectedRouteDetail?.route || selectedRoute || null;
  const selectedRouteColor = selectedRouteSummary ? getRouteColor(selectedRouteSummary, routes) : appTheme.colors.orange;
  const selectedRouteStops = useMemo(() => {
    const sourceStops = selectedRouteDetail?.stops || selectedRoute?.stops || [];

    return sourceStops.map((stop) => ({
      ...stop,
      routeColor: selectedRouteColor
    }));
  }, [selectedRoute?.stops, selectedRouteDetail?.stops, selectedRouteColor]);
  const sortedSelectedRouteStops = useMemo(() => {
    if (!selectedRouteStops.length) {
      return [];
    }

    const fallbackStopsById = new Map((selectedRoute?.stops || []).map((stop) => [stop.id, stop]));
    const fallbackStopsBySequence = new Map(
      (selectedRoute?.stops || []).map((stop) => [String(stop.sequence_order || ''), stop])
    );

    return selectedRouteStops.map((stop) => {
      const fallbackStop = fallbackStopsById.get(stop.id) || fallbackStopsBySequence.get(String(stop.sequence_order || ''));

      return fallbackStop
        ? {
            ...fallbackStop,
            ...stop
          }
        : stop;
    }).sort((left, right) => Number(left.sequence_order || 0) - Number(right.sequence_order || 0));
  }, [selectedRoute?.stops, selectedRouteStops]);
  const selectedRouteMapModel = useMemo(
    () => buildRouteDetailMapModel({
      route: selectedRouteSummary,
      stops: sortedSelectedRouteStops,
      driverPosition: selectedDriverPosition,
      routeColor: selectedRouteColor
    }),
    [selectedDriverPosition, sortedSelectedRouteStops, selectedRouteSummary, selectedRouteColor]
  );
  const packageProgress = useMemo(() => getPackageProgress(sortedSelectedRouteStops), [sortedSelectedRouteStops]);
  const routeWarnings = useMemo(() => getRouteWarnings(sortedSelectedRouteStops), [sortedSelectedRouteStops]);
  const selectedStop = useMemo(() => {
    if (!sortedSelectedRouteStops.length) {
      return null;
    }

    return sortedSelectedRouteStops.find((stop) => getStopCanonicalId(stop) === String(selectedStopId)) || null;
  }, [selectedStopId, sortedSelectedRouteStops]);
  const lastUpdatedLabel = lastUpdatedAt
    ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Not refreshed yet';
  const routesAssigned = Number(syncStatus.routes_assigned ?? routes.filter((item) => Boolean(item.driver_name)).length);
  const routesToday = Number(syncStatus.routes_today ?? routes.length);

  function animateSheetTo(nextMode) {
    const nextOffset = sheetLayout.snapOffsets[nextMode];
    sheetOffsetRef.current = nextOffset;
    setSheetMode(nextMode);
    Animated.spring(sheetTranslateY, {
      toValue: nextOffset,
      bounciness: 0,
      speed: 18,
      useNativeDriver: false
    }).start();
  }

  function toggleSheetMode() {
    if (sheetMode === 'collapsed') {
      animateSheetTo('half');
      return;
    }

    if (sheetMode === 'half') {
      animateSheetTo('expanded');
      return;
    }

    animateSheetTo('collapsed');
  }

  function handleSelectRoute(routeId) {
    const route = routes.find((item) => item.id === routeId) || null;

    setSelectedRouteId(routeId);
    setSelectedStopId(null);
    setShowRouteDetails(false);

    if (route) {
      setMapRegion(buildRouteFocusRegion(route));
    }

    animateSheetTo('half');
  }

  function clearStopScrollRetry() {
    if (stopScrollRetryTimeoutRef.current) {
      clearTimeout(stopScrollRetryTimeoutRef.current);
      stopScrollRetryTimeoutRef.current = null;
    }
  }

  function scheduleStopScrollRetry(stopId, attempt) {
    if (attempt >= STOP_SCROLL_MAX_RETRIES) {
      return;
    }

    clearStopScrollRetry();
    stopScrollRetryTimeoutRef.current = setTimeout(() => {
      scrollStopCardIntoView(stopId, attempt + 1);
    }, STOP_SCROLL_RETRY_DELAY_MS);
  }

  function scrollStopCardIntoView(stopId, attempt = 0) {
    const canonicalStopId = String(stopId || '');

    if (!canonicalStopId || !selectedRouteSummary || !sortedSelectedRouteStops.length || !stopListRef.current?.scrollToIndex) {
      return;
    }

    const stopIndex = sortedSelectedRouteStops.findIndex((stop) => getStopCanonicalId(stop) === canonicalStopId);

    if (stopIndex < 0) {
      return;
    }

    clearStopScrollRetry();
    try {
      stopListRef.current.scrollToIndex({
        animated: true,
        index: stopIndex,
        viewPosition: STOP_SCROLL_VIEW_POSITION
      });
    } catch (_error) {
      stopListRef.current?.scrollToOffset?.({
        animated: true,
        offset: Math.max(0, STOP_CARD_FALLBACK_HEIGHT * stopIndex)
      });
      scheduleStopScrollRetry(canonicalStopId, attempt);
    }
  }

  function handleSelectStop(stopId, routeId = null) {
    if (!stopId) {
      return;
    }

    if (routeId && String(routeId) !== String(selectedRouteId || '')) {
      const route = routes.find((item) => String(item.id) === String(routeId)) || null;

      setSelectedRouteId(routeId);
      setSelectedRouteDetail(null);
      setSelectedDriverPosition(null);

      if (route) {
        setMapRegion(buildRouteFocusRegion(route));
      }
    }

    setSelectedStopId(stopId);
    setShowRouteDetails(false);

    const marker = (selectedRouteSummary ? selectedRouteMapModel.stopMarkers : mapModel.stopMarkers).find(
      (item) => String(item.stopId) === String(stopId)
    );

    if (marker?.coordinate) {
      setMapRegion((currentRegion) => ({
        latitude: marker.coordinate.latitude,
        longitude: marker.coordinate.longitude,
        latitudeDelta: Math.min(Number(currentRegion?.latitudeDelta || selectedRouteMapModel.region.latitudeDelta || 0.05), 0.06),
        longitudeDelta: Math.min(Number(currentRegion?.longitudeDelta || selectedRouteMapModel.region.longitudeDelta || 0.05), 0.06)
      }));
    }

  }

  function handleOpenStopDetail(stop) {
    const stopId = getStopCanonicalId(stop);

    if (!stopId) {
      return;
    }

    navigation.navigate('StopDetail', {
      authMode: 'manager',
      stop,
      stopId
    });
  }

  function handleOpenRoutes() {
    navigation.navigate('ManagerRoutes');
  }

  function toggleRouteDetails() {
    setShowRouteDetails((current) => !current);
  }

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        dragStartOffsetRef.current = sheetOffsetRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const nextOffset = clampSheetOffset(dragStartOffsetRef.current + gestureState.dy, sheetLayout);
        sheetTranslateY.setValue(nextOffset);
      },
      onPanResponderRelease: (_, gestureState) => {
        const nextOffset = clampSheetOffset(dragStartOffsetRef.current + gestureState.dy, sheetLayout);
        animateSheetTo(resolveNearestSheetSnap(nextOffset, sheetLayout));
      },
      onPanResponderTerminate: (_, gestureState) => {
        const nextOffset = clampSheetOffset(dragStartOffsetRef.current + gestureState.dy, sheetLayout);
        animateSheetTo(resolveNearestSheetSnap(nextOffset, sheetLayout));
      }
    }),
    [sheetLayout, sheetTranslateY]
  );

  async function loadSelectedRouteDetail() {
    if (!selectedRouteId) {
      setSelectedRouteDetail(null);
      setSelectedDriverPosition(null);
      setSelectedStopId(null);
      setShowRouteDetails(false);
      setRouteDetailErrorMessage('');
      setIsDetailRefreshing(false);
      return;
    }

    setIsDetailRefreshing(true);
    setRouteDetailErrorMessage('');

    try {
      const [detailResponse, driverPositionResponse] = await Promise.all([
        api.get(`/manager/routes/${selectedRouteId}/stops`, {
          authMode: 'manager',
          params: {
            date: selectedDate
          }
        }),
        api.get(`/manager/routes/${selectedRouteId}/driver-position`, {
          authMode: 'manager'
        }).catch(() => ({ data: null }))
      ]);

      const nextDetail = detailResponse.data || null;
      const nextDriverPosition = driverPositionResponse.data || null;
      const mergedStopsForMap = (nextDetail?.stops || []).map((stop) => {
        const fallbackStop = (selectedRoute?.stops || []).find(
          (item) => item.id === stop.id || String(item.sequence_order || '') === String(stop.sequence_order || '')
        );

        return fallbackStop
          ? {
              ...fallbackStop,
              ...stop
            }
          : stop;
      });

      setSelectedRouteDetail(nextDetail);
      setSelectedDriverPosition(nextDriverPosition);
      setMapRegion(
        buildRouteDetailMapModel({
          route: nextDetail?.route || selectedRoute,
          stops: mergedStopsForMap,
          driverPosition: nextDriverPosition,
          routeColor: selectedRouteColor
        }).region
      );
      setRouteDetailErrorMessage('');
    } catch (_error) {
      setSelectedRouteDetail(null);
      setSelectedDriverPosition(null);
      setRouteDetailErrorMessage('Unable to refresh route detail right now.');
    } finally {
      setIsDetailRefreshing(false);
    }
  }

  useEffect(() => {
    loadSelectedRouteDetail();
  }, [selectedDate, selectedRouteId]);

  useEffect(() => {
    clearStopScrollRetry();

    return clearStopScrollRetry;
  }, [selectedRouteId, sortedSelectedRouteStops.length]);

  useEffect(() => {
    if (!selectedRouteSummary || !selectedStopId || !sortedSelectedRouteStops.length) {
      return;
    }

    requestAnimationFrame(() => {
      scrollStopCardIntoView(selectedStopId);
    });
  }, [selectedRouteSummary, selectedStopId, sortedSelectedRouteStops]);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#1b6b73" size="large" />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <MapView
          provider={shouldUseGoogleProvider ? PROVIDER_GOOGLE : undefined}
          region={selectedRouteSummary ? selectedRouteMapModel.region : mapModel.region}
          style={styles.map}
          testID="manager-operations-map"
        >
          {(selectedRouteSummary && selectedRouteMapModel.driverMarker
            ? [
                {
                  key: `driver:${selectedRouteSummary.id}`,
                  routeId: selectedRouteSummary.id,
                  coordinate: selectedRouteMapModel.driverMarker.coordinate,
                  driverInitials: getDriverInitials(selectedRouteMapModel.driverMarker.driverName || selectedRouteSummary.driver_name),
                  gpsFreshness: selectedDriverPosition
                    ? {
                        state: 'live',
                        shortLabel: 'Live'
                      }
                    : getGpsFreshness(selectedRouteSummary)
                }
              ]
            : mapModel.driverMarkers
          ).map((marker) => (
            <Marker coordinate={marker.coordinate} key={marker.key} testID={`driver-marker-${marker.routeId}`}>
              <View style={styles.driverMarker}>
                <Text style={styles.driverMarkerText}>{marker.driverInitials || '--'}</Text>
              </View>
            </Marker>
          ))}

          {(selectedRouteSummary ? selectedRouteMapModel.stopMarkers : mapModel.stopMarkers).map((marker) => (
            <Marker
              coordinate={marker.coordinate}
              key={marker.key}
              onPress={() => handleSelectStop(marker.stopId, marker.routeId)}
              testID={`stop-marker-${marker.stopId}`}
            >
              {(() => {
                const isSelectedMarker = String(selectedStopId || '') === String(marker.stopId || '');
                const hasLongMarkerLabel = String(marker.sequenceOrder || '').length >= 3;

                return (
              <View
                style={[
                  styles.stopMarker,
                  hasLongMarkerLabel ? styles.stopMarkerLarge : null,
                  { backgroundColor: marker.routeColor || appTheme.colors.orange },
                  selectedRouteSummary && marker.routeId === selectedRouteSummary.id ? styles.stopMarkerSelectedRoute : null,
                  marker.status === 'delivered' ? styles.stopMarkerDone : null,
                  marker.hasException ? styles.stopMarkerException : null,
                  isSelectedMarker ? [styles.stopMarkerSelected, { borderColor: marker.routeColor || appTheme.colors.orange }] : null
                ]}
              >
                <Text style={[
                  styles.stopMarkerText,
                  hasLongMarkerLabel ? styles.stopMarkerTextLarge : null,
                  marker.status === 'delivered' || isSelectedMarker ? styles.stopMarkerReadableText : null
                ]}>
                  {marker.sequenceOrder || '•'}
                </Text>
              </View>
                );
              })()}
            </Marker>
          ))}
        </MapView>

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetLayout.expandedHeight,
              transform: [{ translateY: sheetTranslateY }]
            }
          ]}
          testID="manager-operations-sheet"
        >
            <View {...panResponder.panHandlers} style={styles.sheetHandleArea}>
              <Pressable onPress={toggleSheetMode} style={styles.sheetHandleButton}>
                <View style={styles.sheetHandle} />
              </Pressable>
            </View>

          {errorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>Operations unavailable</Text>
              <Text style={styles.errorBody}>{errorMessage}</Text>
              <Pressable onPress={() => loadRoutes()} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              ref={stopListRef}
              ListEmptyComponent={<Text style={styles.emptyBody}>No active routes are loaded for this day yet.</Text>}
              ListHeaderComponent={
                selectedRouteSummary ? (
                  <View style={styles.headerSection}>
                    <View style={styles.routeListHeader}>
                      <Text style={styles.listTitle}>
                        Stops on {selectedRouteSummary.work_area_name ? getRouteDisplayName(selectedRouteSummary) : ''}
                      </Text>
                      <Text style={styles.routeListHeaderMeta}>{sortedSelectedRouteStops.length} stops</Text>
                    </View>

                    <AppCard style={[styles.selectedRouteInlineCard, { borderColor: selectedRouteColor }]}>
                      <View style={[styles.selectedRouteInlineAccent, { backgroundColor: selectedRouteColor }]} />
                      <View style={styles.selectedRouteSummaryHeader}>
                        <View style={styles.selectedRouteSummaryTitleRow}>
                          <Text style={[styles.selectedRouteSummaryNumber, { color: selectedRouteColor }]}>
                            {selectedRouteSummary.work_area_name ? getRouteDisplayName(selectedRouteSummary) : '--'}
                          </Text>
                          <Text numberOfLines={1} style={styles.selectedRouteSummaryDriver}>
                            {selectedRouteSummary.driver_name || 'Unassigned'}
                          </Text>
                        </View>
                        <StatusBadge
                          label={formatStatusLabel(selectedRouteSummary.status)}
                          style={styles.compactBadge}
                          tone={getStatusTone(selectedRouteSummary.status)}
                        />
                      </View>

                      <View style={[
                        styles.selectedRouteLocationPill,
                        selectedDriverPosition || getGpsTone(selectedRouteSummary) === 'active'
                          ? styles.selectedRouteLocationPillActive
                          : null
                      ]}>
                        <RouteMetricIcon
                          color={selectedDriverPosition || getGpsTone(selectedRouteSummary) === 'active' ? appTheme.colors.greenText : appTheme.colors.dangerText}
                          name="location"
                          size={14}
                        />
                        <Text numberOfLines={1} style={[
                          styles.selectedRouteLocationText,
                          selectedDriverPosition || getGpsTone(selectedRouteSummary) === 'active'
                            ? styles.selectedRouteLocationTextActive
                            : null
                        ]}>
                          {selectedDriverPosition ? formatDriverFreshness(selectedDriverPosition) : formatGpsLabel(selectedRouteSummary)}
                        </Text>
                      </View>

                      <View style={styles.selectedRouteStatStrip}>
                        <View style={styles.selectedRouteStatChip}>
                          <Text style={styles.selectedRouteStatLabel}>Stops</Text>
                          <Text style={styles.selectedRouteStatValue}>
                            {formatMetricRatio(selectedRouteSummary.completed_stops, selectedRouteSummary.total_stops)}
                          </Text>
                        </View>
                        <View style={styles.selectedRouteStatChip}>
                          <Text style={styles.selectedRouteStatLabel}>Packages</Text>
                          <Text style={styles.selectedRouteStatValue}>
                            {formatMetricRatio(packageProgress.delivered, packageProgress.total)}
                          </Text>
                        </View>
                        <View style={styles.selectedRouteStatChip}>
                          <Text style={styles.selectedRouteStatLabel}>Exceptions</Text>
                          <Text style={styles.selectedRouteStatValue}>{routeWarnings.exceptions}</Text>
                        </View>
                        <View style={styles.selectedRouteStatChip}>
                          <Text style={styles.selectedRouteStatLabel}>Vehicle</Text>
                          <Text numberOfLines={1} style={styles.selectedRouteStatValue}>
                            {selectedRouteSummary.vehicle_name || 'Not set'}
                          </Text>
                        </View>
                      </View>

                      <Pressable onPress={toggleRouteDetails} style={styles.routeDetailsToggle}>
                        <Text style={styles.routeDetailsToggleText}>
                          {showRouteDetails ? 'Hide route details' : 'Route details'}
                        </Text>
                      </Pressable>
                    </AppCard>

                    {showRouteDetails ? (
                      <AppCard style={styles.selectedRouteCard}>
                        <View style={styles.selectedRouteHeader}>
                          <View style={styles.selectedRouteHeaderCopy}>
                            <Text style={styles.selectedRouteEyebrow}>Route overview</Text>
                            <Text style={styles.selectedRouteTitle}>
                              {selectedRouteSummary.work_area_name ? `Route ${getRouteDisplayName(selectedRouteSummary)}` : 'Selected route'}
                            </Text>
                            <Text style={styles.selectedRouteMeta}>
                              {selectedRouteSummary.driver_name || 'Unassigned'} • {selectedRouteSummary.vehicle_name || 'No vehicle'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.selectedRouteProgressBlock}>
                          <View style={styles.selectedRouteProgressHeader}>
                            <Text style={styles.selectedRouteProgressLabel}>Stop progress</Text>
                            <Text style={styles.selectedRouteProgressValue}>
                              {formatMetricRatio(selectedRouteSummary.completed_stops, selectedRouteSummary.total_stops)} stops
                            </Text>
                          </View>
                          <ProgressBar progress={getProgressPercent(selectedRouteSummary.completed_stops, selectedRouteSummary.total_stops)} />
                        </View>

                        <View style={styles.detailMetricGrid}>
                          <DetailMetric
                            icon="stop"
                            label="Stops"
                            value={`${formatMetricRatio(selectedRouteSummary.completed_stops, selectedRouteSummary.total_stops)} stops`}
                          />
                          <DetailMetric
                            icon="package"
                            label="Packages"
                            value={`${formatMetricRatio(packageProgress.delivered, packageProgress.total)} packages`}
                          />
                          <DetailMetric
                            icon="stopwatch"
                            label="Stops/hr"
                            value={selectedRouteSummary.stops_per_hour == null ? '-- stops/hr' : `${selectedRouteSummary.stops_per_hour} stops/hr`}
                          />
                          <DetailMetric
                            icon="warning"
                            label="Exceptions"
                            tone={routeWarnings.exceptions ? 'warning' : 'default'}
                            value={`${routeWarnings.exceptions} exceptions`}
                          />
                          <DetailMetric
                            icon="commits"
                            label="Commits"
                            tone={routeWarnings.pendingTimeCommits ? 'warning' : 'default'}
                            value={`${routeWarnings.pendingTimeCommits} commits`}
                          />
                          <DetailMetric
                            icon="notes"
                            label="Notes"
                            tone={routeWarnings.notedStops ? 'warning' : 'default'}
                            value={`${routeWarnings.notedStops} notes`}
                          />
                        </View>
                      </AppCard>
                    ) : null}

                    {selectedStop ? (
                      <Pressable onPress={() => handleOpenStopDetail(selectedStop)}>
                        <AppCard style={styles.selectedStopSummaryCard} testID={`selected-stop-summary-${getStopCanonicalId(selectedStop)}`}>
                          <View style={styles.selectedStopSummaryIndex}>
                            <Text style={styles.selectedStopSummaryIndexText}>{selectedStop.sequence_order || '--'}</Text>
                          </View>
                          <View style={styles.selectedStopSummaryCopy}>
                            <Text numberOfLines={2} style={styles.selectedStopSummaryTitle}>
                              {selectedStop.address || 'Address pending'}
                            </Text>
                            {selectedStop.contact_name ? (
                              <Text numberOfLines={1} style={styles.selectedStopSummaryMeta}>{selectedStop.contact_name}</Text>
                            ) : null}
                            <View style={styles.selectedStopSummaryMetrics}>
                              <View style={styles.selectedStopSummaryMetric}>
                                <RouteMetricIcon color={appTheme.colors.charcoalSoft} name="package" size={appTheme.icons.sm} />
                                <Text style={styles.selectedStopSummaryMetricText}>
                                  {(selectedStop.packages || []).length} PKG{(selectedStop.packages || []).length === 1 ? '' : 'S'}
                                </Text>
                              </View>
                              <View style={styles.selectedStopSummaryMetric}>
                                <RouteMetricIcon color={appTheme.colors.charcoalSoft} name="sid" size={appTheme.icons.sm} />
                                <Text style={styles.selectedStopSummaryMetricText}>
                                  {selectedStop.sid ? `SID ${selectedStop.sid}` : 'No SID'}
                                </Text>
                              </View>
                            </View>
                          </View>
                          <Text style={styles.selectedStopSummaryChevron}>›</Text>
                        </AppCard>
                      </Pressable>
                    ) : null}

                    {isDetailRefreshing ? (
                      <Text style={styles.stopPreviewLoading}>Refreshing route detail...</Text>
                    ) : null}
                    {routeDetailErrorMessage ? (
                      <View style={styles.routeDetailErrorCard}>
                        <Text style={styles.routeDetailErrorText}>{routeDetailErrorMessage}</Text>
                        <Pressable onPress={() => loadSelectedRouteDetail()} style={styles.routeDetailRetryButton}>
                          <Text style={styles.routeDetailRetryText}>Retry Route Detail</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.headerSection}>
                    <DashboardOverview
                      onOpenRoutes={handleOpenRoutes}
                      routes={routes}
                      routesAssigned={routesAssigned}
                      routesToday={routesToday}
                      syncStatus={syncStatus}
                      updatedLabel={lastUpdatedLabel}
                    />
                  </View>
                )
              }
              contentContainerStyle={[styles.sheetContent, { paddingBottom: appTheme.spacing.lg + insets.bottom }]}
              data={selectedRouteSummary ? sortedSelectedRouteStops : routes}
              extraData={selectedRouteSummary ? selectedStopId || '' : selectedRoute?.id}
              initialNumToRender={selectedRouteSummary ? Math.max(sortedSelectedRouteStops.length, 12) : 6}
              keyExtractor={(item) => getStopStableKey(item)}
              maxToRenderPerBatch={selectedRouteSummary ? Math.max(sortedSelectedRouteStops.length, 12) : undefined}
              removeClippedSubviews={false}
              onScrollToIndexFailed={({ averageItemLength, index }) => {
                if (
                  !selectedRouteSummary ||
                  !sortedSelectedRouteStops.length ||
                  !stopListRef.current?.scrollToOffset ||
                  !selectedStopId
                ) {
                  return;
                }

                const safeIndex = Math.max(0, Math.min(index, sortedSelectedRouteStops.length - 1));
                const estimatedHeight = Number(averageItemLength || STOP_CARD_FALLBACK_HEIGHT);

                stopListRef.current.scrollToOffset({
                  animated: true,
                  offset: Math.max(0, estimatedHeight * safeIndex)
                });
                scheduleStopScrollRetry(selectedStopId, 0);
              }}
              renderItem={({ item }) => {
                if (selectedRouteSummary) {
                  const labels = getStopIndicatorLabels(item);
                  const stopStableId = getStopCanonicalId(item);
                  const isSelectedStop = stopStableId === String(selectedStopId || '');
                  const packageCount = (item.packages || []).length;
                  const scanTime = formatStopTimestamp(item.scanned_at || item.completed_at);
                  const exceptionCode = formatExceptionCode(item.exception_code);
                  const stopCardRouteColor = item.routeColor || selectedRouteColor;

                  return (
                    <Pressable
                      onPress={() => handleOpenStopDetail(item)}
                      testID={isSelectedStop ? `selected-stop-card-${stopStableId}` : `stop-card-${stopStableId}`}
                    >
                      <AppCard
                        style={[
                          styles.stopCard,
                          isSelectedStop ? [styles.stopCardSelected, { borderColor: stopCardRouteColor }] : null
                        ]}
                      >
                        {isSelectedStop ? <View style={[styles.stopCardSelectedAccent, { backgroundColor: stopCardRouteColor }]} /> : null}
                        <View style={[
                          styles.stopCardIndex,
                          { borderColor: stopCardRouteColor },
                          isSelectedStop ? { backgroundColor: stopCardRouteColor } : null
                        ]}>
                          <Text style={[
                            styles.stopCardIndexText,
                            isSelectedStop ? styles.stopCardIndexTextSelected : null
                          ]}>{item.sequence_order || '--'}</Text>
                        </View>
                        <View style={styles.stopCardCopy}>
                          <Text numberOfLines={2} style={styles.stopCardTitle}>{item.address || 'Address pending'}</Text>
                          {item.contact_name ? <Text numberOfLines={1} style={styles.stopCardMeta}>{item.contact_name}</Text> : null}
                          <View style={styles.stopCardMetricsRow}>
                            <View style={styles.stopCardMetric}>
                              <RouteMetricIcon color="#173042" name="package" size={15} />
                              <Text style={styles.stopCardMetricText}>{packageCount} PKG{packageCount === 1 ? '' : 'S'}</Text>
                            </View>
                            <View style={styles.stopCardMetric}>
                              <RouteMetricIcon color="#173042" name="sid" size={15} />
                              <Text style={styles.stopCardMetricText}>{item.sid ? `SID:${item.sid}` : 'No SID'}</Text>
                            </View>
                          </View>
                          {scanTime ? (
                            <View style={styles.stopCompletionBadge}>
                              <Text style={styles.stopCompletionBadgeText}>{scanTime}</Text>
                            </View>
                          ) : null}
                          {exceptionCode ? (
                            <View style={styles.stopExceptionBadge}>
                              <Text style={styles.stopExceptionBadgeText}>{exceptionCode}</Text>
                            </View>
                          ) : null}
                          {labels.length ? (
                            <View style={styles.stopPreviewBadgeRow}>
                              {labels.map((label) => (
                                <StatusBadge
                                  key={`${item.id}:${label}`}
                                  label={label}
                                  style={styles.stopPreviewBadge}
                                  tone={label.toLowerCase().includes('time') || label.toLowerCase().includes('note') ? 'pending' : 'neutral'}
                                />
                              ))}
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.stopCardChevron}>›</Text>
                      </AppCard>
                    </Pressable>
                  );
                }

                const isSelected = item.id === selectedRoute?.id;
	                const exceptionCount = getRouteExceptionCount(item);
	                const pickupCount = getPickupStopCount(item);
	                const stopProgress = getProgressPercent(item.completed_stops, item.total_stops);
	                const routeColor = getRouteColor(item, routes);
	                const openCommits = Math.max(Number(item.time_commits_total || 0) - Number(item.time_commits_completed || 0), 0);

                return (
                  <Pressable
                    onPress={() => handleSelectRoute(item.id)}
                    style={styles.routeCardPressable}
                  >
                    <AppCard style={[styles.routeCard, isSelected ? [styles.routeCardSelected, { borderColor: routeColor }] : null]}>
                      <View style={[styles.routeCardAccent, { backgroundColor: routeColor }]} />
                      <View style={styles.routeCardContent}>
                        <View style={styles.routeCardHeader}>
                          <View style={styles.routeCardHeaderCopy}>
                            <View style={styles.routeCardTitleRow}>
                              <View style={[styles.routeColorDot, { backgroundColor: routeColor }]} />
                              <Text style={styles.routeCardTitle}>
                                {item.work_area_name ? `Route ${getRouteDisplayName(item)}` : 'Unlabeled route'}
                              </Text>
                            </View>
                            <Text style={styles.routeCardMeta}>
                              {item.driver_name || 'Unassigned'} • {item.vehicle_name || 'No vehicle'}
                            </Text>
                          </View>
                          <StatusBadge label={formatStatusLabel(item.status)} tone={getStatusTone(item.status)} />
                        </View>

                        <View style={styles.routeCardMetricRow}>
                          <View style={styles.routeCardMetricItem}>
                            <RouteMetricIcon color={appTheme.colors.charcoalSoft} name="stop" size={appTheme.icons.md} />
                            <Text style={styles.routeCardMetricText}>
                              {formatMetricRatio(item.completed_stops, item.total_stops)} stops
                            </Text>
                          </View>
                          <View style={styles.routeCardMetricItem}>
                            <RouteMetricIcon color={appTheme.colors.charcoalSoft} name="package" size={appTheme.icons.md} />
                            <Text style={styles.routeCardMetricText}>
                              {formatMetricRatio(item.delivered_packages, item.total_packages)} packages
                            </Text>
                          </View>
                        </View>

                        <ProgressBar progress={stopProgress} style={styles.routeCardProgress} />

	                        <View style={styles.routeCardFooterRow}>
	                          <Text style={styles.routeCardFooterText}>
	                            {item.stops_per_hour == null ? '-- stops/hr' : `${item.stops_per_hour} stops/hr`}
	                          </Text>
	                          {exceptionCount > 0 ? (
	                            <Text style={styles.routeCardFooterWarning}>{exceptionCount} exceptions</Text>
	                          ) : null}
	                        </View>

	                        {pickupCount > 0 || openCommits > 0 ? (
	                          <View style={styles.routeCardFooterRow}>
	                            {pickupCount > 0 ? <Text style={styles.routeCardFooterText}>{pickupCount} pickups</Text> : null}
	                            {openCommits > 0 ? <Text style={styles.routeCardFooterText}>{openCommits} commits</Text> : null}
	                          </View>
	                        ) : null}
                      </View>
                    </AppCard>
                  </Pressable>
                );
              }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: appTheme.colors.background
  },
  container: {
    flex: 1
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.background,
    flex: 1,
    justifyContent: 'center'
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  map: {
    ...StyleSheet.absoluteFillObject
  },
  driverMarker: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.purple,
    borderColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.pill,
    borderWidth: 2,
    height: 34,
    justifyContent: 'center',
    width: 34,
    ...appTheme.shadows.lifted
  },
  driverMarkerText: {
    color: appTheme.colors.textInverse,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  stopMarker: {
    alignItems: 'center',
    borderColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.pill,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    position: 'relative',
    width: 28
  },
  stopMarkerLarge: {
    height: 34,
    width: 34
  },
  stopMarkerDone: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.borderStrong
  },
  stopMarkerException: {
    borderColor: appTheme.colors.dangerText,
    borderWidth: 3
  },
  stopMarkerSelectedRoute: {
    borderWidth: 3
  },
  stopMarkerSelected: {
    backgroundColor: appTheme.colors.surface,
    borderWidth: 3,
    ...appTheme.shadows.lifted,
    transform: [{ scale: 1.08 }]
  },
  stopMarkerText: {
    color: appTheme.colors.textInverse,
    fontSize: 11,
    fontWeight: appTheme.typography.weights.heavy
  },
  stopMarkerTextLarge: {
    fontSize: 12
  },
  stopMarkerReadableText: {
    color: appTheme.colors.textPrimary
  },
  sheet: {
    ...appTheme.shadows.sheet,
    backgroundColor: appTheme.colors.surfaceTint,
    borderTopLeftRadius: appTheme.bottomSheet.radius,
    borderTopRightRadius: appTheme.bottomSheet.radius,
    bottom: -2,
    left: 0,
    position: 'absolute',
    right: 0
  },
  sheetHandleArea: {
    paddingBottom: appTheme.spacing.xs,
    paddingHorizontal: appTheme.bottomSheet.paddingHorizontal,
    paddingTop: appTheme.spacing.sm
  },
  sheetHandleButton: {
    alignItems: 'center',
    paddingBottom: appTheme.spacing.xs
  },
  sheetHandle: {
    backgroundColor: appTheme.colors.mapHandle,
    borderRadius: appTheme.radius.pill,
    height: appTheme.bottomSheet.handleHeight,
    width: appTheme.bottomSheet.handleWidth
  },
  sheetContent: {
    paddingHorizontal: appTheme.bottomSheet.paddingHorizontal
  },
  headerSection: {
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs
  },
  errorCard: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    marginHorizontal: appTheme.spacing.lg,
    marginTop: appTheme.spacing.xs,
    padding: appTheme.spacing.lg
  },
  errorTitle: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs
  },
  errorBody: {
    color: appTheme.colors.infoText,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.charcoal,
    borderRadius: appTheme.radius.pill,
    justifyContent: 'center',
    marginTop: appTheme.spacing.lg,
    minHeight: 40,
    paddingHorizontal: appTheme.spacing.md
  },
  retryText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.label,
    fontWeight: appTheme.typography.weights.bold
  },
  stopPreviewLoading: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  routeDetailErrorCard: {
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    marginBottom: appTheme.spacing.sm,
    padding: appTheme.spacing.md
  },
  routeDetailErrorText: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  routeDetailRetryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.charcoal,
    borderRadius: appTheme.radius.pill,
    justifyContent: 'center',
    marginTop: appTheme.spacing.sm,
    minHeight: 34,
    paddingHorizontal: appTheme.spacing.md
  },
  routeDetailRetryText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  selectedRouteCard: {
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md
  },
  selectedRouteInlineCard: {
    borderWidth: 1.5,
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs,
    overflow: 'hidden',
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  selectedRouteInlineAccent: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 5
  },
  selectedRouteSummaryHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between',
    paddingLeft: appTheme.spacing.xs
  },
  selectedRouteSummaryTitleRow: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    minWidth: 0
  },
  selectedRouteSummaryNumber: {
    color: appTheme.colors.textPrimary,
    flexShrink: 0,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy
  },
  selectedRouteSummaryDriver: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy,
    marginLeft: appTheme.spacing.xs,
    minWidth: 0
  },
  selectedRouteLocationPill: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: appTheme.colors.dangerSoft,
    borderRadius: appTheme.radius.pill,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: appTheme.spacing.sm
  },
  selectedRouteLocationPillActive: {
    backgroundColor: appTheme.colors.greenSoft
  },
  selectedRouteLocationText: {
    color: appTheme.colors.dangerText,
    flexShrink: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    textAlign: 'center'
  },
  selectedRouteLocationTextActive: {
    color: appTheme.colors.greenText
  },
  selectedRouteStatStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingLeft: appTheme.spacing.xs
  },
  selectedRouteStatChip: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexGrow: 1,
    minHeight: 44,
    minWidth: '47%',
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 6
  },
  selectedRouteStatLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  selectedRouteStatValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: 1
  },
  routeDetailsToggle: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: appTheme.spacing.sm
  },
  routeDetailsToggleText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  selectedRouteHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  selectedRouteHeaderCopy: {
    flex: 1,
    paddingRight: appTheme.spacing.md
  },
  selectedRouteEyebrow: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.4,
    marginBottom: appTheme.spacing.xxs,
    textTransform: 'uppercase'
  },
  selectedRouteTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xxs
  },
  selectedRouteMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  selectedRouteBadgeStack: {
    alignItems: 'flex-end',
    gap: 4
  },
  compactBadge: {
    minHeight: 24
  },
  selectedRouteProgressBlock: {
    gap: appTheme.spacing.xs
  },
  selectedRouteProgressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  selectedRouteProgressLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  selectedRouteProgressValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  detailMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  detailMetricCell: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minWidth: '47%',
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: appTheme.spacing.sm
  },
  detailMetricCellWarning: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder
  },
  detailMetricHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  detailMetricLabel: {
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  detailMetricValue: {
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  selectedStopSummaryCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs
  },
  selectedStopSummaryIndex: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.pill,
    borderWidth: 2,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  selectedStopSummaryIndexText: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  selectedStopSummaryCopy: {
    flex: 1,
    gap: 2
  },
  selectedStopSummaryTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.body
  },
  selectedStopSummaryMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall
  },
  selectedStopSummaryMetrics: {
    columnGap: appTheme.spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 2
  },
  selectedStopSummaryMetric: {
    alignItems: 'center',
    columnGap: appTheme.spacing.xs,
    flexDirection: 'row'
  },
  selectedStopSummaryMetricText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  selectedStopSummaryChevron: {
    color: appTheme.colors.textTertiary,
    fontSize: 22,
    fontWeight: appTheme.typography.weights.bold
  },
  stopPreviewBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  stopPreviewBadge: {
    minHeight: 26
  },
  listTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  routeListHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  routeListHeaderCopy: {
    flex: 1,
    gap: appTheme.spacing.xxs
  },
  routeListHeaderMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  viewAllButton: {
    alignSelf: 'flex-start',
    minHeight: appTheme.buttons.compactHeight,
    paddingHorizontal: appTheme.spacing.sm
  },
  viewAllButtonText: {
    fontSize: appTheme.typography.caption
  },
  routeCardPressable: {
    marginBottom: appTheme.spacing.sm
  },
  routeCard: {
    flexDirection: 'row',
    overflow: 'hidden',
    padding: 0
  },
  routeCardSelected: {
    borderColor: appTheme.colors.orange
  },
  routeCardAccent: {
    backgroundColor: appTheme.colors.orange,
    width: 5
  },
  routeCardContent: {
    flex: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  routeCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  routeCardHeaderCopy: {
    flex: 1,
    paddingRight: appTheme.spacing.sm
  },
  routeCardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xxs
  },
  routeColorDot: {
    borderRadius: appTheme.radius.pill,
    height: 10,
    width: 10
  },
  routeCardTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  routeCardMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  routeCardMetricRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.lg
  },
  routeCardMetricItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm
  },
  routeCardMetricText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.semibold
  },
  routeCardProgress: {
    marginTop: appTheme.spacing.xs
  },
  routeCardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  routeCardFooterText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  routeCardFooterWarning: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  dashboardOverview: {
    gap: appTheme.spacing.sm
  },
  dashboardSummaryGrid: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  dashboardSummaryCard: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.sm
  },
  dashboardSummaryValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    textAlign: 'center'
  },
  dashboardSummaryLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textAlign: 'center'
  },
  dashboardProgressCard: {
    gap: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md
  },
  dashboardProgressCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    justifyContent: 'space-between'
  },
  dashboardProgressCardTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  dashboardProgressCardMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: 2
  },
  dashboardProgressRow: {
    gap: appTheme.spacing.xs
  },
  dashboardProgressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  dashboardProgressTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  dashboardProgressLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  dashboardProgressValue: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  routeCardFooterTextWarning: {
    color: appTheme.colors.warningText
  },
  routeCardFooterTextDanger: {
    color: appTheme.colors.dangerText
  },
  emptyBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body,
    paddingVertical: appTheme.spacing.md
  },
  stopCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginBottom: 6,
    overflow: 'hidden',
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 7
  },
  stopCardSelected: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderWidth: 1.5,
    ...appTheme.shadows.card
  },
  stopCardSelectedAccent: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    top: 0,
    width: 4
  },
  stopCardIndex: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.pill,
    borderWidth: 2,
    height: 32,
    justifyContent: 'center',
    marginRight: appTheme.spacing.sm,
    width: 32
  },
  stopCardIndexText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  stopCardIndexTextSelected: {
    color: appTheme.colors.textInverse
  },
  stopCardCopy: {
    flex: 1,
    gap: 3
  },
  stopCardTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  stopCardMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    lineHeight: 16
  },
  stopCardMetricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.sm
  },
  stopCardMetric: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  stopCardMetricText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  stopCompletionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.green,
    borderRadius: appTheme.radius.pill,
    marginTop: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 3
  },
  stopCompletionBadgeText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  stopExceptionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.warningText,
    borderRadius: appTheme.radius.pill,
    marginTop: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 3
  },
  stopCardChevron: {
    alignSelf: 'center',
    color: appTheme.colors.textTertiary,
    fontSize: 22,
    fontWeight: appTheme.typography.weights.bold,
    marginLeft: appTheme.spacing.sm
  },
  stopExceptionBadgeText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  }
});
