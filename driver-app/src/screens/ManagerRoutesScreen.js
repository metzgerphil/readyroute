import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import RouteMetricIcon from '../components/RouteMetricIcon';
import api from '../services/api';

function getTodayDateParam() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getRouteStatusTone(status) {
  if (status === 'in_progress') {
    return styles.statusInProgress;
  }

  if (status === 'complete') {
    return styles.statusComplete;
  }

  return styles.statusPending;
}

function formatStopsPerHour(value) {
  if (value == null) {
    return '-- stops/hr';
  }

  return `${Number(value).toFixed(1).replace(/\.0$/, '')} stops/hr`;
}

function formatGpsFreshness(route) {
  if (!route?.last_position?.timestamp) {
    return 'GPS unavailable';
  }

  const timestamp = new Date(route.last_position.timestamp);

  if (Number.isNaN(timestamp.getTime())) {
    return 'GPS unavailable';
  }

  const elapsedMinutes = Math.max(0, Math.round((Date.now() - timestamp.getTime()) / 60000));

  if (route.is_online) {
    return elapsedMinutes <= 1 ? 'GPS live now' : `GPS live ${elapsedMinutes}m ago`;
  }

  return `GPS stale ${elapsedMinutes}m ago`;
}

function getGpsTone(route) {
  return route?.is_online ? styles.connectivityLive : styles.connectivityStale;
}

function getExceptionCount(route) {
  if (route?.exception_count != null) {
    return Number(route.exception_count || 0);
  }

  return (route?.stops || []).filter((stop) =>
    Boolean(stop?.exception_code) ||
    ['attempted', 'incomplete', 'pickup_attempted'].includes(stop?.status)
  ).length;
}

function RouteMetric({ icon, label, value }) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={styles.routeMetric}>
      <RouteMetricIcon color="#ffffff" name={icon} size={18} />
      <Text style={styles.routeMetricValue}>{value}</Text>
    </View>
  );
}

