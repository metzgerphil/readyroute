import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';
import {
  getClockInTime,
  getDriverFromToken,
  getSecurityDismissedDate,
  getToken,
  removeClockInTime,
  removeToken,
  saveClockInTime,
  saveSecurityDismissedDate
} from '../services/auth';
import { loadStatusCodes } from '../services/statusCodes';

export function getFriendlyDate() {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date());
}

export function getGreetingByTime() {
  const currentHour = new Date().getHours();

  if (currentHour < 12) {
    return 'Good morning';
  }

  if (currentHour < 18) {
    return 'Good afternoon';
  }

  return 'Good evening';
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

export function getTodayStorageDate() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function getRoutePresentation(status) {
  switch (status) {
    case 'in_progress':
      return {
        badgeLabel: 'In progress',
        badgeStyle: styles.badgeInProgress,
        badgeTextStyle: styles.badgeInProgressText,
        actionLabel: 'Continue Route'
      };
    case 'complete':
      return {
        badgeLabel: 'Complete',
        badgeStyle: styles.badgeComplete,
        badgeTextStyle: styles.badgeCompleteText,
        actionLabel: null
      };
    case 'pending':
    default:
      return {
        badgeLabel: 'Ready to start',
        badgeStyle: styles.badgeReady,
        badgeTextStyle: styles.badgeReadyText,
        actionLabel: 'Start Route'
      };
  }
}

export function getRouteSummary(route) {
  if (!route) {
    return [];
  }

  return [
    route.work_area_name ? `Route ${route.work_area_name}` : null,
    route.vehicle_name || route.vehicle_id ? `Vehicle ${route.vehicle_name || route.vehicle_id}` : null,
    route.stops_per_hour != null ? `${route.stops_per_hour} stops/hr` : null
  ].filter(Boolean);
}

export default function HomeScreen({ navigation, onLogout }) {
  const isMountedRef = useRef(true);
  const [route, setRoute] = useState(null);
  const [driverName, setDriverName] = useState('Driver');
  const [clockedInAt, setClockedInAt] = useState(null);
  const [activeBreak, setActiveBreak] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingRoute, setIsStartingRoute] = useState(false);
  const [isUpdatingClock, setIsUpdatingClock] = useState(false);
  const [isUpdatingBreak, setIsUpdatingBreak] = useState(false);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showSecurityBanner, setShowSecurityBanner] = useState(false);
  const securityBannerOpacity = useRef(new Animated.Value(0)).current;
  const securityBannerHeight = useRef(new Animated.Value(0)).current;

  async function loadHomeData({ showAlert = true, isRetry = false } = {}) {
    if (isRetry && isMountedRef.current) {
      setIsRetryingLoad(true);
    }

    try {
      const [token, storedClockInTime, routeResponse, timecardStatusResponse, dismissedDate] = await Promise.all([
        getToken(),
        getClockInTime(),
        api.get('/routes/today'),
        api.get('/timecards/status'),
        getSecurityDismissedDate()
      ]);

      if (!isMountedRef.current) {
        return;
      }

      const payload = getDriverFromToken(token);
      setDriverName(payload?.name || 'Driver');
      const timecardStatus = timecardStatusResponse;
      const activeTimecard = timecardStatus?.data?.active_timecard || null;
      const activeBreakState = timecardStatus?.data?.active_break || null;
      const resolvedClockIn = activeTimecard?.clock_in || storedClockInTime;

      setClockedInAt(resolvedClockIn);
      setActiveBreak(activeBreakState);
      setRoute(routeResponse.data?.route || null);
      setLoadError(null);
      setShowSecurityBanner(dismissedDate !== getTodayStorageDate());

      if (resolvedClockIn) {
        Promise.resolve(saveClockInTime(resolvedClockIn)).catch(() => {});
      } else {
        Promise.resolve(removeClockInTime()).catch(() => {});
      }

      Promise.resolve(loadStatusCodes()).catch((error) => {
        console.warn('FedEx status code preload failed:', error?.message || error);
      });
    } catch (error) {
      if (!isMountedRef.current) {
        return;
      }

      const message = error.response?.data?.error || 'Unable to load your route right now.';
      setLoadError(message);
      if (showAlert) {
        Alert.alert('Could not load home screen', message);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsRetryingLoad(false);
      }
    }
  }

  useEffect(() => {
    loadHomeData();

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  async function handleRetryLoad() {
    setIsRetryingLoad(true);
    await loadHomeData({ showAlert: false, isRetry: true });
  }

  useEffect(() => {
    Animated.parallel([
      Animated.timing(securityBannerOpacity, {
        toValue: showSecurityBanner ? 1 : 0,
        duration: 300,
        useNativeDriver: false
      }),
      Animated.timing(securityBannerHeight, {
        toValue: showSecurityBanner ? 194 : 0,
        duration: 300,
        useNativeDriver: false
      })
    ]).start();
  }, [securityBannerHeight, securityBannerOpacity, showSecurityBanner]);

  async function handleLogout() {
    await removeClockInTime();
    await removeToken();
    onLogout();
  }

  async function handleRouteAction() {
    if (!route) {
      return;
    }

    if (route.status === 'in_progress') {
      navigation.navigate('MyDrive');
      return;
    }

    if (route.status !== 'pending') {
      return;
    }

    setIsStartingRoute(true);

    try {
      await api.patch(`/routes/${route.id}/status`, {
        status: 'in_progress'
      });

      const nextRoute = {
        ...route,
        status: 'in_progress'
      };

      setRoute(nextRoute);
      navigation.navigate('MyDrive');
    } catch (error) {
      const message = error.response?.data?.error || 'Unable to start your route right now.';
      Alert.alert('Could not start route', message);
    } finally {
      setIsStartingRoute(false);
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
          route_id: route.id
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
        text: 'Rest break',
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

  async function handleDismissSecurityBanner() {
    await saveSecurityDismissedDate(getTodayStorageDate());
    setShowSecurityBanner(false);
  }

  const friendlyDate = getFriendlyDate();
  const greeting = getGreetingByTime();
  const routePresentation = route ? getRoutePresentation(route.status) : null;
  const routeSummary = getRouteSummary(route);
  const totalStops = route?.stops?.length || 0;
  const breakButtonLabel = activeBreak ? `End ${formatBreakLabel(activeBreak.break_type)}` : 'Break';

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#FF6200" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && !route) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredState}>
          <Text style={styles.emptyTitle}>Home screen unavailable</Text>
          <Text style={styles.emptyText}>{loadError}</Text>
          <Pressable
            disabled={isRetryingLoad}
            onPress={handleRetryLoad}
            style={({ pressed }) => [
              styles.retryButton,
              isRetryingLoad && styles.buttonDisabled,
              pressed && !isRetryingLoad ? styles.buttonPressed : null
            ]}
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.mainContent}>
            <View style={styles.topRow}>
              <View style={styles.topRowText}>
                <Text style={styles.title}>{greeting}, {driverName}</Text>
                <Text style={styles.dateText}>{friendlyDate}</Text>
              </View>
              <Pressable onPress={handleLogout} style={styles.logoutButton}>
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>

            <Animated.View
              pointerEvents={showSecurityBanner ? 'auto' : 'none'}
              style={[
                styles.securityBannerContainer,
                {
                  opacity: securityBannerOpacity,
                  maxHeight: securityBannerHeight
                }
              ]}
            >
              <View style={styles.securityBanner}>
                <View style={styles.securityBannerHeader}>
                  <Text style={styles.securityBannerIcon}>🔒</Text>
                  <Text style={styles.securityBannerTitle}>Daily Security Reminder</Text>
                </View>
                <View style={styles.securityBulletList}>
                  <Text style={styles.securityBullet}>• Lock doors and windows between every stop</Text>
                  <Text style={styles.securityBullet}>• Remove keys from vehicle when not in operation</Text>
                  <Text style={styles.securityBullet}>• Avoid leaving packages or vehicle unattended</Text>
                </View>
                <Pressable onPress={handleDismissSecurityBanner} style={styles.securityDismissButton}>
                  <Text style={styles.securityDismissText}>Got it</Text>
                </Pressable>
              </View>
            </Animated.View>

            {route ? (
              <View style={styles.routeCard}>
                <View style={styles.routeHeader}>
                  <Text style={styles.routeLabel}>Today&apos;s Route</Text>
                  <View style={[styles.badgeBase, routePresentation.badgeStyle]}>
                    <Text style={[styles.badgeTextBase, routePresentation.badgeTextStyle]}>
                      {routePresentation.badgeLabel}
                    </Text>
                  </View>
                </View>
                <Text style={styles.stopCount}>{totalStops} stops</Text>
                {routeSummary.length ? (
                  <View style={styles.routeSummaryRow}>
                    {routeSummary.map((item) => (
                      <View key={item} style={styles.routeSummaryChip}>
                        <Text style={styles.routeSummaryText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <Text style={styles.routeHint}>
                  {route.status === 'complete'
                    ? 'Everything is wrapped up for today.'
                    : 'You can jump into your live stop map whenever you are ready.'}
                </Text>

                {routePresentation.actionLabel ? (
                  <Pressable
                    disabled={isStartingRoute}
                    onPress={handleRouteAction}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      isStartingRoute && styles.buttonDisabled,
                      pressed && !isStartingRoute ? styles.buttonPressed : null
                    ]}
                  >
                    {isStartingRoute ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{routePresentation.actionLabel}</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No route assigned today.</Text>
                <Text style={styles.emptyBody}>Contact your manager.</Text>
              </View>
            )}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              disabled={isUpdatingClock || (!route && !clockedInAt)}
              onPress={handleClockToggle}
              style={({ pressed }) => [
                styles.clockButton,
                styles.actionButton,
                (isUpdatingClock || (!route && !clockedInAt)) && styles.buttonDisabled,
                pressed && !isUpdatingClock ? styles.clockButtonPressed : null
              ]}
            >
              {isUpdatingClock ? (
                <ActivityIndicator color="#173042" />
              ) : (
                <Text style={styles.clockButtonText}>{clockedInAt ? 'Clock Out' : 'Clock In'}</Text>
              )}
            </Pressable>

            <Pressable
              disabled={isUpdatingBreak || !clockedInAt}
              onPress={handleBreakToggle}
              style={({ pressed }) => [
                styles.breakButton,
                styles.actionButton,
                (isUpdatingBreak || !clockedInAt) && styles.buttonDisabled,
                pressed && !isUpdatingBreak ? styles.breakButtonPressed : null
              ]}
            >
              {isUpdatingBreak ? (
                <ActivityIndicator color="#173042" />
              ) : (
                <Text style={styles.breakButtonText}>{breakButtonLabel}</Text>
              )}
            </Pressable>
          </View>

          {clockedInAt || activeBreak ? (
            <View style={styles.timeStatusCard}>
              {clockedInAt ? <Text style={styles.timeStatusText}>Clocked in: {new Date(clockedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text> : null}
              {activeBreak ? (
                <Text style={styles.timeStatusSubtext}>
                  {`${formatBreakLabel(activeBreak.break_type)} started at ${new Date(activeBreak.started_at).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit'
                  })}`}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff8f2'
  },
  contentContainer: {
    flexGrow: 1
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20
  },
  mainContent: {
    gap: 0
  },
  loadingContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center'
  },
  centeredState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32
  },
  topRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18
  },
  topRowText: {
    flex: 1,
    flexShrink: 1,
    paddingRight: 8
  },
  title: {
    color: '#173042',
    flexShrink: 1,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 31
  },
  dateText: {
    color: '#707070',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8
  },
  logoutButton: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  logoutText: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700'
  },
  securityBannerContainer: {
    marginBottom: 18,
    overflow: 'hidden'
  },
  securityBanner: {
    backgroundColor: '#FFF3CD',
    borderLeftColor: '#FF6200',
    borderLeftWidth: 4,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 15
  },
  securityBannerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10
  },
  securityBannerIcon: {
    fontSize: 16
  },
  securityBannerTitle: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '800'
  },
  securityBulletList: {
    gap: 6
  },
  securityBullet: {
    color: '#4f5d67',
    fontSize: 14,
    lineHeight: 19
  },
  securityDismissButton: {
    alignSelf: 'flex-end',
    marginTop: 10,
    minHeight: 32,
    justifyContent: 'center'
  },
  securityDismissText: {
    color: '#FF6200',
    fontSize: 14,
    fontWeight: '800'
  },
  routeCard: {
    backgroundColor: '#ffffff',
    borderColor: '#f2d6c4',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 48,
    minWidth: 140,
    paddingHorizontal: 18
  },
  retryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800'
  },
  routeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  routeLabel: {
    color: '#7b6f66',
    fontSize: 17,
    fontWeight: '600'
  },
  badgeBase: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  badgeTextBase: {
    fontSize: 14,
    fontWeight: '700'
  },
  badgeReady: {
    backgroundColor: '#e2f7e8'
  },
  badgeReadyText: {
    color: '#1e8a44'
  },
  badgeInProgress: {
    backgroundColor: '#ffe6d6'
  },
  badgeInProgressText: {
    color: '#c75d14'
  },
  badgeComplete: {
    backgroundColor: '#ececec'
  },
  badgeCompleteText: {
    color: '#676767'
  },
  stopCount: {
    color: '#173042',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 6
  },
  routeSummaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12
  },
  routeSummaryChip: {
    backgroundColor: '#f8fafc',
    borderColor: '#e4ebf0',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 30,
    justifyContent: 'center',
    paddingHorizontal: 10
  },
  routeSummaryText: {
    color: '#365067',
    fontSize: 13,
    fontWeight: '700'
  },
  routeHint: {
    color: '#61727d',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 18
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderColor: '#ece6df',
    borderRadius: 24,
    borderWidth: 1,
    padding: 20
  },
  emptyTitle: {
    color: '#173042',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10
  },
  emptyBody: {
    color: '#666666',
    fontSize: 16,
    lineHeight: 22
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 'auto'
  },
  actionButton: {
    flex: 1,
    marginTop: 0
  },
  clockButton: {
    alignItems: 'center',
    backgroundColor: '#ffe8d8',
    borderRadius: 16,
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: 56,
    paddingHorizontal: 16
  },
  clockButtonPressed: {
    opacity: 0.9
  },
  clockButtonText: {
    color: '#173042',
    fontSize: 17,
    fontWeight: '700'
  },
  breakButton: {
    alignItems: 'center',
    backgroundColor: '#edf2f7',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16
  },
  breakButtonPressed: {
    opacity: 0.9
  },
  breakButtonText: {
    color: '#173042',
    fontSize: 17,
    fontWeight: '700'
  },
  timeStatusCard: {
    backgroundColor: '#ffffff',
    borderColor: '#ece6df',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  timeStatusText: {
    color: '#173042',
    fontSize: 14,
    fontWeight: '700'
  },
  timeStatusSubtext: {
    color: '#61727d',
    fontSize: 13,
    marginTop: 6
  },
  buttonDisabled: {
    opacity: 0.65
  },
  buttonPressed: {
    opacity: 0.92
  }
});
