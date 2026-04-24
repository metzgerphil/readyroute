import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';
import {
  getDriverFromToken,
  getToken,
  removeClockInTime,
  removeToken,
  saveClockInTime
} from '../services/auth';
import { loadStatusCodes } from '../services/statusCodes';

export const DAILY_SAFETY_REMINDERS = [
  {
    id: 'pretrip',
    title: 'Pre-trip finds problems before the road does',
    source: 'Driver Safety Guidebook: Pre-trip Inspection',
    bullets: [
      'Complete a pre-trip for every vehicle you drive that day, not just the first truck you touch.',
      'Verify the basics before rolling: 3 reflective triangles, charged fire extinguisher, required documents, and spare fuses.',
      'Check tires, leaks, lights, mirrors, brakes, and windshield while the truck is still parked.'
    ],
    takeaway: 'The book is clear that skipped inspections lead to missed defects, fines, and unsafe breakdowns later in the day.'
  },
  {
    id: 'loading',
    title: 'Load the truck so your next stop is safer and faster',
    source: 'Driver Safety Guidebook: Loading Safety',
    bullets: [
      'Keep aisleways clear and as much freight on the shelves as possible to reduce trip hazards.',
      'Pull the next few stops toward the rear so you are not climbing through boxes at every delivery.',
      'Check weight labels before lifting and keep the load close while lifting with your legs, not your back.'
    ],
    takeaway: 'Good loading is not just speed. It prevents falls, damaged packages, and avoidable lifting injuries.'
  },
  {
    id: 'weather',
    title: 'Rain and slick roads demand more space, not more confidence',
    source: 'Driver Safety Guidebook: Rain, Cold Weather, and Hydroplaning',
    bullets: [
      'The first 10 minutes of rain are especially slick because oil and water mix on the roadway.',
      'Slow down, increase following distance, and treat standing water as a hydroplaning risk.',
      'Never use cruise control in wet, snowy, or icy conditions. If you skid, release the brake and steer gently into the skid.'
    ],
    takeaway: 'The guidebook stresses that traction disappears before most drivers realize it, so the adjustment has to happen early.'
  },
  {
    id: 'following-distance',
    title: 'Build a real following gap before you need it',
    source: 'Driver Safety Guidebook: Spatial Awareness',
    bullets: [
      'Below 40 mph, leave at least 1 second for every 10 feet of vehicle length.',
      'Above 40 mph, add one extra second to that gap.',
      'Use a fixed roadside object to count your spacing instead of guessing by feel.'
    ],
    takeaway: 'Stopping distance grows fast. Even a short lapse in space can erase your time to react.'
  },
  {
    id: 'seatbelt-distraction',
    title: 'Seatbelt on, distractions off, before the truck moves',
    source: 'Driver Safety Guidebook: Seatbelt Safety and Distracted Driving',
    bullets: [
      'Seatbelts are required for the driver and passengers, and buckling up takes only a few seconds.',
      'Phones, route sheets, eating, radio adjustments, and daydreaming all count as distracted driving.',
      'If you need to read, type, search, or sort something, do it while stopped, not while rolling.'
    ],
    takeaway: 'The book ties distraction directly to delayed perception and decision-making, which is where preventable crashes start.'
  },
  {
    id: 'backing',
    title: 'Avoid backing when you can. Slow it down when you cannot.',
    source: 'Driver Safety Guidebook: Backing and Parking Safety',
    bullets: [
      'If curb parking or a pull-through option exists, use it instead of backing into avoidable risk.',
      'Before backing, do a visual sweep, turn on hazard lights, and scan mirrors and blind spots continuously.',
      'If the path, clearance, or pedestrians are uncertain, stop and reevaluate before moving another foot.'
    ],
    takeaway: 'The guidebook points out that most backing crashes come from unseen obstacles or poor technique, both of which are preventable.'
  },
  {
    id: 'clearance',
    title: 'Roof damage usually starts with one bad clearance guess',
    source: 'Driver Safety Guidebook: Overhead Clearance',
    bullets: [
      'Know your vehicle height before the route starts, not when you are already under an awning.',
      'If it looks close, get out and walk the clearance instead of trying to save a few steps.',
      'Avoid overhangs and pass-throughs when the maneuver risk is higher than the convenience.'
    ],
    takeaway: 'The guidebook treats overhead strikes as a frequent and avoidable source of damage, especially near delivery points.'
  },
  {
    id: 'security',
    title: 'Secure the truck and stay alert to the scene around it',
    source: 'Driver Safety Guidebook: Driver Communication, Road Rage, and Vehicle Security',
    bullets: [
      'Lock the vehicle when doors are not in use and never leave it running unattended.',
      'Park in a visible area, survey the people and activity around you, and move if the situation feels unsafe.',
      'If another driver escalates, do not engage. Let them go, maintain your lane, and call 911 if the danger continues.'
    ],
    takeaway: 'The book makes the same point in several sections: safety drops fast when frustration or convenience starts making decisions for you.'
  }
];

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

