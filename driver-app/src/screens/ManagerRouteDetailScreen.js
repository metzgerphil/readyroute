import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import RouteMetricIcon from '../components/RouteMetricIcon';
import api from '../services/api';
import {
  buildRouteDetailMapModel,
  formatDriverFreshness,
  getPackageProgress,
  getRouteWarnings,
  getStopIndicatorLabels
} from '../services/managerRouteDetail';

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const shouldUseGoogleProvider = Platform.OS !== 'ios' || Boolean(String(googleMapsApiKey).trim());

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

function IconMetric({ icon, value }) {
  return (
    <View style={styles.iconMetric}>
      <RouteMetricIcon color="#ffffff" name={icon} size={16} />
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export default function ManagerRouteDetailScreen({ navigation, route }) {
  const initialDate = route?.params?.date || null;
  const routeId = route?.params?.routeId || null;
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [detailPayload, setDetailPayload] = useState(null);
  const [driverPosition, setDriverPosition] = useState(null);

  async function loadRouteDetail({ isRefresh = false } = {}) {
    if (!routeId || !initialDate) {
      setErrorMessage('Route details are missing.');
      setIsLoading(false);
      return;
    }

    if (isRefresh) {
      setIsRefreshing(true);
    }

    try {
      const [detailResponse, driverPositionResponse] = await Promise.all([
        api.get(`/manager/routes/${routeId}/stops`, {
          authMode: 'manager',
          params: {
            date: initialDate
          }
        }),
        api.get(`/manager/routes/${routeId}/driver-position`, {
          authMode: 'manager'
        }).catch(() => ({ data: null }))
      ]);

      setDetailPayload(detailResponse.data || null);
      setDriverPosition(driverPositionResponse.data || null);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to load route detail right now.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadRouteDetail();
  }, [initialDate, routeId]);

  const routeSummary = detailPayload?.route || {};
  const stops = detailPayload?.stops || [];
  const packageProgress = useMemo(() => getPackageProgress(stops), [stops]);
  const warnings = useMemo(() => getRouteWarnings(stops), [stops]);
  const mapModel = useMemo(
    () => buildRouteDetailMapModel({ route: routeSummary, stops, driverPosition }),
    [routeSummary, stops, driverPosition]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#1b6b73" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>Route Drilldown</Text>
              <Text style={styles.heroTitle}>
                {routeSummary.work_area_name ? `Route ${routeSummary.work_area_name}` : 'Route detail'}
              </Text>
              <Text style={styles.heroSubtitle}>
                {routeSummary.driver_name || 'Unassigned'} • {routeSummary.vehicle_name || 'No vehicle'}
              </Text>
            </View>
            <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryPill}>
              <IconMetric icon="stop" value={`${routeSummary.completed_stops || 0}/${routeSummary.total_stops || 0}`} />
            </View>
            <View style={styles.summaryPill}>
              <IconMetric icon="package" value={`${packageProgress.delivered}/${packageProgress.total}`} />
            </View>
            <View style={styles.summaryPill}>
              <IconMetric icon="stopwatch" value={routeSummary.stops_per_hour == null ? '-- stops/hr' : `${routeSummary.stops_per_hour} stops/hr`} />
            </View>
            <View style={styles.summaryPill}>
              <IconMetric icon="warning" value={warnings.exceptions} />
            </View>
          </View>

          <Text style={styles.locationText}>
            {driverPosition ? `${driverPosition.driver_name || routeSummary.driver_name || 'Driver'} at ${driverPosition.lat.toFixed(3)}, ${driverPosition.lng.toFixed(3)}` : 'No recent driver location'}
          </Text>
          <Text style={styles.locationMeta}>{formatDriverFreshness(driverPosition)}</Text>
        </View>

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Route detail unavailable</Text>
            <Text style={styles.errorBody}>{errorMessage}</Text>
            <Pressable onPress={() => loadRouteDetail()} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        {!errorMessage ? (
          <>
            <View style={styles.warningRow}>
              <View style={styles.warningCard}>
                <Text style={styles.warningLabel}>Exceptions</Text>
                <Text style={styles.warningValue}>{warnings.exceptions}</Text>
              </View>
              <View style={styles.warningCard}>
                <Text style={styles.warningLabel}>Time commits</Text>
                <Text style={styles.warningValue}>{warnings.pendingTimeCommits}</Text>
              </View>
              <View style={styles.warningCard}>
                <Text style={styles.warningLabel}>Notes</Text>
                <Text style={styles.warningValue}>{warnings.notedStops}</Text>
              </View>
            </View>

            <Pressable onPress={() => loadRouteDetail({ isRefresh: true })} style={styles.refreshButton}>
              <Text style={styles.refreshButtonText}>{isRefreshing ? 'Refreshing...' : 'Refresh Route'}</Text>
            </Pressable>

            <View style={styles.mapCard}>
              <Text style={styles.sectionTitle}>Route map</Text>
              <MapView
                provider={shouldUseGoogleProvider ? PROVIDER_GOOGLE : undefined}
                region={mapModel.region}
                style={styles.map}
                testID="manager-route-detail-map"
              >
                {mapModel.routeMarker ? (
                  <Marker coordinate={mapModel.routeMarker.coordinate} testID="route-summary-marker">
                    <View style={styles.routeMarker}>
                      <Text style={styles.routeMarkerText}>{mapModel.routeMarker.workAreaName}</Text>
                    </View>
                  </Marker>
                ) : null}
                {mapModel.driverMarker ? (
                  <Marker coordinate={mapModel.driverMarker.coordinate} testID="driver-position-marker">
                    <View style={styles.driverMarker}>
                      <Text style={styles.driverMarkerText}>DRV</Text>
                    </View>
                  </Marker>
                ) : null}
                {mapModel.stopMarkers.map((stopMarker) => (
                  <Marker coordinate={stopMarker.coordinate} key={stopMarker.key} testID={`detail-stop-marker-${stopMarker.key}`}>
                    <View style={[styles.stopMarker, stopMarker.status === 'delivered' ? styles.stopMarkerDone : null]}>
                      <Text style={styles.stopMarkerText}>{stopMarker.sequenceOrder || '•'}</Text>
                    </View>
                  </Marker>
                ))}
              </MapView>
            </View>

            <View style={styles.stopsCard}>
              <Text style={styles.sectionTitle}>Stop list</Text>
              {stops.map((stop) => {
                const labels = getStopIndicatorLabels(stop);
                const scanTime = formatStopTimestamp(stop.scanned_at || stop.completed_at);
                const exceptionCode = formatExceptionCode(stop.exception_code);

                return (
                  <View key={stop.id} style={styles.stopRow}>
                    <View style={styles.stopSequenceBubble}>
                      <Text style={styles.stopSequenceText}>{stop.sequence_order || '--'}</Text>
                    </View>
                    <View style={styles.stopCopy}>
                      <Text style={styles.stopTitle}>{stop.address || 'Address pending'}</Text>
                      <Text style={styles.stopMeta}>
                        {stop.contact_name || 'No contact'} • {(stop.packages || []).length} packages
                      </Text>
                      <Text style={styles.stopMeta}>
                        {stop.status || 'pending'}
                        {stop.ready_time && stop.close_time ? ` • ${stop.ready_time}-${stop.close_time}` : ''}
                        {scanTime ? ` • ${scanTime}` : ''}
                      </Text>
                      {exceptionCode ? (
                        <View style={styles.exceptionCodeBadge}>
                          <Text style={styles.exceptionCodeBadgeText}>{exceptionCode}</Text>
                        </View>
                      ) : null}
                      {labels.length ? (
                        <View style={styles.stopBadgeRow}>
                          {labels.map((label) => (
                            <View key={`${stop.id}:${label}`} style={styles.stopBadge}>
                              <Text style={styles.stopBadgeText}>{label}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#edf3f6'
  },
  content: {
    padding: 18,
    paddingBottom: 28
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#edf3f6',
    flex: 1,
    justifyContent: 'center'
  },
  heroCard: {
    backgroundColor: '#173042',
    borderRadius: 30,
    marginBottom: 16,
    padding: 18
  },
  heroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  heroCopy: {
    flex: 1,
    paddingRight: 12
  },
  eyebrow: {
    color: '#8fd0d7',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 6
  },
  heroSubtitle: {
    color: '#d0dce5',
    fontSize: 15,
    lineHeight: 20
  },
  backButton: {
    backgroundColor: '#22465f',
    borderRadius: 999,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16
  },
  summaryPill: {
    backgroundColor: 'rgba(255,255,255,0.08)',
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
  summaryLabel: {
    color: '#8fd0d7',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase'
  },
  summaryValue: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800'
  },
  locationText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16
  },
  locationMeta: {
    color: '#d0dce5',
    fontSize: 13,
    marginTop: 6
  },
  errorCard: {
    backgroundColor: '#fff1ed',
    borderColor: '#f4cbc2',
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 14,
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
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  warningRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14
  },
  warningCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    padding: 16
  },
  warningLabel: {
    color: '#667784',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8
  },
  warningValue: {
    color: '#173042',
    fontSize: 22,
    fontWeight: '800'
  },
  refreshButton: {
    alignItems: 'center',
    backgroundColor: '#173042',
    borderRadius: 999,
    justifyContent: 'center',
    marginBottom: 14,
    minHeight: 44
  },
  refreshButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  mapCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 14,
    overflow: 'hidden',
    padding: 16
  },
  sectionTitle: {
    color: '#173042',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 12
  },
  map: {
    borderRadius: 20,
    height: 240
  },
  routeMarker: {
    alignItems: 'center',
    backgroundColor: '#173042',
    borderColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
    minHeight: 38,
    minWidth: 38,
    paddingHorizontal: 10
  },
  routeMarkerText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '900'
  },
  driverMarker: {
    alignItems: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 8
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
  stopsCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 24,
    borderWidth: 1,
    padding: 16
  },
  stopRow: {
    alignItems: 'flex-start',
    borderTopColor: '#e5edf1',
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: 14
  },
  stopSequenceBubble: {
    alignItems: 'center',
    backgroundColor: '#173042',
    borderRadius: 999,
    height: 34,
    justifyContent: 'center',
    marginRight: 12,
    width: 34
  },
  stopSequenceText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800'
  },
  stopCopy: {
    flex: 1
  },
  stopTitle: {
    color: '#173042',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
    marginBottom: 6
  },
  stopMeta: {
    color: '#667784',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4
  },
  exceptionCodeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff1e8',
    borderColor: '#fed7aa',
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  exceptionCodeBadgeText: {
    color: '#c2410c',
    fontSize: 11,
    fontWeight: '900'
  },
  stopBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6
  },
  stopBadge: {
    backgroundColor: '#eef3f6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  stopBadgeText: {
    color: '#173042',
    fontSize: 11,
    fontWeight: '800'
  }
});
