import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import ErrorState from '../components/ui/ErrorState';
import { getPinColorMode, savePinColorMode, subscribePinColorMode } from '../services/auth';
import { fetchDriverManifest, getCachedDriverManifest } from '../services/driverRouteCache';
import appTheme from '../theme/appTheme';
import { getSidBucketTheme } from '../utils/sidBuckets';

const STOP_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'deliveries', label: 'Deliveries' },
  { key: 'pickups', label: 'Pickups' }
];

export function getStatusConfig(status) {
  switch (status) {
    case 'delivered':
      return { label: 'Delivered', dot: styles.statusDelivered };
    case 'pickup_complete':
      return { label: 'Picked up', dot: styles.statusDelivered };
    case 'attempted':
      return { label: 'Attempted', dot: styles.statusAttempted };
    case 'pickup_attempted':
      return { label: 'Pickup attempted', dot: styles.statusAttempted };
    case 'incomplete':
      return { label: 'Incomplete', dot: styles.statusIncomplete };
    default:
      return { label: 'Pending', dot: styles.statusPending };
  }
}

export function isPriorityStop(stop) {
  return Boolean(stop.priority || stop.is_priority || String(stop.notes || '').toLowerCase().includes('priority'));
}

export function isPickupStop(stop) {
  return Boolean(stop?.has_pickup || stop?.is_pickup === true || stop?.stop_type === 'pickup' || stop?.stop_type === 'combined');
}

export function isDeliveryStop(stop) {
  return Boolean(stop?.has_delivery || stop?.stop_type === 'delivery' || stop?.stop_type === 'combined' || !isPickupStop(stop));
}

export function isHazmatStop(stop) {
  return (stop.packages || []).some((pkg) => pkg.hazmat);
}

export function getPinColorModeLabel(mode) {
  return mode === 'black' ? 'Black' : 'SID Colors';
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
      body: 'FCC changed this route after it went live. Review stop order and details carefully before making your next move.'
    };
  }

  return null;
}

function formatStopSummaryLabel(count, singular, plural = `${singular}s`) {
  const safeCount = Number(count || 0);
  return `${safeCount} ${safeCount === 1 ? singular : plural}`;
}

function getStopPackageCount(stop) {
  if (Array.isArray(stop?.packages)) {
    return stop.packages.length;
  }

  return Number(stop?.package_count || stop?.pkg_count || stop?.pickup_package_count || 0);
}

function getPickupWindowLabel(stop) {
  if (!isPickupStop(stop)) {
    return null;
  }

  if (stop?.ready_time && stop?.close_time) {
    return `Pickup ${stop.ready_time}–${stop.close_time}`;
  }

  if (stop?.close_time) {
    return `Pickup closes ${stop.close_time}`;
  }

  if (stop?.ready_time) {
    return `Pickup ready ${stop.ready_time}`;
  }

  return null;
}

function getListPinTheme(stop, pinColorMode) {
  if (pinColorMode !== 'sid') {
    return {
      fill: '#ffffff',
      border: '#111111',
      text: '#111111'
    };
  }

  const sidTheme = getSidBucketTheme(stop?.sid);

  if (!sidTheme) {
    return {
      fill: '#ffffff',
      border: '#111111',
      text: '#111111'
    };
  }

  return {
    fill: sidTheme.fill,
    border: sidTheme.border,
    text: sidTheme.border
  };
}