export function getTodayStorageDate() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function getDayOfYear(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const today = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffMs = today.getTime() - startOfYear.getTime();
  return Math.floor(diffMs / 86400000);
}

export function getDailySafetyReminder(date = new Date()) {
  const index = (getDayOfYear(date) - 1) % DAILY_SAFETY_REMINDERS.length;
  return DAILY_SAFETY_REMINDERS[(index + DAILY_SAFETY_REMINDERS.length) % DAILY_SAFETY_REMINDERS.length];
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
        actionLabel: 'Acknowledge'
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

function isUnauthorizedError(error) {
  return error?.response?.status === 401;
}

export default function HomeScreen({ navigation, onLogout }) {
  const isMountedRef = useRef(true);
  const activeBreakTimerRef = useRef(null);
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

  async function loadHomeData({ showAlert = true, isRetry = false } = {}) {
    if (isRetry && isMountedRef.current) {
      setIsRetryingLoad(true);
    }

    try {
      const [token, routeResponse, timecardStatusResponse] = await Promise.all([
        getToken(),
        api.get('/routes/today'),
        api.get('/timecards/status')
      ]);

      if (!isMountedRef.current) {
        return;
      }

      const payload = getDriverFromToken(token);
      setDriverName(payload?.name || 'Driver');
      const timecardStatus = timecardStatusResponse;
      const activeTimecard = timecardStatus?.data?.active_timecard || null;
      const activeBreakState = timecardStatus?.data?.active_break || null;
      const resolvedClockIn = activeTimecard?.clock_in || null;

      setClockedInAt(resolvedClockIn);
      setActiveBreak(activeBreakState);
      setRoute(routeResponse.data?.route || null);
      setLoadError(null);

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

      if (isUnauthorizedError(error)) {
        await removeClockInTime();
        await removeToken();
        onLogout();
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
      if (activeBreakTimerRef.current) {
        clearTimeout(activeBreakTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeBreakTimerRef.current) {
      clearTimeout(activeBreakTimerRef.current);
      activeBreakTimerRef.current = null;
    }

    const autoEndAt = getBreakAutoEndTimestamp(activeBreak);

    if (!autoEndAt) {
      return undefined;
    }

    const remainingMs = new Date(autoEndAt).getTime() - Date.now();

    if (!Number.isFinite(remainingMs)) {
      return undefined;
    }

    if (remainingMs <= 0) {
      loadHomeData({ showAlert: false });
      return undefined;
    }

    activeBreakTimerRef.current = setTimeout(() => {
      loadHomeData({ showAlert: false });
    }, remainingMs + 250);

    return () => {
      if (activeBreakTimerRef.current) {
        clearTimeout(activeBreakTimerRef.current);
        activeBreakTimerRef.current = null;
      }
    };
  }, [activeBreak]);

  async function handleRetryLoad() {
    setIsRetryingLoad(true);
    await loadHomeData({ showAlert: false, isRetry: true });
  }

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

  const friendlyDate = getFriendlyDate();
  const greeting = getGreetingByTime();
  const routePresentation = route ? getRoutePresentation(route.status) : null;
  const routeSummary = getRouteSummary(route);
  const breakButtonLabel = activeBreak ? `End ${formatBreakLabel(activeBreak.break_type)}` : 'Break';
  const dailyReminder = useMemo(() => getDailySafetyReminder(new Date()), []);

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

            <View style={styles.safetyCard}>
              <View style={styles.safetyCardHeader}>
                <Text style={styles.safetyEyebrow}>Today&apos;s safety focus</Text>
              </View>

              <Text style={styles.safetyTitle}>{dailyReminder.title}</Text>
              <Text style={styles.safetySource}>{dailyReminder.source}</Text>

              <View style={styles.safetyBulletList}>
                {dailyReminder.bullets.map((bullet) => (
                  <View key={bullet} style={styles.safetyBulletRow}>
                    <Text style={styles.safetyBulletDot}>•</Text>
                    <Text style={styles.safetyBullet}>{bullet}</Text>
                  </View>
                ))}
              </View>

              {route ? (
                <View style={styles.routeMetaRow}>
                  {routeSummary.map((item) => (
                    <View key={item} style={styles.routeMetaChip}>
                      <Text style={styles.routeMetaSecondary}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.inlineEmptyState}>
                  <Text style={styles.inlineEmptyTitle}>No route assigned yet</Text>
                  <Text style={styles.inlineEmptyBody}>Your manager still needs to assign today&apos;s route.</Text>
                </View>
              )}
            </View>

            {routePresentation?.actionLabel ? (
              <Pressable
                disabled={isStartingRoute}
                onPress={handleRouteAction}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.startRouteButton,
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

          <View style={styles.actionRow}>
            <Pressable
              disabled={isUpdatingClock || (!route && !clockedInAt)}
              onPress={handleClockToggle}
              style={({ pressed }) => [
                styles.clockButton,
                clockedInAt ? styles.clockButtonActive : styles.clockButtonIdle,
                styles.actionButton,
                (isUpdatingClock || (!route && !clockedInAt)) && styles.buttonDisabled,
                pressed && !isUpdatingClock ? styles.clockButtonPressed : null
              ]}
            >
              {isUpdatingClock ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[styles.clockButtonText, clockedInAt ? styles.clockButtonTextActive : styles.clockButtonTextIdle]}>
                  {clockedInAt ? 'Clock Out' : 'Clock In'}
                </Text>
              )}
            </Pressable>

            <Pressable
              disabled={isUpdatingBreak || !clockedInAt}
              onPress={handleBreakToggle}
              style={({ pressed }) => [
                styles.breakButton,
                activeBreak ? styles.breakButtonActive : styles.breakButtonIdle,
                styles.actionButton,
                (isUpdatingBreak || !clockedInAt) && styles.buttonDisabled,
                pressed && !isUpdatingBreak ? styles.breakButtonPressed : null
              ]}
            >
              {isUpdatingBreak ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={[styles.breakButtonText, activeBreak ? styles.breakButtonTextActive : styles.breakButtonTextIdle]}>
                  {breakButtonLabel}
                </Text>
              )}
            </Pressable>
          </View>

          {clockedInAt || activeBreak ? (
            <View style={styles.timeStatusCard}>
              {clockedInAt ? <Text style={styles.timeStatusText}>Clocked in: {formatLaborTime(clockedInAt)}</Text> : null}
              {activeBreak ? (
                <Text style={styles.timeStatusSubtext}>
                  {`${formatBreakLabel(activeBreak.break_type)} started at ${formatLaborTime(activeBreak.started_at)}`}
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
    gap: 14
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
  emptyTitle: {
    color: '#173042',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10
  },
  emptyText: {
    color: '#666666',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center'
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
  safetyCard: {
    backgroundColor: '#FFF3CD',
    borderColor: '#f4d2b8',
    borderRadius: 26,
    borderWidth: 1,
    minHeight: 0,
    padding: 22
  },
  safetyCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 10
  },
  safetyEyebrow: {
    color: '#8a5b2c',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  safetyTitle: {
    color: '#173042',
    fontSize: 29,
    fontWeight: '800',
    lineHeight: 36,
    marginBottom: 10
  },
  safetySource: {
    color: '#6f655d',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 14
  },
  safetyBulletList: {
    gap: 12
  },
  safetyBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
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
  safetyBulletDot: {
    color: '#c75d14',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24
  },
  safetyBullet: {
    color: '#344754',
    flex: 1,
    fontSize: 16,
    lineHeight: 24
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
  routeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16
  },
  routeMetaChip: {
    backgroundColor: '#f8fafc',
    borderColor: '#e4ebf0',
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  routeMetaSecondary: {
    color: '#365067',
    fontSize: 13,
    fontWeight: '700'
  },
  inlineEmptyState: {
    backgroundColor: '#ffffff',
    borderColor: '#ece6df',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 20,
    padding: 16
  },
  inlineEmptyTitle: {
    color: '#173042',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6
  },
  inlineEmptyBody: {
    color: '#666666',
    fontSize: 14,
    lineHeight: 20
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16
  },
  startRouteButton: {
    marginTop: 4
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700'
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2
  },
  actionButton: {
    flex: 1
  },
  clockButton: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16
  },
  clockButtonIdle: {
    backgroundColor: '#3f3f3f'
  },
  clockButtonActive: {
    backgroundColor: '#3f3f3f'
  },
  clockButtonPressed: {
    opacity: 0.9
  },
  clockButtonText: {
    fontSize: 17,
    fontWeight: '700'
  },
  clockButtonTextIdle: {
    color: '#ffffff'
  },
  clockButtonTextActive: {
    color: '#ffffff'
  },
  breakButton: {
    alignItems: 'center',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 16
  },
  breakButtonIdle: {
    backgroundColor: '#4d148c'
  },
  breakButtonActive: {
    backgroundColor: '#3c0f6f'
  },
  breakButtonPressed: {
    opacity: 0.9
  },
  breakButtonText: {
    fontSize: 17,
    fontWeight: '700'
  },
  breakButtonTextIdle: {
    color: '#ffffff'
  },
  breakButtonTextActive: {
    color: '#ffffff'
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
