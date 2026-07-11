import { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import ErrorState from '../components/ui/ErrorState';
import ManagerManifestUploadPanel from '../components/ManagerManifestUploadPanel';
import RouteMetricIcon from '../components/RouteMetricIcon';
import StatusBadge from '../components/ui/StatusBadge';
import api from '../services/api';
import {
  getFileExtension,
  getPickedAsset,
  getSupportedRouteFileKind,
  isSupportedRouteFile
} from '../services/managerManifestUpload';
import { getPickupStopCount, getRouteColor, getRouteDisplayName, sortManagerRoutes } from '../services/managerOperations';
import appTheme from '../theme/appTheme';

const ACTIVE_ROUTE_STATUSES = new Set(['active', 'enabled', 'in_progress', 'dispatched']);
const SYNC_STATUS_KEYS = ['sync_status', 'syncStatus', 'manifest_status', 'upload_status', 'route_sync_status'];
const VISIBLE_SYNC_STATUSES = new Set(['enabled', 'staged', 'uploaded', 'available']);

function getTodayDateParam() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function formatStatusLabel(status) {
  const normalized = String(status || '')
    .trim()
    .replace(/_/g, ' ')
    .toLowerCase();

  if (!normalized) {
    return '';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getStatusTone(status) {
  const normalized = String(status || '').toLowerCase();

  if (['active', 'enabled', 'in_progress', 'dispatched', 'uploaded', 'available'].includes(normalized)) {
    return 'active';
  }

  if (normalized === 'complete') {
    return 'complete';
  }

  return 'pending';
}

function getRouteNumber(route) {
  return route?.work_area_name ? getRouteDisplayName(route) : 'Unlabeled';
}

function getTerminalLabel(route) {
  return route?.terminal_name || route?.terminal || route?.terminal_label || route?.station_code || route?.station || '';
}

function getCurrentDayLabel(route, fallbackDate = getTodayDateParam()) {
  return route?.current_day || route?.service_day || route?.route_date || route?.date || fallbackDate;
}

function getSyncStatus(route) {
  for (const key of SYNC_STATUS_KEYS) {
    const value = route?.[key];
    const normalized = String(value || '').trim().toLowerCase();

    if (VISIBLE_SYNC_STATUSES.has(normalized)) {
      return normalized;
    }
  }

  return '';
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

function getPickupProgress(route) {
  const total = getPickupStopCount(route);
  const completed = Number(route?.pickup_stops_completed || route?.completed_pickup_stops || 0);

  return {
    completed,
    total
  };
}

function routeMatchesSearch(route, searchTerm) {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return [
    getRouteNumber(route),
    getTerminalLabel(route),
    route?.driver_name,
    getCurrentDayLabel(route),
    getSyncStatus(route)
  ].some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
}

function isActiveRoute(route) {
  return ACTIVE_ROUTE_STATUSES.has(String(route?.status || '').toLowerCase());
}

function buildTerminalOptions(routes = []) {
  return [...new Set(routes.map(getTerminalLabel).filter(Boolean))].sort();
}

function filterRoutes(routes = [], { onlyActive = false, searchTerm = '', terminal = '' } = {}) {
  return routes.filter((route) => {
    if (onlyActive && !isActiveRoute(route)) {
      return false;
    }

    if (terminal && getTerminalLabel(route) !== terminal) {
      return false;
    }

    return routeMatchesSearch(route, searchTerm);
  });
}

function RouteMetaItem({ children, label, style }) {
  return (
    <View style={[styles.metaItem, style]}>
      <Text style={styles.metaLabel}>{label}</Text>
      {children}
    </View>
  );
}

function IconButton({ color = appTheme.colors.orangeDeep, icon, label, onPress }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}
    >
      <RouteMetricIcon color={color} name={icon} size={20} />
    </Pressable>
  );
}

function RouteRow({ date, onEditRoute, onViewRoute, route, routes }) {
  const syncStatus = getSyncStatus(route);
  const exceptionCount = getExceptionCount(route);
  const pickupProgress = getPickupProgress(route);
  const routeColor = getRouteColor(route, routes);

  return (
    <AppCard style={styles.routeRow}>
      <View style={[styles.routeRowAccent, { backgroundColor: routeColor }]} />
      <View style={styles.routeRowTop}>
        <View style={styles.routeTitleBlock}>
          <View style={styles.routeTitleLine}>
            <Text numberOfLines={1} style={[styles.routeNumber, { color: routeColor }]}>
              {getRouteNumber(route)}
            </Text>
            <Text numberOfLines={1} style={styles.inlineDriverName}>
              {route.driver_name || 'Unassigned'}
            </Text>
          </View>
          {exceptionCount > 0 ? <Text style={styles.exceptionText}>{exceptionCount} exceptions</Text> : null}
        </View>
        <View style={styles.actionGroup}>
          <IconButton icon="eye" label={`View ${getRouteNumber(route)} on map`} onPress={() => onViewRoute(route)} />
          <IconButton color={appTheme.colors.charcoalSoft} icon="edit" label={`Edit ${getRouteNumber(route)}`} onPress={() => onEditRoute(route)} />
        </View>
      </View>

      <View style={styles.routeMetaGrid}>
        <RouteMetaItem label="Terminal">
          <Text numberOfLines={1} style={styles.metaValue}>{getTerminalLabel(route) || 'Not set'}</Text>
        </RouteMetaItem>
        <RouteMetaItem label="Date">
          <Text numberOfLines={1} style={styles.metaValue}>{getCurrentDayLabel(route, date)}</Text>
        </RouteMetaItem>
        <RouteMetaItem label="Sync">
          {syncStatus ? (
            <StatusBadge label={formatStatusLabel(syncStatus)} tone={getStatusTone(syncStatus)} />
          ) : (
            <Text numberOfLines={1} style={styles.metaValueMuted}>Not provided</Text>
          )}
        </RouteMetaItem>
        {pickupProgress.total > 0 ? (
          <RouteMetaItem label="Pickups">
            <Text numberOfLines={1} style={styles.metaValue}>
              {pickupProgress.completed} / {pickupProgress.total}
            </Text>
          </RouteMetaItem>
        ) : null}
      </View>
    </AppCard>
  );
}

function LoadingRouteRow() {
  return (
    <AppCard style={styles.routeRow}>
      <View style={styles.skeletonTitle} />
      <View style={styles.skeletonGrid}>
        <View style={styles.skeletonCell} />
        <View style={styles.skeletonCell} />
        <View style={styles.skeletonCell} />
        <View style={styles.skeletonCell} />
      </View>
    </AppCard>
  );
}

function EmptyRoutesState({ hasActiveFilters }) {
  return (
    <AppCard style={styles.emptyStateCard}>
      <Text style={styles.emptyStateTitle}>
        {hasActiveFilters ? 'No routes match your filters.' : 'No routes available.'}
      </Text>
      <Text style={styles.emptyStateBody}>
        {hasActiveFilters
          ? 'Try clearing your search or filter to see all routes.'
          : 'Upload routes manually to start reviewing today\'s work areas.'}
      </Text>
    </AppCard>
  );
}

export default function ManagerRoutesScreen({ csaWorkspaceVersion = 0, identity, navigation, onManagerDataRefresh }) {
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [payload, setPayload] = useState(null);
  const [onlyActiveRoutes, setOnlyActiveRoutes] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isStopSearchVisible, setIsStopSearchVisible] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState('');
  const [editingRoute, setEditingRoute] = useState(null);
  const [isUploadManifestVisible, setIsUploadManifestVisible] = useState(false);
  const date = getTodayDateParam();

  async function loadRoutes() {
    setIsLoading(true);

    try {
      const response = await api.get('/manager/routes', {
        authMode: 'manager',
        params: { date }
      });

      setPayload(response.data || null);
      setErrorMessage('');
    } catch (_error) {
      setErrorMessage('Unable to load manager routes right now.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadRoutes();
  }, [csaWorkspaceVersion]);

  const routes = useMemo(() => sortManagerRoutes(payload?.routes || []), [payload?.routes]);
  const workspaceName = payload?.account?.company_name || identity?.companyName || 'Manager routes';
  const terminalOptions = useMemo(() => buildTerminalOptions(routes), [routes]);
  const filteredRoutes = useMemo(
    () => filterRoutes(routes, {
      onlyActive: onlyActiveRoutes,
      searchTerm,
      terminal: selectedTerminal
    }),
    [onlyActiveRoutes, routes, searchTerm, selectedTerminal]
  );

  function openRouteMap(routeItem) {
    navigation?.navigate('ManagerMap', {
      date,
      selectedRouteId: routeItem.id
    });
  }

  function openUploadManifestFlow() {
    setIsUploadManifestVisible(true);
  }

  function closeUploadManifestFlow() {
    setIsUploadManifestVisible(false);
  }

  async function handleRoutesUploaded() {
    await loadRoutes();
    onManagerDataRefresh?.();
  }

  const header = (
    <View style={styles.headerStack}>
      <View style={styles.actionRow}>
        <AppButton
          label="Stop Search"
          onPress={() => setIsStopSearchVisible((current) => {
            if (current) {
              setSearchTerm('');
            }

            return !current;
          })}
          style={styles.actionButton}
          variant="outline"
        />
        <AppButton label="Upload Manifest" onPress={openUploadManifestFlow} style={styles.actionButton} />
      </View>

      {isStopSearchVisible ? (
        <View style={styles.searchCard}>
          <TextInput
            autoCapitalize="none"
            onChangeText={setSearchTerm}
            placeholder="Search route, terminal, driver, or status"
            placeholderTextColor={appTheme.colors.textTertiary}
            style={styles.searchInput}
            value={searchTerm}
          />
        </View>
      ) : null}

      {terminalOptions.length > 0 ? (
        <View style={styles.terminalRow}>
          <Pressable
            onPress={() => setSelectedTerminal('')}
            style={[styles.terminalChip, !selectedTerminal ? styles.terminalChipActive : null]}
          >
            <Text style={[styles.terminalChipText, !selectedTerminal ? styles.terminalChipTextActive : null]}>All terminals</Text>
          </Pressable>
          {terminalOptions.map((terminal) => (
            <Pressable
              key={terminal}
              onPress={() => setSelectedTerminal(terminal)}
              style={[styles.terminalChip, selectedTerminal === terminal ? styles.terminalChipActive : null]}
            >
              <Text numberOfLines={1} style={[styles.terminalChipText, selectedTerminal === terminal ? styles.terminalChipTextActive : null]}>
                {terminal}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleLabel}>Only Active Routes</Text>
          <Text style={styles.toggleMeta}>{filteredRoutes.length} of {routes.length} shown</Text>
        </View>
        <Switch
          onValueChange={setOnlyActiveRoutes}
          thumbColor={onlyActiveRoutes ? appTheme.colors.orange : appTheme.colors.surface}
          trackColor={{ false: appTheme.colors.borderStrong, true: appTheme.colors.orangeSoft }}
          value={onlyActiveRoutes}
        />
      </View>

      {!isLoading && errorMessage ? (
        <ErrorState
          body="Check your connection and try again."
          onAction={loadRoutes}
          title="Couldn’t load routes"
        />
      ) : null}
    </View>
  );

  return (
    <>
      <ManagerSectionLayout
        compact
        eyebrow="ReadyRoute"
        scrollEnabled={false}
        subtitle={workspaceName}
        title="Routes"
        tone="light"
      >
        <FlatList
          ListEmptyComponent={!errorMessage ? (
            isLoading ? (
              <View style={styles.loadingList}>
                <LoadingRouteRow />
                <LoadingRouteRow />
                <LoadingRouteRow />
              </View>
            ) : (
              <EmptyRoutesState hasActiveFilters={searchTerm.length > 0 || selectedTerminal !== '' || onlyActiveRoutes} />
            )
          ) : null}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          data={!isLoading && !errorMessage ? filteredRoutes : []}
          keyExtractor={(item, index) => String(item.id || item.route_id || item.work_area_name || index)}
          renderItem={({ item }) => (
            <RouteRow
              date={date}
              onEditRoute={setEditingRoute}
              onViewRoute={openRouteMap}
              route={item}
              routes={routes}
            />
          )}
          showsVerticalScrollIndicator={false}
        />
      </ManagerSectionLayout>

      <Modal animationType="fade" onRequestClose={() => setEditingRoute(null)} transparent visible={Boolean(editingRoute)}>
        <Pressable onPress={() => setEditingRoute(null)} style={styles.modalBackdrop}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>Route options</Text>
            <Text style={styles.modalBody}>More route tools are coming soon.</Text>
            <AppButton label="Close" onPress={() => setEditingRoute(null)} style={styles.modalButton} />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" onRequestClose={closeUploadManifestFlow} transparent visible={isUploadManifestVisible}>
        <Pressable onPress={closeUploadManifestFlow} style={styles.modalBackdrop}>
          <Pressable style={styles.modalCard}>
            <Text style={styles.modalTitle}>Upload Manifest</Text>
            <ManagerManifestUploadPanel
              failureMessage="Could not upload manifest. Check the file and try again."
              onUploaded={handleRoutesUploaded}
              submitLabel="Upload Manifest"
              successMessage="Manifest uploaded successfully."
            />
            <AppButton label="View Routes" onPress={closeUploadManifestFlow} style={styles.modalButton} variant="outline" />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export {
  buildTerminalOptions,
  filterRoutes,
  formatStatusLabel,
  getCurrentDayLabel,
  getExceptionCount,
  getFileExtension,
  getPickedAsset,
  getSyncStatus,
  getTerminalLabel,
  getTodayDateParam,
  getSupportedRouteFileKind,
  isActiveRoute,
  isSupportedRouteFile,
  routeMatchesSearch
};

const styles = StyleSheet.create({
  listContent: {
    flexGrow: 1,
    paddingBottom: appTheme.spacing.xl
  },
  headerStack: {
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  actionRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  actionButton: {
    flex: 1
  },
  searchCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    minHeight: 46,
    justifyContent: 'center',
    paddingHorizontal: appTheme.spacing.md
  },
  searchInput: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.semibold,
    minHeight: 44
  },
  terminalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  terminalChip: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 30,
    maxWidth: 180,
    paddingHorizontal: 12
  },
  terminalChipActive: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  terminalChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  terminalChipTextActive: {
    color: appTheme.colors.orangeDeep
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.xs
  },
  toggleLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  toggleMeta: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: 2
  },
  loadingList: {
    gap: appTheme.spacing.xs
  },
  routeRow: {
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: 10,
    position: 'relative'
  },
  routeRowAccent: {
    borderBottomLeftRadius: appTheme.radius.md,
    borderTopLeftRadius: appTheme.radius.md,
    bottom: 10,
    left: 0,
    position: 'absolute',
    top: 10,
    width: 4
  },
  routeRowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  routeTitleBlock: {
    flex: 1,
    minWidth: 0,
    paddingRight: appTheme.spacing.sm
  },
  routeTitleLine: {
    alignItems: 'baseline',
    flexDirection: 'row',
    minWidth: 0
  },
  routeNumber: {
    color: appTheme.colors.orangeDeep,
    flexShrink: 0,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  inlineDriverName: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy,
    marginLeft: 10,
    minWidth: 0
  },
  exceptionText: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    marginTop: 2
  },
  actionGroup: {
    flexDirection: 'row',
    gap: 8
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34
  },
  routeMetaGrid: {
    columnGap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 5
  },
  metaItem: {
    alignItems: 'center',
    flexDirection: 'row',
    maxWidth: '48%',
    minHeight: 20
  },
  metaLabel: {
    color: appTheme.colors.textTertiary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    marginRight: 4
  },
  metaValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  metaValueMuted: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.semibold
  },
  emptyStateCard: {
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.lg
  },
  emptyStateTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  emptyStateBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 23, 31, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: appTheme.spacing.lg
  },
  modalCard: {
    backgroundColor: appTheme.colors.surface,
    borderRadius: appTheme.radius.lg,
    maxWidth: 420,
    padding: appTheme.spacing.lg,
    width: '100%'
  },
  modalTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs
  },
  modalBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  modalButton: {
    marginTop: appTheme.spacing.md
  },
  skeletonTitle: {
    backgroundColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    height: 20,
    width: '58%'
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  skeletonCell: {
    backgroundColor: appTheme.colors.surfaceTint,
    borderRadius: appTheme.radius.pill,
    height: 18,
    width: '30%'
  },
  pressed: {
    opacity: 0.86
  }
});
