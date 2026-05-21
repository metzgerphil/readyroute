import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RouteMetricIcon from '../components/RouteMetricIcon';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import ProgressBar from '../components/ui/ProgressBar';
import api from '../services/api';
import { getPickupStopCount, getRouteDisplayName, sortManagerRoutes } from '../services/managerOperations';
import appTheme from '../theme/appTheme';

function getTodayDateParam() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatDashboardDate(dateString = getTodayDateParam()) {
  const date = new Date(`${dateString}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return 'Today';
  }

  const day = date.getDate();
  const suffix = day % 10 === 1 && day !== 11
    ? 'st'
    : day % 10 === 2 && day !== 12
      ? 'nd'
      : day % 10 === 3 && day !== 13
        ? 'rd'
        : 'th';

  return `${date.toLocaleDateString([], { month: 'long' })} ${day}${suffix}, ${date.getFullYear()}`;
}

function formatRatio(completed, total) {
  return `${Number(completed || 0)} / ${Number(total || 0)}`;
}

function getRemaining(completed, total) {
  return Math.max(Number(total || 0) - Number(completed || 0), 0);
}

function getProgressPercent(completed, total) {
  const safeTotal = Number(total || 0);
  return safeTotal > 0 ? Math.round((Number(completed || 0) / safeTotal) * 100) : 0;
}

function getWorkspaceDisplayName(...candidates) {
  const placeholderNames = new Set(['current csa']);

  for (const candidate of candidates) {
    const name = String(candidate || '').trim();

    if (name && !placeholderNames.has(name.toLowerCase())) {
      return name;
    }
  }

  return 'CSA workspace';
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

function buildDashboardStats(routes = [], syncStatus = {}) {
  const driverKeys = new Set();

  const stats = (routes || []).reduce((summary, route) => {
    const driverKey = route.driver_id || route.driver_name;
    if (driverKey) {
      driverKeys.add(String(driverKey));
    }

    summary.completedStops += Number(route.completed_stops || 0);
    summary.totalStops += Number(route.total_stops || 0);
    summary.deliveredPackages += Number(route.delivered_packages || 0);
    summary.totalPackages += Number(route.total_packages || 0);
    summary.pickupStops += getPickupStopCount(route);
    summary.pickupStopsCompleted += Number(route.pickup_stops_completed || route.completed_pickup_stops || 0);
    summary.exceptions += getExceptionCount(route);

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
    ...stats,
    drivers: Number(syncStatus.drivers_on_road ?? driverKeys.size),
    routes: Number(syncStatus.routes_today ?? routes.length)
  };
}

function getImportantRoutes(routes = []) {
  return [...routes]
    .sort((left, right) => {
      const exceptionDelta = getExceptionCount(right) - getExceptionCount(left);
      if (exceptionDelta !== 0) {
        return exceptionDelta;
      }

      const leftActive = left.status === 'in_progress' ? 1 : 0;
      const rightActive = right.status === 'in_progress' ? 1 : 0;
      if (rightActive !== leftActive) {
        return rightActive - leftActive;
      }

      return Number(right.total_stops || 0) - Number(left.total_stops || 0);
    })
    .slice(0, 4);
}

function MetricCard({ accent = 'orange', icon, label, value }) {
  const iconColor = accent === 'warning'
    ? appTheme.colors.warningText
    : accent === 'purple'
      ? appTheme.colors.purple
      : appTheme.colors.orange;

  return (
    <AppCard style={styles.metricCard}>
      <RouteMetricIcon color={iconColor} name={icon} size={appTheme.icons.lg} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </AppCard>
  );
}

function ProgressCard({ completed, icon, label, total }) {
  const remaining = getRemaining(completed, total);

  return (
    <AppCard style={styles.progressCard}>
      <View style={styles.progressHeader}>
        <View style={styles.progressTitleRow}>
          <RouteMetricIcon color={appTheme.colors.charcoalSoft} name={icon} size={appTheme.icons.md} />
          <Text style={styles.progressLabel}>{label}</Text>
        </View>
        <Text style={styles.progressValue}>{formatRatio(completed, total)}</Text>
      </View>
      <ProgressBar progress={getProgressPercent(completed, total)} />
      <Text style={styles.progressMeta}>{remaining} left</Text>
    </AppCard>
  );
}

function RouteOverviewCard({ onPress, route }) {
  const exceptionCount = getExceptionCount(route);
  const pickupCount = getPickupStopCount(route);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.routeCardPressable, pressed ? styles.pressed : null]}>
      <AppCard style={styles.routeCard}>
        <View style={styles.routeHeader}>
          <View style={styles.routeTitleBlock}>
            <Text style={styles.routeTitle}>{route.work_area_name ? `Route ${getRouteDisplayName(route)}` : 'Unlabeled route'}</Text>
            <Text numberOfLines={1} style={styles.routeMeta}>{route.driver_name || 'Unassigned driver'}</Text>
          </View>
          <Text style={styles.routeChevron}>›</Text>
        </View>

        <View style={styles.routeMetricGrid}>
          <Text style={styles.routeMetricText}>{route.stops_per_hour == null ? '-- stops/hr' : `${route.stops_per_hour} stops/hr`}</Text>
          <Text style={styles.routeMetricText}>{route.vehicle_name || route.vehicle_id || 'No vehicle'}</Text>
        </View>

        <View style={styles.routeProgressLine}>
          <Text style={styles.routeProgressLabel}>Stops</Text>
          <Text style={styles.routeProgressValue}>{formatRatio(route.completed_stops, route.total_stops)}</Text>
        </View>
        <ProgressBar progress={getProgressPercent(route.completed_stops, route.total_stops)} />

        <View style={styles.routeProgressLine}>
          <Text style={styles.routeProgressLabel}>Packages</Text>
          <Text style={styles.routeProgressValue}>{formatRatio(route.delivered_packages, route.total_packages)}</Text>
        </View>
        <ProgressBar progress={getProgressPercent(route.delivered_packages, route.total_packages)} />

        <View style={styles.routeFooter}>
          {pickupCount > 0 ? <Text style={styles.routeFooterText}>{pickupCount} pickups</Text> : <View />}
          {exceptionCount > 0 ? <Text style={styles.routeWarningText}>{exceptionCount} exceptions</Text> : null}
        </View>
      </AppCard>
    </Pressable>
  );
}

export default function ManagerDashboardScreen({ csaWorkspaceVersion = 0, identity, navigation }) {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [csaPayload, setCsaPayload] = useState(null);
  const [payload, setPayload] = useState(null);
  const date = getTodayDateParam();

  async function loadDashboard() {
    setIsLoading(true);

    try {
      const [routesResult, csasResult] = await Promise.allSettled([
        api.get('/manager/routes', {
          authMode: 'manager',
          params: { date }
        }),
        api.get('/manager/csas', {
          authMode: 'manager'
        })
      ]);

      if (routesResult.status === 'rejected') {
        throw routesResult.reason;
      }

      setPayload(routesResult.value?.data || null);
      setCsaPayload(csasResult.status === 'fulfilled' ? csasResult.value?.data || null : null);
      setErrorMessage('');
    } catch (_error) {
      setErrorMessage('Manager dashboard could not be loaded right now.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, [csaWorkspaceVersion]);

  const routes = useMemo(() => sortManagerRoutes(payload?.routes || []), [payload?.routes]);
  const currentCsa = csaPayload?.current_csa || (csaPayload?.csas || []).find((csa) => csa.is_current) || null;
  const workspaceName = getWorkspaceDisplayName(
    currentCsa?.company_name,
    currentCsa?.name,
    identity?.companyName,
    payload?.account?.company_name
  );
  const stats = useMemo(() => buildDashboardStats(routes, payload?.sync_status || {}), [payload?.sync_status, routes]);
  const importantRoutes = useMemo(() => getImportantRoutes(routes), [routes]);
  const hasPickups = stats.pickupStops > 0;

  function openFleetMap() {
    navigation?.navigate('ManagerMap', {
      date,
      selectedRouteId: null,
      fleetMode: true
    });
  }

  function openRoutes() {
    navigation?.navigate('ManagerRoutes');
  }

  function openRoute(route) {
    navigation?.navigate('ManagerMap', {
      selectedRouteId: route.id,
      date
    });
  }

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.brandBlock}>
        <Text style={styles.brandName}>ReadyRoute</Text>
        <Text numberOfLines={1} style={styles.companyName}>{workspaceName}</Text>
        <Text style={styles.dateText}>{formatDashboardDate(date)}</Text>
      </View>

      <Pressable onPress={openFleetMap} style={({ pressed }) => [styles.mapActionRow, pressed ? styles.pressed : null]}>
        <View style={styles.mapActionIcon}>
          <RouteMetricIcon color={appTheme.colors.orangeDeep} name="map" size={appTheme.icons.md} />
        </View>
        <Text style={styles.mapActionLabel}>View Fleet Map</Text>
        <Text style={styles.mapActionChevron}>›</Text>
      </Pressable>

      <View style={styles.metricGrid}>
        <MetricCard icon="route" label="Routes" value={stats.routes} />
        <MetricCard accent="purple" icon="drivers" label="Drivers" value={stats.drivers} />
        <MetricCard accent="warning" icon="warning" label="Exceptions" value={stats.exceptions} />
      </View>

      {stats.exceptions > 0 ? (
        <View style={styles.exceptionBanner}>
          <RouteMetricIcon color={appTheme.colors.dangerText} name="warning" size={appTheme.icons.sm} />
          <Text style={styles.exceptionBannerText}>One or more routes have exceptions.</Text>
        </View>
      ) : null}

      <View style={styles.progressStack}>
        <ProgressCard completed={stats.completedStops} icon="stop" label="Stops" total={stats.totalStops} />
        <ProgressCard completed={stats.deliveredPackages} icon="package" label="Packages" total={stats.totalPackages} />
        {hasPickups ? (
          <ProgressCard completed={stats.pickupStopsCompleted} icon="pickup" label="Pickups" total={stats.pickupStops} />
        ) : null}
      </View>

      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>Active route overview</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingScreen}>
          <ActivityIndicator color={appTheme.colors.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (errorMessage) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.screen}>
          {header}
          <AppCard style={styles.messageCard}>
            <Text style={styles.messageTitle}>Dashboard unavailable</Text>
            <Text style={styles.messageBody}>{errorMessage}</Text>
            <AppButton label="Retry" onPress={loadDashboard} style={styles.retryButton} />
          </AppCard>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        ListEmptyComponent={(
          <AppCard style={styles.messageCard}>
            <Text style={styles.messageTitle}>No active routes yet.</Text>
            <Text style={styles.messageBody}>Routes will appear here after they are loaded for today.</Text>
          </AppCard>
        )}
        ListFooterComponent={(
          <AppButton label="View All Routes" onPress={openRoutes} style={styles.viewAllButton} />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.listContent}
        data={importantRoutes}
        keyExtractor={(item, index) => String(item.id || item.route_id || item.work_area_name || index)}
        renderItem={({ item }) => <RouteOverviewCard onPress={() => openRoute(item)} route={item} />}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

export {
  buildDashboardStats,
  formatDashboardDate,
  getWorkspaceDisplayName,
  getImportantRoutes
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: appTheme.colors.background,
    flex: 1
  },
  screen: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: 64
  },
  listContent: {
    gap: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.xl,
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: 64
  },
  loadingScreen: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  headerContent: {
    gap: appTheme.spacing.md
  },
  brandBlock: {
    paddingRight: appTheme.spacing.md
  },
  brandName: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  companyName: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleMedium,
    marginTop: 2
  },
  dateText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold,
    marginTop: 2
  },
  mapActionRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: appTheme.spacing.md
  },
  mapActionIcon: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orangeSoft,
    borderRadius: appTheme.radius.md,
    height: 34,
    justifyContent: 'center',
    marginRight: appTheme.spacing.sm,
    width: 34
  },
  mapActionLabel: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  mapActionChevron: {
    color: appTheme.colors.orangeDeep,
    fontSize: 24
  },
  metricGrid: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  metricCard: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    minWidth: 0,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.sm
  },
  metricValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy
  },
  metricLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy
  },
  exceptionBanner: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.dangerSoft,
    borderColor: appTheme.colors.dangerSoft,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.xs,
    minHeight: 42,
    paddingHorizontal: appTheme.spacing.md
  },
  exceptionBannerText: {
    color: appTheme.colors.dangerText,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  progressStack: {
    gap: appTheme.spacing.xs
  },
  progressCard: {
    gap: appTheme.spacing.xs,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  progressHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  progressTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  progressLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  progressValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  progressMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.semibold
  },
  sectionTitleRow: {
    marginTop: appTheme.spacing.xs
  },
  sectionTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy
  },
  routeCardPressable: {
    borderRadius: appTheme.radius.lg
  },
  routeCard: {
    gap: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md
  },
  routeHeader: {
    alignItems: 'center',
    flexDirection: 'row'
  },
  routeTitleBlock: {
    flex: 1,
    minWidth: 0
  },
  routeTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.heavy
  },
  routeMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    marginTop: 2
  },
  routeChevron: {
    color: appTheme.colors.textTertiary,
    fontSize: 24
  },
  routeMetricGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  routeMetricText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  routeProgressLine: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  routeProgressLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  routeProgressValue: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  routeFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 18
  },
  routeFooterText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  routeWarningText: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  messageCard: {
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.lg
  },
  messageTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  messageBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  retryButton: {
    marginTop: appTheme.spacing.md
  },
  viewAllButton: {
    marginTop: appTheme.spacing.sm
  },
  pressed: {
    opacity: 0.92
  }
});