function OpenBoxIcon({ color = '#6f7d87' }) {
  return (
    <Svg height={16} viewBox="0 0 24 24" width={16}>
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

export default function ManifestScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [routeData, setRouteData] = useState(null);
  const [driverDay, setDriverDay] = useState({ status: 'unknown' });
  const [search, setSearch] = useState('');
  const [activeStopFilter, setActiveStopFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [retryKey, setRetryKey] = useState(0);
  const [pinColorMode, setPinColorMode] = useState('sid');
  const selectedStopId = route?.params?.selectedStopId;
  const groupStopIds = useMemo(
    () => (Array.isArray(route?.params?.groupStopIds) ? route.params.groupStopIds.filter(Boolean) : []),
    [route?.params?.groupStopIds]
  );
  const groupStopIdSet = useMemo(() => new Set(groupStopIds), [groupStopIds]);
  const groupAddress = route?.params?.groupAddress || '';
  const isGroupStopList = groupStopIds.length > 0;
  const postDispatchNotice = getPostDispatchChangeNotice(routeData);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Today's Route"
    });
  }, [navigation]);

  useEffect(() => {
    let isMounted = true;

    async function loadRoute() {
      let hasCachedRoute = false;

      const cachedManifest = await getCachedDriverManifest().catch(() => null);

      if (isMounted && cachedManifest?.route) {
        hasCachedRoute = true;
        setErrorMessage('');
        setRouteData(cachedManifest.route);
        setDriverDay(
          cachedManifest.driver_day || {
            status: 'dispatched'
          }
        );
        setIsLoading(false);
      }

      try {
        const response = await fetchDriverManifest();
        const nextRoute = response?.route || null;

        if (isMounted) {
          setErrorMessage('');
          setRouteData(nextRoute);
          setDriverDay(
            response?.driver_day || {
              status: nextRoute ? 'dispatched' : 'unassigned'
            }
          );
        }
      } catch (_error) {
        if (isMounted && !hasCachedRoute) {
          setErrorMessage('Unable to load your route right now.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadRoute();

    return () => {
      isMounted = false;
    };
  }, [retryKey]);

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

  const searchedStops = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const routeStops = routeData?.stops || [];
    const stops = groupStopIdSet.size ? routeStops.filter((stop) => groupStopIdSet.has(stop.id)) : routeStops;

    if (!normalizedSearch) {
      return stops;
    }

    return stops.filter((stop) =>
      `${stop.address} ${stop.sequence_order} ${stop.sid || ''} ${stop.contact_name || ''} ${stop.address_line2 || ''}`
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [groupStopIdSet, routeData?.stops, search]);

  const visibleStops = useMemo(() => {
    if (activeStopFilter === 'deliveries') {
      return searchedStops.filter((stop) => isDeliveryStop(stop));
    }

    if (activeStopFilter === 'pickups') {
      return searchedStops.filter((stop) => isPickupStop(stop));
    }

    return searchedStops;
  }, [activeStopFilter, searchedStops]);
  const pickupStops = searchedStops.filter((stop) => isPickupStop(stop));
  const completedStopsCount = searchedStops.filter((stop) => stop.status === 'delivered' || stop.status === 'pickup_complete').length;

  async function handlePinColorModeChange(nextMode) {
    setPinColorMode(nextMode);
    await savePinColorMode(nextMode).catch(() => {});
  }

  function renderStopRow({ item }) {
    const statusConfig = getStatusConfig(item.status);
    const pinTheme = getListPinTheme(item, pinColorMode);
    const stopIsPickup = isPickupStop(item);
    const stopIsDelivery = isDeliveryStop(item);
    const packageCount = getStopPackageCount(item);
    const secondaryLine = item.contact_name || item.address_line2 || null;
    const pickupWindowLabel = getPickupWindowLabel(item);

    return (
      <Pressable
        onPress={() => navigation.navigate('StopDetail', { stopId: item.id })}
        style={[styles.row, isPriorityStop(item) ? styles.priorityRow : null, selectedStopId === item.id ? styles.selectedRow : null]}
      >
        <View style={styles.rowInner}>
          <View style={styles.rowIdentityWrap}>
            <View
              style={[
                styles.stopCircle,
                {
                  backgroundColor: pinTheme.fill,
                  borderColor: pinTheme.border
                }
              ]}
            >
              <Text style={[styles.stopCircleText, { color: pinTheme.text }]}>{item.sequence_order}</Text>
            </View>
            <View style={styles.sidWrap}>
              <Text style={[styles.sidLabel, { color: pinTheme.text }]}>
                {item.sid ? `SID ${item.sid}` : 'No SID'}
              </Text>
            </View>
          </View>

          <View style={styles.rowBody}>
            <View style={styles.rowMainCopy}>
              <Text numberOfLines={2} style={styles.address}>{item.address}</Text>
              {secondaryLine ? (
                <Text numberOfLines={1} style={styles.secondaryLine}>{secondaryLine}</Text>
              ) : null}
              <View style={styles.stopTypeBadgeRow}>
                {stopIsPickup ? (
                  <View style={styles.pickupTypeBadge}>
                    <Text style={styles.pickupTypeBadgeText}>{stopIsDelivery ? 'Delivery + Pickup' : 'Pickup'}</Text>
                  </View>
                ) : null}
                {pickupWindowLabel ? (
                  <Text numberOfLines={1} style={styles.pickupWindowText}>{pickupWindowLabel}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.rowMetaRail}>
              <View style={styles.rowMetaTop}>
                <View style={styles.packageMetaRow}>
                  <OpenBoxIcon />
                  <Text style={styles.packageMetaText}>{packageCount}</Text>
                </View>
                <View style={styles.statusWrap}>
                  <View style={[styles.statusDot, statusConfig.dot]} />
                  <Text style={styles.statusLabel}>{statusConfig.label}</Text>
                </View>
              </View>
              {item.has_note ? (
                <View style={[styles.metaBadge, styles.metaBadgeNoteCompact]}>
                  <Text style={[styles.metaBadgeText, styles.metaBadgeTextNote]}>Has note</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Today&apos;s Route</Text>
          <View style={styles.pinColorControl}>
            <Text style={styles.pinColorLabel}>Pin Colors</Text>
            <View style={styles.pinColorPillRow}>
              <Pressable
                onPress={() => handlePinColorModeChange('sid')}
                style={[
                  styles.pinColorPill,
                  pinColorMode === 'sid' ? styles.pinColorPillActiveSid : null
                ]}
                testID="pin-color-mode-sid"
              >
                <Text style={[styles.pinColorPillText, pinColorMode === 'sid' ? styles.pinColorPillTextActive : null]}>
                  {getPinColorModeLabel('sid')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => handlePinColorModeChange('black')}
                style={[
                  styles.pinColorPill,
                  pinColorMode === 'black' ? styles.pinColorPillActiveBlack : null
                ]}
                testID="pin-color-mode-black"
              >
                <Text style={[styles.pinColorPillText, pinColorMode === 'black' ? styles.pinColorPillTextActive : null]}>
                  {getPinColorModeLabel('black')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
        <TextInput
          autoCapitalize="none"
          onChangeText={setSearch}
          placeholder="Search by ST# or address"
          placeholderTextColor="#8b8b8b"
          style={styles.searchInput}
          value={search}
        />

        <View style={styles.stopFilterRow}>
          {STOP_FILTERS.map((filter) => (
            <Pressable
              key={filter.key}
              onPress={() => setActiveStopFilter(filter.key)}
              style={[
                styles.stopFilterChip,
                activeStopFilter === filter.key ? styles.stopFilterChipActive : null
              ]}
            >
              <Text style={[
                styles.stopFilterChipText,
                activeStopFilter === filter.key ? styles.stopFilterChipTextActive : null
              ]}>
                {filter.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {isGroupStopList
              ? `${formatStopSummaryLabel(visibleStops.length, 'stop')} at this + pin`
              : formatStopSummaryLabel(visibleStops.length, 'stop')}
          </Text>
          <Text style={styles.summaryDivider}>•</Text>
          <Text style={styles.summaryText}>{completedStopsCount} completed</Text>
          <Text style={styles.summaryDivider}>•</Text>
          <Text style={styles.summaryText}>{pickupStops.length} pickups</Text>
          {isGroupStopList && groupAddress ? (
            <Text numberOfLines={1} style={styles.groupAddressText}>
              {groupAddress}
            </Text>
          ) : null}
          <View style={styles.sortChip}>
            <Text style={styles.sortChipText}>By Stop #</Text>
            <Text style={styles.sortChipChevron}>⌄</Text>
          </View>
        </View>

        {!isLoading && !routeData && driverDay?.status === 'awaiting_dispatch' ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>Route staged for dispatch</Text>
            <Text style={styles.noticeBody}>
              Your stop list will appear here as soon as your lead manager dispatches the day.
            </Text>
          </View>
        ) : null}

        {postDispatchNotice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeTitle}>{postDispatchNotice.title}</Text>
            <Text style={styles.noticeBody}>{postDispatchNotice.body}</Text>
          </View>
        ) : null}

        {!isLoading && errorMessage ? (
          <ErrorState
            body="Check your connection and try again."
            onAction={() => {
              setErrorMessage('');
              setIsLoading(true);
              setRetryKey((k) => k + 1);
            }}
            title="Couldn't load your route"
          />
        ) : null}

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#FF6200" size="large" />
          </View>
        ) : !errorMessage ? (
          <FlatList
            contentContainerStyle={[styles.listContent, { paddingBottom: appTheme.spacing.xxl + insets.bottom }]}
            data={visibleStops}
            initialNumToRender={14}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.emptyText}>No stops match that search.</Text>}
            maxToRenderPerBatch={12}
            removeClippedSubviews
            renderItem={renderStopRow}
            updateCellsBatchingPeriod={50}
            windowSize={7}
          />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  container: {
    flex: 1,
    backgroundColor: appTheme.colors.backgroundWarm,
    paddingHorizontal: appTheme.spacing.md,
    paddingTop: appTheme.spacing.sm
  },
  title: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy
  },
  titleRow: {
    alignItems: 'flex-start',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  pinColorControl: {
    alignItems: 'stretch',
    gap: appTheme.spacing.xs,
    width: '100%'
  },
  pinColorLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.bold,
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  pinColorPillRow: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3
  },
  pinColorPill: {
    alignItems: 'center',
    borderRadius: appTheme.radius.lg,
    flex: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 4
  },
  pinColorPillActiveSid: {
    backgroundColor: appTheme.colors.purple
  },
  pinColorPillActiveBlack: {
    backgroundColor: appTheme.colors.charcoal
  },
  pinColorPillText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  pinColorPillTextActive: {
    color: appTheme.colors.textInverse
  },
  searchInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    marginBottom: appTheme.spacing.xs,
    minHeight: 40,
    paddingHorizontal: appTheme.spacing.md
  },
  stopFilterRow: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    marginBottom: appTheme.spacing.xs,
    padding: 3
  },
  stopFilterChip: {
    alignItems: 'center',
    borderRadius: appTheme.radius.lg,
    flex: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: 4
  },
  stopFilterChipActive: {
    backgroundColor: appTheme.colors.orange
  },
  stopFilterChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  stopFilterChipTextActive: {
    color: appTheme.colors.textInverse
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginBottom: appTheme.spacing.xs
  },
  summaryText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  summaryDivider: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  groupAddressText: {
    color: appTheme.colors.textSecondary,
    flexBasis: '100%',
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  sortChip: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    marginLeft: 'auto',
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 4
  },
  sortChipText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  sortChipChevron: {
    color: appTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.bold,
    marginLeft: 4
  },
  noticeCard: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    marginBottom: appTheme.spacing.md,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.md
  },
  noticeTitle: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs
  },
  noticeBody: {
    color: appTheme.colors.infoText,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  listContent: {
    paddingBottom: appTheme.spacing.xxxl
  },
  row: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    marginBottom: appTheme.spacing.xs,
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  selectedRow: {
    borderColor: appTheme.colors.charcoalSoft,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4
  },
  priorityRow: {
    borderLeftColor: appTheme.colors.orange,
    borderLeftWidth: 4
  },
  rowInner: {
    alignItems: 'center',
    flexDirection: 'row'
  },
  rowIdentityWrap: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    marginRight: 8,
    paddingRight: 8
  },
  stopCircle: {
    alignItems: 'center',
    borderRadius: appTheme.radius.pill,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  stopCircleText: {
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  sidWrap: {
    borderLeftColor: appTheme.colors.border,
    borderLeftWidth: 1,
    marginLeft: 8,
    minWidth: 86,
    paddingLeft: 8
  },
  sidLabel: {
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.2
  },
  rowMetaRail: {
    alignItems: 'flex-end',
    gap: 3,
    justifyContent: 'flex-start',
    marginLeft: 6,
    minWidth: 94
  },
  rowMetaTop: {
    alignItems: 'center',
    columnGap: 6,
    flexDirection: 'row'
  },
  statusWrap: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  statusDot: {
    borderRadius: 6,
    height: 10,
    width: 10
  },
  statusDelivered: {
    backgroundColor: appTheme.colors.green
  },
  statusAttempted: {
    backgroundColor: appTheme.colors.warning
  },
  statusIncomplete: {
    backgroundColor: appTheme.colors.danger
  },
  statusPending: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.borderStrong,
    borderWidth: 1
  },
  statusLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  rowBody: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    minWidth: 0
  },
  rowMainCopy: {
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    minWidth: 0
  },
  address: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: 11,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 14
  },
  secondaryLine: {
    color: appTheme.colors.textSecondary,
    fontSize: 10,
    fontWeight: appTheme.typography.weights.medium
  },
  stopTypeBadgeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    minHeight: 18
  },
  pickupTypeBadge: {
    backgroundColor: '#2980b9',
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 7,
    paddingVertical: 2
  },
  pickupTypeBadgeText: {
    color: appTheme.colors.textInverse,
    fontSize: 9,
    fontWeight: appTheme.typography.weights.heavy
  },
  pickupWindowText: {
    color: '#1e5f8d',
    flexShrink: 1,
    fontSize: 10,
    fontWeight: appTheme.typography.weights.bold
  },
  rowChevron: {
    color: appTheme.colors.textSecondary,
    fontSize: 18,
    fontWeight: appTheme.typography.weights.bold
  },
  metaBadge: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3
  },
  metaBadgeNoteCompact: {
    backgroundColor: appTheme.colors.orangeSoft,
    paddingHorizontal: 8,
    paddingVertical: 2
  },
  metaBadgeText: {
    fontSize: 10,
    fontWeight: appTheme.typography.weights.heavy
  },
  metaBadgeTextNote: {
    color: appTheme.colors.orangeDeep
  },
  packageMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4
  },
  packageMetaText: {
    color: appTheme.colors.textSecondary,
    fontSize: 12,
    fontWeight: appTheme.typography.weights.heavy
  },
  emptyText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodyLarge,
    paddingVertical: appTheme.spacing.xl,
    textAlign: 'center'
  }
});