function RouteCard({ onOpenRoute, route }) {
  const completedStops = Number(route.completed_stops || 0);
  const totalStops = Number(route.total_stops || 0);
  const deliveredPackages = Number(route.delivered_packages || 0);
  const totalPackages = Number(route.total_packages || 0);
  const exceptionCount = getExceptionCount(route);
  const progressPercent = totalStops > 0 ? Math.min(100, Math.max(0, (completedStops / totalStops) * 100)) : 0;

  return (
    <Pressable onPress={() => onOpenRoute?.(route)} style={styles.routeCard}>
      <View style={styles.routeHeader}>
        <View style={styles.routeTitleBlock}>
          <Text style={styles.routeTitle}>
            {route.work_area_name ? `Route ${route.work_area_name}` : 'Unlabeled route'}
          </Text>
          <Text style={styles.routeMeta}>
            {route.driver_name || 'Unassigned'} • {route.vehicle_name || 'No vehicle'}
          </Text>
        </View>

        <View style={styles.routeHeaderActions}>
          <View style={[styles.statusBadge, getRouteStatusTone(route.status)]}>
            <Text style={styles.statusBadgeText}>{route.status || 'pending'}</Text>
          </View>
          <Pressable accessibilityLabel={`Route ${route.work_area_name || route.id} actions`} style={styles.overflowButton}>
            <Text style={styles.overflowText}>...</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <RouteMetric icon="stop" label="Stops" value={`${completedStops}/${totalStops}`} />
        <RouteMetric icon="package" label="Packages" value={`${deliveredPackages}/${totalPackages}`} />
        <RouteMetric icon="stopwatch" label="Stops per hour" value={formatStopsPerHour(route.stops_per_hour)} />
        <RouteMetric icon="warning" label="Exceptions" value={exceptionCount} />
      </View>

      <View accessibilityLabel={`${Math.round(progressPercent)} percent of route stops completed`} style={styles.routeProgressTrack}>
        <View style={[styles.routeProgressFill, { width: `${progressPercent}%` }]} />
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.routeRate}>{exceptionCount ? `${exceptionCount} exception${exceptionCount === 1 ? '' : 's'}` : 'No scanner exceptions'}</Text>
        <View style={[styles.connectivityPill, getGpsTone(route)]}>
          <Text style={styles.connectivityText}>{formatGpsFreshness(route)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function ManagerRoutesScreen({ navigation }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [payload, setPayload] = useState(null);

  async function loadRoutes({ isRefresh = false } = {}) {
    if (isRefresh) {
      setIsRefreshing(true);
    }

    try {
      const response = await api.get('/manager/routes', {
        authMode: 'manager',
        params: {
          date: getTodayDateParam()
        }
      });

      setPayload(response.data || null);
      setErrorMessage('');
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Unable to load manager routes right now.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    loadRoutes();
  }, []);

  const routes = payload?.routes || [];
  const syncStatus = payload?.sync_status || {};

  function openRouteDetail(routeItem) {
    navigation?.navigate('ManagerOverview', {
      selectedRouteId: routeItem.id,
      date: getTodayDateParam()
    });
  }

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#1b6b73" size="large" />
      </View>
    );
  }

  const header = (
    <>
      {errorMessage ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Routes unavailable</Text>
          <Text style={styles.errorBody}>{errorMessage}</Text>
          <Pressable onPress={() => loadRoutes()} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Routes</Text>
              <Text style={styles.summaryValue}>{syncStatus.routes_today || 0}</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Assigned</Text>
              <Text style={styles.summaryValue}>{syncStatus.routes_assigned || 0}</Text>
            </View>
          </View>
          <Pressable onPress={() => loadRoutes({ isRefresh: true })} style={styles.refreshButton}>
            <Text style={styles.refreshButtonText}>{isRefreshing ? 'Refreshing...' : 'Refresh Routes'}</Text>
          </Pressable>
        </>
      )}
    </>
  );

  return (
    <ManagerSectionLayout
      eyebrow="Manager Routes"
      scrollEnabled={false}
      subtitle={`Assigned ${syncStatus.routes_assigned || 0} of ${syncStatus.routes_today || 0} routes today`}
      title="Active routes"
    >
      <FlatList
        ListEmptyComponent={!errorMessage ? <Text style={styles.emptyText}>No routes are loaded for today yet.</Text> : null}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        data={errorMessage ? [] : routes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RouteCard onOpenRoute={openRouteDetail} route={item} />}
        showsVerticalScrollIndicator={false}
      />
    </ManagerSectionLayout>
  );
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#edf3f6',
    flex: 1,
    justifyContent: 'center'
  },
  listContent: {
    paddingBottom: 24
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
    marginTop: 16,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 14
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700'
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12
  },
  summaryCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d8e2e8',
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    padding: 18
  },
  summaryLabel: {
    color: '#667784',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8
  },
  summaryValue: {
    color: '#173042',
    fontSize: 28,
    fontWeight: '800'
  },
  refreshButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#dfecef',
    borderRadius: 999,
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 38,
    paddingHorizontal: 14
  },
  refreshButtonText: {
    color: '#173042',
    fontSize: 13,
    fontWeight: '800'
  },
  routeCard: {
    backgroundColor: '#111820',
    borderColor: '#24313a',
    borderRadius: 22,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14
  },
  routeHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  routeTitleBlock: {
    flex: 1,
    paddingRight: 10
  },
  routeHeaderActions: {
    alignItems: 'flex-end',
    gap: 8
  },
  routeTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 2
  },
  routeMeta: {
    color: '#c5d0d8',
    fontSize: 12,
    lineHeight: 16
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  statusBadgeText: {
    color: '#173042',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'capitalize'
  },
  overflowButton: {
    alignItems: 'center',
    backgroundColor: '#f2c94c',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 30,
    minWidth: 30
  },
  overflowText: {
    color: '#111820',
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18
  },
  metricsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 12
  },
  routeMetric: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6
  },
  routeMetricValue: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800'
  },
  routeProgressTrack: {
    backgroundColor: '#123840',
    borderRadius: 999,
    height: 7,
    marginBottom: 10,
    overflow: 'hidden'
  },
  routeProgressFill: {
    backgroundColor: '#14b8c9',
    borderRadius: 999,
    height: '100%'
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10
  },
  routeRate: {
    color: '#c5d0d8',
    flex: 1,
    fontSize: 12,
    fontWeight: '700'
  },
  connectivityPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6
  },
  connectivityLive: {
    backgroundColor: '#dff3eb'
  },
  connectivityStale: {
    backgroundColor: '#f2ece4'
  },
  connectivityText: {
    color: '#173042',
    fontSize: 10,
    fontWeight: '800'
  },
  statusPending: {
    backgroundColor: '#e8eef2'
  },
  statusInProgress: {
    backgroundColor: '#dff3eb'
  },
  statusComplete: {
    backgroundColor: '#efe6ff'
  },
  emptyText: {
    color: '#667784',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8
  }
});

export { formatGpsFreshness, formatStopsPerHour, getTodayDateParam };
