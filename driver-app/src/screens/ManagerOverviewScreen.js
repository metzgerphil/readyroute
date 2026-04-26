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
  buildManagerOverviewStats,
  buildRouteFocusRegion,
  clampSheetOffset,
  getGpsFreshness,
  getSheetSnapLayout,
  resolveNearestSheetSnap
} from '../services/managerOperations';

const shouldUseGoogleProvider = Platform.OS === 'android';

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
  return `${Number(completed || 0)}/${Number(total || 0)}`;
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

function IconMetric({ color = '#173042', icon, value }) {
  return (
    <View style={styles.iconMetric}>
      <RouteMetricIcon color={color} name={icon} size={16} />
      <Text style={[styles.iconMetricValue, { color }]}>{value}</Text>
    </View>
  );
}

const STOP_CARD_ESTIMATED_HEIGHT = 116;

export default function ManagerOverviewScreen({
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
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedRouteDetail, setSelectedRouteDetail] = useState(null);
  const [selectedDriverPosition, setSelectedDriverPosition] = useState(null);
  const [isDetailRefreshing, setIsDetailRefreshing] = useState(false);
  const [routeDetailErrorMessage, setRouteDetailErrorMessage] = useState('');
  const [mapRegion, setMapRegion] = useState(null);
  const [selectedStopId, setSelectedStopId] = useState(null);
  const [sheetMode, setSheetMode] = useState('collapsed');
  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const sheetOffsetRef = useRef(0);
  const dragStartOffsetRef = useRef(0);
  const stopListRef = useRef(null);
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
      setPayload(nextPayload);
      setErrorMessage('');
      setLastUpdatedAt(new Date().toISOString());
      setSelectedRouteId((current) => (current && nextRoutes.some((route) => route.id === current) ? current : null));
      if (!selectedRouteId) {
        setMapRegion(buildManagerMapModel({ routes: nextRoutes }).region);
      }
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to load manager operations right now.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadRoutes();
  }, [selectedDate]);

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

  const routes = payload?.routes || [];
  const syncStatus = payload?.sync_status || {};
  const liveDriversCount = routes.filter((route) => route.is_online).length;
  const mapModel = useMemo(
    () => buildManagerMapModel({ routes, selectedRouteId, region: mapRegion }),
    [routes, selectedRouteId, mapRegion]
  );
  const overviewStats = useMemo(() => buildManagerOverviewStats(routes), [routes]);
  const selectedRoute = mapModel.selectedRoute;
  const selectedRouteSummary = selectedRouteDetail?.route || selectedRoute || null;
  const selectedRouteStops = selectedRouteDetail?.stops || selectedRoute?.stops || [];
  const selectedRouteStopsForMap = useMemo(() => {
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
    });
  }, [selectedRoute?.stops, selectedRouteStops]);
  const selectedRouteMapModel = useMemo(
    () => buildRouteDetailMapModel({
      route: selectedRouteSummary,
      stops: selectedRouteStopsForMap,
      driverPosition: selectedDriverPosition
    }),
    [selectedDriverPosition, selectedRouteStopsForMap, selectedRouteSummary]
  );
  const packageProgress = useMemo(() => getPackageProgress(selectedRouteStops), [selectedRouteStops]);
  const routeWarnings = useMemo(() => getRouteWarnings(selectedRouteStops), [selectedRouteStops]);
  const lastUpdatedLabel = lastUpdatedAt
    ? `Updated ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
    : 'Not refreshed yet';

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

    if (route) {
      setMapRegion(buildRouteFocusRegion(route));
    }

    animateSheetTo('half');
  }

  function handleClusterPress(routeIds = []) {
    const clusterRoutes = routes.filter((route) => routeIds.includes(route.id));
    const clusterRegion = buildManagerMapModel({ routes: clusterRoutes }).region;
    setMapRegion(clusterRegion);
    setSelectedRouteId(null);
    setSelectedStopId(null);
    animateSheetTo('collapsed');
  }

  function handleSelectStop(stopId) {
    setSelectedStopId(stopId);
    animateSheetTo('expanded');
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
          driverPosition: nextDriverPosition
        }).region
      );
      setRouteDetailErrorMessage('');
    } catch (error) {
      setSelectedRouteDetail(null);
      setSelectedDriverPosition(null);
      setRouteDetailErrorMessage(error.response?.data?.error || 'Unable to refresh route detail right now.');
    } finally {
      setIsDetailRefreshing(false);
    }
  }

  useEffect(() => {
    loadSelectedRouteDetail();
  }, [selectedDate, selectedRouteId]);

  useEffect(() => {
    if (!selectedRouteSummary || !selectedStopId || !selectedRouteStops.length) {
      return;
    }

    const stopIndex = selectedRouteStops.findIndex((stop) => stop.id === selectedStopId);

    if (stopIndex < 0 || !stopListRef.current?.scrollToIndex) {
      return;
    }

    stopListRef.current.scrollToIndex({
      animated: true,
      index: stopIndex,
      viewPosition: 0.15
    });
  }, [selectedRouteStops, selectedRouteSummary, selectedStopId]);

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
          {(selectedRouteSummary && selectedRouteMapModel.routeMarker
            ? [
                {
                  kind: 'route',
                  key: `route:${selectedRouteSummary.id}`,
                  routeId: selectedRouteSummary.id,
                  coordinate: selectedRouteMapModel.routeMarker.coordinate,
                  selected: true,
                  workAreaName: selectedRouteSummary.work_area_name || '--'
                }
              ]
            : mapModel.routeMarkers
          ).map((marker) => (
            <Marker
              coordinate={marker.coordinate}
              key={marker.key}
              onPress={() => {
                if (marker.kind === 'route' && marker.routeId) {
                  handleSelectRoute(marker.routeId);
                }

                if (marker.kind === 'cluster') {
                  handleClusterPress(marker.routeIds);
                }
              }}
              testID={marker.kind === 'cluster' ? `route-cluster-${marker.count}` : `route-marker-${marker.routeId}`}
            >
              <View style={[styles.routeMarker, marker.kind === 'cluster' ? styles.clusterMarker : null, marker.selected ? styles.routeMarkerSelected : null]}>
                {marker.kind === 'route' ? (
                  <View style={[styles.routeMarkerStatusDot, getGpsFreshness(routes.find((route) => route.id === marker.routeId)).state === 'live' ? styles.routeMarkerStatusDotLive : styles.routeMarkerStatusDotStale]} />
                ) : null}
                <Text style={styles.routeMarkerText}>
                  {marker.kind === 'cluster' ? `${marker.count}` : marker.workAreaName}
                </Text>
              </View>
            </Marker>
          ))}

          {(selectedRouteSummary && selectedRouteMapModel.driverMarker
            ? [
                {
                  key: `driver:${selectedRouteSummary.id}`,
                  routeId: selectedRouteSummary.id,
                  coordinate: selectedRouteMapModel.driverMarker.coordinate,
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
              <View style={[styles.driverMarker, marker.gpsFreshness.state === 'live' ? styles.driverMarkerLive : styles.driverMarkerIdle]}>
                <Text style={styles.driverMarkerText}>{marker.gpsFreshness.shortLabel}</Text>
              </View>
            </Marker>
          ))}

          {(selectedRouteSummary ? selectedRouteMapModel.stopMarkers : mapModel.stopMarkers).map((marker) => (
            <Marker
              coordinate={marker.coordinate}
              key={marker.key}
              onPress={() => handleSelectStop(marker.stopId)}
              testID={`stop-marker-${marker.stopId}`}
            >
              <View style={[styles.stopMarker, marker.status === 'delivered' ? styles.stopMarkerDone : null]}>
                <Text style={styles.stopMarkerText}>{marker.sequenceOrder || '•'}</Text>
              </View>
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
                  <View style={styles.selectedRouteCard}>
                    <View style={styles.selectedRouteHeader}>
                      <View style={styles.selectedRouteHeaderCopy}>
                        <Text style={styles.selectedRouteTitle}>
                          {selectedRouteSummary.work_area_name ? `Route ${selectedRouteSummary.work_area_name}` : 'Selected route'}
                        </Text>
                        <Text style={styles.selectedRouteMeta}>
                          {selectedRouteSummary.driver_name || 'Unassigned'} • {selectedRouteSummary.vehicle_name || 'No vehicle'}
                        </Text>
                      </View>
                      <View style={styles.selectedRouteStatusPill}>
                        <Text style={styles.selectedRouteStatusText}>
                          {selectedDriverPosition ? formatDriverFreshness(selectedDriverPosition) : getGpsFreshness(selectedRouteSummary).label}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.selectedRouteMetricsRow}>
                      <View style={styles.selectedRouteMetric}>
                        <IconMetric color="#ffffff" icon="stop" value={formatMetricRatio(selectedRouteSummary.completed_stops, selectedRouteSummary.total_stops)} />
                      </View>
                      <View style={styles.selectedRouteMetric}>
                        <IconMetric color="#ffffff" icon="package" value={formatMetricRatio(packageProgress.delivered, packageProgress.total)} />
                      </View>
                      <View style={styles.selectedRouteMetric}>
                        <IconMetric color="#ffffff" icon="stopwatch" value={selectedRouteSummary.stops_per_hour == null ? '-- stops/hr' : `${selectedRouteSummary.stops_per_hour} stops/hr`} />
                      </View>
                      <View style={styles.selectedRouteMetric}>
                        <IconMetric color="#ffffff" icon="warning" value={routeWarnings.exceptions} />
                      </View>
                    </View>

                    <View style={styles.warningInlineRow}>
                      <View style={styles.warningInlinePill}>
                        <Text style={styles.warningInlineLabel}>Exceptions {routeWarnings.exceptions}</Text>
                      </View>
                      <View style={styles.warningInlinePill}>
                        <Text style={styles.warningInlineLabel}>Commits {routeWarnings.pendingTimeCommits}</Text>
                      </View>
                      <View style={styles.warningInlinePill}>
                        <Text style={styles.warningInlineLabel}>Notes {routeWarnings.notedStops}</Text>
                      </View>
                    </View>

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

                    <View style={styles.routeListHeader}>
                      <Text style={styles.listTitle}>Stops on route</Text>
                      <Text style={styles.routeListHeaderMeta}>{selectedRouteStops.length} stops</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <View style={styles.scoreboardGrid}>
                      <View style={styles.scoreCard}>
                        <View style={styles.scoreCardHeader}>
                          <Text style={styles.scoreCardLabel}>Total routes</Text>
                          <Text style={styles.scoreCardAccent}>{overviewStats.liveDrivers} live</Text>
                        </View>
                        <Text style={styles.scoreCardValue}>
                          {formatMetricRatio(overviewStats.routeSummary.completed, overviewStats.routeSummary.total)}
                        </Text>
                        <Text style={styles.scoreCardMeta}>Completed</Text>
                      </View>

                      <View style={styles.scoreCard}>
                        <View style={styles.scoreCardHeader}>
                          <Text style={styles.scoreCardLabel}>Commits</Text>
                          <Text style={styles.scoreCardAlert}>
                            {Math.max(overviewStats.commitSummary.total - overviewStats.commitSummary.completed, 0)} open
                          </Text>
                        </View>
                        <Text style={styles.scoreCardValue}>
                          {formatMetricRatio(overviewStats.commitSummary.completed, overviewStats.commitSummary.total)}
                        </Text>
                        <Text style={styles.scoreCardMeta}>Completed / total</Text>
                      </View>

                      <View style={[styles.scoreCard, styles.scoreCardWide]}>
                        <View style={styles.scoreCardHeader}>
                          <Text style={styles.scoreCardLabel}>Stop status</Text>
                          <Text style={styles.scoreCardAlert}>
                            {overviewStats.stopSummary.exception} exceptions
                          </Text>
                        </View>
                        <Text style={styles.scoreCardValue}>
                          {formatMetricRatio(overviewStats.stopSummary.completed, overviewStats.stopSummary.total)}
                        </Text>
                        <Text style={styles.scoreCardMeta}>Delivered / total stops</Text>
                      </View>

                      <View style={[styles.scoreCard, styles.scoreCardWide]}>
                        <View style={styles.scoreCardHeader}>
                          <Text style={styles.scoreCardLabel}>Package status</Text>
                          <Text style={styles.scoreCardAccent}>
                            {overviewStats.packageSummary.pending} pending
                          </Text>
                        </View>
                        <Text style={styles.scoreCardValue}>
                          {formatMetricRatio(overviewStats.packageSummary.completed, overviewStats.packageSummary.total)}
                        </Text>
                        <Text style={styles.scoreCardMeta}>Delivered / total packages</Text>
                      </View>
                    </View>
                    <View style={styles.routeListHeader}>
                      <Text style={styles.listTitle}>Routes in view</Text>
                      <Text style={styles.routeListHeaderMeta}>{lastUpdatedLabel}</Text>
                    </View>
                  </>
                )
              }
              contentContainerStyle={styles.sheetContent}
              data={selectedRouteSummary ? selectedRouteStops : routes}
              getItemLayout={selectedRouteSummary
                ? (_, index) => ({
                    length: STOP_CARD_ESTIMATED_HEIGHT,
                    offset: STOP_CARD_ESTIMATED_HEIGHT * index,
                    index
                  })
                : undefined}
              keyExtractor={(item) => item.id}
              onScrollToIndexFailed={({ index }) => {
                if (!selectedRouteSummary || !stopListRef.current?.scrollToOffset) {
                  return;
                }

                stopListRef.current.scrollToOffset({
                  animated: true,
                  offset: STOP_CARD_ESTIMATED_HEIGHT * index
                });
              }}
              renderItem={({ item }) => {
                if (selectedRouteSummary) {
                  const labels = getStopIndicatorLabels(item);
                  const isSelectedStop = item.id === selectedStopId;

                  return (
                    <View
                      style={[styles.stopCard, isSelectedStop ? styles.stopCardSelected : null]}
                      testID={isSelectedStop ? `selected-stop-card-${item.id}` : `stop-card-${item.id}`}
                    >
                      <View style={styles.stopCardIndex}>
                        <Text style={styles.stopCardIndexText}>{item.sequence_order || '--'}</Text>
                      </View>
                      <View style={styles.stopCardCopy}>
                        <Text style={styles.stopCardTitle}>{item.address || 'Address pending'}</Text>
                        <Text style={styles.stopCardMeta}>
                          {item.contact_name || 'No contact'} • {(item.packages || []).length} packages • {item.status || 'pending'}
                        </Text>
                        {labels.length ? (
                          <View style={styles.stopPreviewBadgeRow}>
                            {labels.map((label) => (
                              <View key={`${item.id}:${label}`} style={styles.stopPreviewBadge}>
                                <Text style={styles.stopPreviewBadgeText}>{label}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    </View>
                  );
                }

                const isSelected = item.id === selectedRoute?.id;

                return (
                    <Pressable
                      onPress={() => handleSelectRoute(item.id)}
                      style={[styles.routeCard, isSelected ? styles.routeCardSelected : null]}
                    >
                      <View style={styles.routeCardHeader}>
                        <View style={styles.routeCardHeaderCopy}>
                          <Text style={styles.routeCardTitle}>
                            {item.work_area_name ? `Route ${item.work_area_name}` : 'Unlabeled route'}
                          </Text>
                          <Text style={styles.routeCardMeta}>
                            {item.driver_name || 'Unassigned'} • {item.vehicle_name || 'No vehicle'}
                          </Text>
                        </View>
                        <View style={[styles.routeCardBadge, getGpsFreshness(item).state === 'live' ? styles.routeCardBadgeLive : styles.routeCardBadgeIdle]}>
                          <Text style={[styles.routeCardBadgeText, getGpsFreshness(item).state === 'live' ? styles.routeCardBadgeTextLive : styles.routeCardBadgeTextIdle]}>
                            {getGpsFreshness(item).shortLabel}
                          </Text>
                        </View>
                      </View>

                    <View style={styles.routeCardMetricsRow}>
                      <View style={styles.routeCardMetric}>
                        <IconMetric icon="stop" value={formatMetricRatio(item.completed_stops, item.total_stops)} />
                      </View>
                      <View style={styles.routeCardMetric}>
                        <IconMetric icon="package" value={formatMetricRatio(item.delivered_packages, item.total_packages)} />
                      </View>
                      <View style={styles.routeCardMetric}>
                        <IconMetric icon="stopwatch" value={item.stops_per_hour == null ? '-- stops/hr' : `${item.stops_per_hour} stops/hr`} />
                      </View>
                      <View style={styles.routeCardMetric}>
                        <IconMetric icon="warning" value={getRouteExceptionCount(item)} />
                      </View>
                    </View>

                    <View style={styles.routeCardFooter}>
                      <Text style={styles.routeCardFootnote}>{getGpsFreshness(item).label}</Text>
                      <Text style={styles.routeCardFootnote}>
                        {Number(item.time_commits_total || 0) - Number(item.time_commits_completed || 0)} commits open
                      </Text>
                    </View>
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
    backgroundColor: '#edf3f6'
  },
  container: {
    flex: 1
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#edf3f6',
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
  routeMarker: {
    alignItems: 'center',
    backgroundColor: '#ff7a1a',
    borderColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 38,
    paddingHorizontal: 10,
    position: 'relative'
  },
  routeMarkerStatusDot: {
    borderColor: '#ffffff',
    borderRadius: 999,
    borderWidth: 1.5,
    height: 10,
    position: 'absolute',
    right: -3,
    top: -3,
    width: 10
  },
  routeMarkerStatusDotLive: {
    backgroundColor: '#16a34a'
  },
  routeMarkerStatusDotStale: {
    backgroundColor: '#94a3b8'
  },
  routeMarkerSelected: {
    backgroundColor: '#ff7a1a'
  },
  clusterMarker: {
    backgroundColor: '#ff7a1a'
  },
  routeMarkerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900'
  },
  driverMarker: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 8
  },
  driverMarkerLive: {
    backgroundColor: '#16a34a'
  },
  driverMarkerIdle: {
    backgroundColor: '#64748b'
  },
  driverMarkerText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900'
  },
  stopMarker: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#ff7a1a',
    borderRadius: 999,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  stopMarkerDone: {
    borderColor: '#16a34a'
  },
  stopMarkerText: {
    color: '#173042',
    fontSize: 11,
    fontWeight: '800'
  },
  sheet: {
    backgroundColor: '#f7f4ee',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    bottom: -2,
    left: 0,
    position: 'absolute',
    right: 0,
    shadowColor: '#0f172a',
    shadowOffset: {
      width: 0,
      height: -8
    },
    shadowOpacity: 0.16,
    shadowRadius: 18
  },
  sheetHandleArea: {
    paddingBottom: 8,
    paddingHorizontal: 18,
    paddingTop: 12
  },
  sheetHandleButton: {
    alignItems: 'center',
    paddingBottom: 6
  },
  sheetHandle: {
    backgroundColor: '#c7d0d8',
    borderRadius: 999,
    height: 5,
    width: 52
  },
  sheetHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  sheetEyebrow: {
    color: '#5d7683',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 4,
    textTransform: 'uppercase'
  },
  sheetTitle: {
    color: '#173042',
    fontSize: 22,
    fontWeight: '800'
  },
  sheetModeBadge: {
    backgroundColor: '#fff0e4',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  sheetModeBadgeText: {
    color: '#ff7a1a',
    fontSize: 12,
    fontWeight: '800'
  },
  sheetSubtitle: {
    color: '#667784',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6
  },
  sheetContent: {
    paddingBottom: 40,
    paddingHorizontal: 18
  },
  scoreboardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14
  },
  scoreCard: {
    backgroundColor: '#ff7a1a',
    borderRadius: 24,
    minHeight: 134,
    padding: 16,
    width: '48%'
  },
  scoreCardWide: {
    width: '100%'
  },
  scoreCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12
  },
  scoreCardLabel: {
    color: '#fff4eb',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  scoreCardAccent: {
    color: '#173042',
    fontSize: 12,
    fontWeight: '800'
  },
  scoreCardAlert: {
    color: '#173042',
    fontSize: 12,
    fontWeight: '800'
  },
  scoreCardValue: {
    color: '#ffffff',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 38
  },
  scoreCardMeta: {
    color: '#fff4eb',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6
  },
  errorCard: {
    backgroundColor: '#fff5f2',
    borderColor: '#f2d4cb',
    borderRadius: 22,
    borderWidth: 1,
    marginHorizontal: 18,
    marginTop: 4,
    padding: 18
  },
  errorTitle: {
    color: '#9b271f',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8
  },
  errorBody: {
    color: '#6f4a45',
    fontSize: 15,
    lineHeight: 22
  },
  retryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#173042',
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 40,
    paddingHorizontal: 14
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  focusCard: {
    backgroundColor: '#fffaf4',
    borderColor: '#f4d8c6',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18
  },
  focusHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  focusHeaderCopy: {
    flex: 1,
    paddingRight: 10
  },
  focusTitle: {
    color: '#173042',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4
  },
  focusMeta: {
    color: '#667784',
    fontSize: 14,
    lineHeight: 20
  },
  livePill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  livePillOn: {
    backgroundColor: '#e7f8ed'
  },
  livePillOff: {
    backgroundColor: '#eef2f5'
  },
  livePillText: {
    fontSize: 12,
    fontWeight: '800'
  },
  livePillTextOn: {
    color: '#17603a'
  },
  livePillTextOff: {
    color: '#566472'
  },
  focusMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16
  },
  focusMetric: {
    backgroundColor: '#232b32',
    borderRadius: 18,
    flex: 1,
    padding: 12
  },
  focusMetricLabel: {
    color: '#ffb989',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6
  },
  focusMetricValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22
  },
  stopPreviewSection: {
    marginTop: 16
  },
  stopPreviewTitle: {
    color: '#173042',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10
  },
  stopPreviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingVertical: 6
  },
  stopPreviewDot: {
    backgroundColor: '#ff7a1a',
    borderRadius: 999,
    height: 10,
    marginRight: 10,
    width: 10
  },
  stopPreviewDotDone: {
    backgroundColor: '#16a34a'
  },
  stopPreviewText: {
    color: '#52626f',
    flex: 1,
    fontSize: 14,
    lineHeight: 20
  },
  stopPreviewCopy: {
    flex: 1
  },
  stopPreviewMeta: {
    color: '#758694',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2
  },
  stopPreviewBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8
  },
  stopPreviewBadge: {
    backgroundColor: '#eef3f6',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5
  },
  stopPreviewBadgeText: {
    color: '#173042',
    fontSize: 11,
    fontWeight: '800'
  },
  stopPreviewLoading: {
    color: '#667784',
    fontSize: 13,
    lineHeight: 18
  },
  routeDetailErrorCard: {
    backgroundColor: '#fff5f2',
    borderColor: '#f2d4cb',
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    padding: 12
  },
  routeDetailErrorText: {
    color: '#8f2d23',
    fontSize: 13,
    lineHeight: 18
  },
  routeDetailRetryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#173042',
    borderRadius: 999,
    justifyContent: 'center',
    marginTop: 10,
    minHeight: 34,
    paddingHorizontal: 12
  },
  routeDetailRetryText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  selectedRouteCard: {
    backgroundColor: '#fff5ec',
    borderColor: '#ffcfad',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    padding: 18
  },
  selectedRouteHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  selectedRouteHeaderCopy: {
    flex: 1,
    paddingRight: 10
  },
  selectedRouteTitle: {
    color: '#173042',
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4
  },
  selectedRouteMeta: {
    color: '#667784',
    fontSize: 14,
    lineHeight: 20
  },
  selectedRouteStatusPill: {
    backgroundColor: '#ff7a1a',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  selectedRouteStatusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800'
  },
  selectedRouteMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16
  },
  selectedRouteMetric: {
    backgroundColor: '#ff7a1a',
    borderRadius: 18,
    flex: 1,
    minWidth: '45%',
    padding: 12
  },
  iconMetric: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  iconMetricValue: {
    fontSize: 13,
    fontWeight: '800'
  },
  selectedRouteMetricLabel: {
    color: '#fff4eb',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6
  },
  selectedRouteMetricValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22
  },
  warningInlineRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14
  },
  warningInlinePill: {
    backgroundColor: '#ffe7d3',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  warningInlineLabel: {
    color: '#173042',
    fontSize: 11,
    fontWeight: '800'
  },
  listTitle: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '800',
  },
  routeListHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10
  },
  routeListHeaderMeta: {
    color: '#667784',
    fontSize: 12,
    fontWeight: '800'
  },
  routeCard: {
    backgroundColor: '#fff5ec',
    borderColor: '#ffd1b2',
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  routeCardSelected: {
    borderColor: '#ff7a1a',
    borderWidth: 2,
    backgroundColor: '#ffe7d3'
  },
  routeCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  routeCardHeaderCopy: {
    flex: 1,
    paddingRight: 10
  },
  routeCardTitle: {
    color: '#173042',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2
  },
  routeCardMeta: {
    color: '#667784',
    fontSize: 12,
    lineHeight: 16
  },
  routeCardBadge: {
    borderRadius: 999,
    minWidth: 62,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  routeCardBadgeLive: {
    backgroundColor: '#e7f8ed'
  },
  routeCardBadgeIdle: {
    backgroundColor: '#eef2f5'
  },
  routeCardBadgeText: {
    fontSize: 11,
    fontWeight: '800'
  },
  routeCardBadgeTextLive: {
    color: '#17603a'
  },
  routeCardBadgeTextIdle: {
    color: '#566472'
  },
  routeCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8
  },
  routeCardMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8
  },
  routeCardMetric: {
    backgroundColor: '#ffe7d3',
    borderRadius: 12,
    flex: 1,
    minWidth: '47%',
    paddingHorizontal: 8,
    paddingVertical: 7
  },
  routeCardMetricLabel: {
    color: '#667784',
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 3,
    textTransform: 'uppercase'
  },
  routeCardMetricValue: {
    color: '#173042',
    fontSize: 13,
    fontWeight: '800'
  },
  routeCardFootnote: {
    color: '#52626f',
    fontSize: 11,
    fontWeight: '700'
  },
  emptyBody: {
    color: '#667784',
    fontSize: 15,
    lineHeight: 22,
    paddingVertical: 12
  },
  stopCard: {
    alignItems: 'flex-start',
    backgroundColor: '#ffffff',
    borderColor: '#ffd1b2',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 14
  },
  stopCardSelected: {
    backgroundColor: '#fff0e2',
    borderColor: '#ff7a1a',
    borderWidth: 2
  },
  stopCardIndex: {
    alignItems: 'center',
    backgroundColor: '#ff7a1a',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    marginRight: 12,
    width: 32
  },
  stopCardIndexText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  stopCardCopy: {
    flex: 1
  },
  stopCardTitle: {
    color: '#173042',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20
  },
  stopCardMeta: {
    color: '#667784',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4
  }
});
