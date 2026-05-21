import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';

import api from '../services/api';
import appTheme from '../theme/appTheme';
import {
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

  const pickupStopCount = Number(route.pickup_stop_count || route.pickup_stops || route.driver_pickup_stops || 0);
  const completedPickups = Number(route.pickup_stops_completed || route.completed_pickup_stops || 0);

  return [
    route.work_area_name ? `Route ${route.work_area_name}` : null,
    route.vehicle_name || route.vehicle_id ? `Vehicle ${route.vehicle_name || route.vehicle_id}` : null,
    route.stops_per_hour != null ? `${route.stops_per_hour} stops/hr` : null,
    pickupStopCount > 0 ? `${completedPickups}/${pickupStopCount} pickups` : null
  ].filter(Boolean);
}

export function formatMileage(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString('en-US') : '0';
}

export function getOdometerRequirement(driverDay, route) {
  const requirement = driverDay?.odometer_requirement || null;

  if (!route || !requirement?.required || requirement.submitted) {
    return null;
  }

  const lastRecorded = Number(requirement.last_recorded_odometer ?? route.vehicle?.current_mileage ?? 0);
  const minimum = Number(requirement.minimum_odometer ?? lastRecorded);
  const maximum = Number(requirement.maximum_odometer ?? minimum + 300);

  return {
    ...requirement,
    vehicle_id: requirement.vehicle_id || route.vehicle_id || route.vehicle?.id || null,
    vehicle_name: requirement.vehicle_name || route.vehicle_name || route.vehicle?.name || null,
    last_recorded_odometer: Number.isFinite(lastRecorded) ? lastRecorded : 0,
    minimum_odometer: Number.isFinite(minimum) ? minimum : 0,
    maximum_odometer: Number.isFinite(maximum) ? maximum : 300
  };
}

export function getVehicleCheckRequirement(driverDay, route) {
  const requirement = driverDay?.vehicle_check_requirement || null;

  if (!route || !requirement?.required || requirement.submitted) {
    return null;
  }

  const lastRecorded = Number(requirement.last_recorded_odometer ?? route.vehicle?.current_mileage ?? 0);
  const minimum = Number(requirement.minimum_odometer ?? lastRecorded);
  const maximum = Number(requirement.maximum_odometer ?? minimum + 300);

  return {
    ...requirement,
    vehicle_id: requirement.vehicle_id || route.vehicle_id || route.vehicle?.id || null,
    vehicle_name: requirement.vehicle_name || route.vehicle_name || route.vehicle?.name || null,
    last_recorded_odometer: Number.isFinite(lastRecorded) ? lastRecorded : 0,
    minimum_odometer: Number.isFinite(minimum) ? minimum : 0,
    maximum_odometer: Number.isFinite(maximum) ? maximum : 300,
    checklist_fields: Array.isArray(requirement.checklist_fields) ? requirement.checklist_fields : []
  };
}

export function getVehicleChecklistValue(status) {
  if (status === 'fail') {
    return 'Needs Attention';
  }

  if (status === 'not_applicable') {
    return 'Not Applicable';
  }

  return 'Good';
}

export function getDriverDayStatus(driverDay, route) {
  if (route) {
    return 'dispatched';
  }

  return driverDay?.status || 'unassigned';
}

export function getDriverWaitingCopy(driverDay) {
  const routePreview = driverDay?.route_preview || null;
  const routeLabel = routePreview?.work_area_name ? `Route ${routePreview.work_area_name}` : 'Your route';
  const syncedLine = routePreview?.last_manifest_sync_at
    ? ` ReadyRoute last staged it at ${new Date(routePreview.last_manifest_sync_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })}.`
    : '';

  return {
    title: 'Route staged for dispatch',
    body: `${routeLabel} is loaded in ReadyRoute and waiting for your lead manager to dispatch the day.${syncedLine}`
  };
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
      body: 'FCC changed this route after it went live. Review your next stops carefully before heading out.'
    };
  }

  return null;
}

export function hasGrantedLocationPermission(permission) {
  return Boolean(permission?.granted || permission?.status === 'granted');
}

export function getLocationRequirementCopy() {
  return {
    title: 'Enable location for route tracking',
    body: 'ReadyRoute uses your location while you are on route so your manager can see route progress, support dispatch decisions, and locate drivers during the workday.',
    bullets: [
      'Shows your route location to your manager while you are working.',
      'Helps dispatch support pickups, rescues, and route progress.',
      'Keeps the fleet map accurate during the day.'
    ],
    secondary: 'You can manage location access later in your device settings.',
    blocked: 'Location access is required to run a route in ReadyRoute.'
  };
}

export function shouldPromptForLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return !status || status === 'undetermined';
}

export function isBlockedLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return status === 'denied' && !permission?.canAskAgain;
}

export function isDeniedLocationPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return status === 'denied' || (!status && permission?.granted === false);
}

function isUnauthorizedError(error) {
  return error?.response?.status === 401;
}

export default function HomeScreen({ navigation, onLogout }) {
  const isMountedRef = useRef(true);
  const activeBreakTimerRef = useRef(null);
  const [route, setRoute] = useState(null);
  const [clockedInAt, setClockedInAt] = useState(null);
  const [activeBreak, setActiveBreak] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStartingRoute, setIsStartingRoute] = useState(false);
  const [isSubmittingOdometer, setIsSubmittingOdometer] = useState(false);
  const [odometerInput, setOdometerInput] = useState('');
  const [odometerError, setOdometerError] = useState('');
  const [isSubmittingVehicleCheck, setIsSubmittingVehicleCheck] = useState(false);
  const [vehicleCheckConfirmed, setVehicleCheckConfirmed] = useState(false);
  const [vehicleCheckOdometerInput, setVehicleCheckOdometerInput] = useState('');
  const [vehicleCheckIssueNote, setVehicleCheckIssueNote] = useState('');
  const [vehicleChecklistStatuses, setVehicleChecklistStatuses] = useState({});
  const [vehicleCheckError, setVehicleCheckError] = useState('');
  const [isUpdatingClock, setIsUpdatingClock] = useState(false);
  const [isUpdatingBreak, setIsUpdatingBreak] = useState(false);
  const [isRetryingLoad, setIsRetryingLoad] = useState(false);
  const [isResolvingLocationPermission, setIsResolvingLocationPermission] = useState(false);
  const [hasLocationAccess, setHasLocationAccess] = useState(false);
  const [isLocationPermissionBlocked, setIsLocationPermissionBlocked] = useState(false);
  const [isLocationPermissionDenied, setIsLocationPermissionDenied] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [driverDay, setDriverDay] = useState({ status: 'unknown' });

  async function ensureLocationPermission({ showAlert = false } = {}) {
    setIsResolvingLocationPermission(true);

    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      const permission = shouldPromptForLocationPermission(currentPermission)
        ? await Location.requestForegroundPermissionsAsync()
        : currentPermission;
      const granted = hasGrantedLocationPermission(permission);
      const blocked = isBlockedLocationPermission(permission);

      if (isMountedRef.current) {
        setHasLocationAccess(granted);
        setIsLocationPermissionBlocked(blocked);
        setIsLocationPermissionDenied(!granted && isDeniedLocationPermission(permission));
      }

      if (!granted && showAlert) {
        const copy = getLocationRequirementCopy();
        Alert.alert('Location required', copy.blocked, [
          {
            text: 'Not now',
            style: 'cancel'
          },
          {
            text: 'Open Settings',
            onPress: () => {
              Linking.openSettings?.().catch(() => {});
            }
          }
        ]);
      }

      return granted;
    } catch (_error) {
      if (isMountedRef.current) {
        setHasLocationAccess(false);
        setIsLocationPermissionBlocked(false);
        setIsLocationPermissionDenied(false);
      }

      if (showAlert) {
        Alert.alert('Location required', getLocationRequirementCopy().blocked);
      }

      return false;
    } finally {
      if (isMountedRef.current) {
        setIsResolvingLocationPermission(false);
      }
    }
  }

  async function checkLocationPermission() {
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();

      if (isMountedRef.current) {
        setHasLocationAccess(hasGrantedLocationPermission(currentPermission));
        setIsLocationPermissionBlocked(isBlockedLocationPermission(currentPermission));
        setIsLocationPermissionDenied(isDeniedLocationPermission(currentPermission));
      }
    } catch (_error) {
      if (isMountedRef.current) {
        setHasLocationAccess(false);
        setIsLocationPermissionBlocked(false);
        setIsLocationPermissionDenied(false);
      }
    }
  }

  async function loadHomeData({ showAlert = true, isRetry = false } = {}) {
    if (isRetry && isMountedRef.current) {
      setIsRetryingLoad(true);
    }

    try {
      const [routeResponse, timecardStatusResponse] = await Promise.all([
        api.get('/routes/today'),
        api.get('/timecards/status')
      ]);

      if (!isMountedRef.current) {
        return;
      }

      const timecardStatus = timecardStatusResponse;
      const activeTimecard = timecardStatus?.data?.active_timecard || null;
      const activeBreakState = timecardStatus?.data?.active_break || null;
      const resolvedClockIn = activeTimecard?.clock_in || null;
      const nextRoute = routeResponse.data?.route || null;
      const nextDriverDay = routeResponse.data?.driver_day || {
        status: nextRoute ? 'dispatched' : 'unassigned'
      };

      setClockedInAt(resolvedClockIn);
      setActiveBreak(activeBreakState);
      setRoute(nextRoute);
      setDriverDay(nextDriverDay);
      setLoadError(null);

      if (resolvedClockIn) {
        Promise.resolve(saveClockInTime(resolvedClockIn)).catch(() => {});
      } else {
        Promise.resolve(removeClockInTime()).catch(() => {});
      }

      Promise.resolve(loadStatusCodes()).catch(() => {});
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
    checkLocationPermission();
    loadHomeData();

    return () => {
      isMountedRef.current = false;
      if (activeBreakTimerRef.current) {
        clearTimeout(activeBreakTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('focus', () => {
      loadHomeData({ showAlert: false });
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const driverDayStatus = getDriverDayStatus(driverDay, route);

    if (driverDayStatus !== 'awaiting_dispatch') {
      return undefined;
    }

    const interval = setInterval(() => {
      loadHomeData({ showAlert: false });
    }, 30000);

    return () => clearInterval(interval);
  }, [driverDay, route]);

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

  useEffect(() => {
    const requirement = getVehicleCheckRequirement(driverDay, route);

    if (!requirement) {
      setVehicleCheckConfirmed(false);
      setVehicleCheckOdometerInput('');
      setVehicleCheckIssueNote('');
      setVehicleChecklistStatuses({});
      setVehicleCheckError('');
      return;
    }

    setVehicleChecklistStatuses((current) => {
      const next = { ...current };
      for (const field of requirement.checklist_fields) {
        if (!next[field.id]) {
          next[field.id] = 'pass';
        }
      }
      return next;
    });
  }, [
    driverDay?.vehicle_check_requirement?.vehicle_id,
    driverDay?.vehicle_check_requirement?.inspection_date,
    driverDay?.vehicle_check_requirement?.submitted,
    route?.id
  ]);

  async function handleRetryLoad() {
    setIsRetryingLoad(true);
    await loadHomeData({ showAlert: false, isRetry: true });
  }

  async function handleLogout() {
    await removeClockInTime();
    await removeToken();
    onLogout();
  }

  async function continueIntoRouteWorkflow() {
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

  async function handleRouteAction() {
    if (!route) {
      return;
    }

    const hasPermission = await ensureLocationPermission({ showAlert: true });

    if (!hasPermission) {
      return;
    }

    const vehicleCheckRequirement = getVehicleCheckRequirement(driverDay, route);
    if (vehicleCheckRequirement) {
      setVehicleCheckError('Complete the vehicle check before continuing.');
      return;
    }

    const requirement = getOdometerRequirement(driverDay, route);
    if (requirement) {
      setOdometerError('Enter the current truck odometer before continuing.');
      return;
    }

    await continueIntoRouteWorkflow();
  }

  async function handleSubmitVehicleCheck() {
    if (!route) {
      return;
    }

    const requirement = getVehicleCheckRequirement(driverDay, route);
    if (!requirement) {
      await continueIntoRouteWorkflow();
      return;
    }

    if (requirement.require_truck_confirmation && !vehicleCheckConfirmed) {
      setVehicleCheckError('Confirm this is the truck you are driving today.');
      return;
    }

    const parsedOdometer = requirement.require_odometer_entry
      ? Number(vehicleCheckOdometerInput)
      : null;

    if (requirement.require_odometer_entry && !Number.isInteger(parsedOdometer)) {
      setVehicleCheckError('Enter the current odometer reading as a whole number.');
      return;
    }

    if (
      requirement.require_odometer_entry &&
      (parsedOdometer < requirement.minimum_odometer || parsedOdometer > requirement.maximum_odometer)
    ) {
      setVehicleCheckError('Odometer reading is outside the allowed range. Please recheck the truck odometer or contact your manager.');
      return;
    }

    const items = requirement.require_full_checklist
      ? requirement.checklist_fields.map((field, index) => {
          const status = vehicleChecklistStatuses[field.id] || 'pass';
          return {
            checklist_item_key: field.id || `item_${index + 1}`,
            label: field.label || field.id || `Item ${index + 1}`,
            status,
            value: getVehicleChecklistValue(status)
          };
        })
      : [];
    const issueNote = vehicleCheckIssueNote.trim();

    setIsSubmittingVehicleCheck(true);
    setVehicleCheckError('');

    try {
      await api.post('/vehicles/inspections', {
        vehicle_id: requirement.vehicle_id,
        route_id: route.id,
        inspection_type: requirement.inspection_type || 'daily_check',
        inspection_date: requirement.inspection_date,
        odometer: parsedOdometer,
        issue_reported: Boolean(issueNote) || items.some((item) => item.status === 'fail'),
        issue_note: issueNote || null,
        items
      });

      setDriverDay((current) => ({
        ...current,
        vehicle_check_requirement: {
          ...(current?.vehicle_check_requirement || {}),
          submitted: true
        },
        odometer_requirement: requirement.require_odometer_entry
          ? {
              ...(current?.odometer_requirement || {}),
              submitted: true,
              latest_entry: {
                odometer_reading: parsedOdometer
              }
            }
          : current?.odometer_requirement
      }));
      if (requirement.require_odometer_entry) {
        setRoute((current) => current
          ? {
              ...current,
              vehicle: current.vehicle
                ? { ...current.vehicle, current_mileage: parsedOdometer }
                : current.vehicle,
              vehicle_current_mileage: parsedOdometer
            }
          : current);
      }
      setVehicleCheckConfirmed(false);
      setVehicleCheckOdometerInput('');
      setVehicleCheckIssueNote('');
      setVehicleChecklistStatuses({});
      await continueIntoRouteWorkflow();
    } catch (error) {
      setVehicleCheckError(error.response?.data?.error || 'Unable to save the vehicle check right now.');
    } finally {
      setIsSubmittingVehicleCheck(false);
    }
  }

  async function handleSubmitOdometer() {
    if (!route) {
      return;
    }

    const requirement = getOdometerRequirement(driverDay, route);
    if (!requirement) {
      await continueIntoRouteWorkflow();
      return;
    }

    const parsedOdometer = Number(odometerInput);

    if (!Number.isInteger(parsedOdometer)) {
      setOdometerError('Enter the current odometer reading as a whole number.');
      return;
    }

    if (parsedOdometer < requirement.minimum_odometer || parsedOdometer > requirement.maximum_odometer) {
      setOdometerError('Odometer reading is outside the allowed range. Please recheck the truck odometer or contact your manager.');
      return;
    }

    setIsSubmittingOdometer(true);
    setOdometerError('');

    try {
      await api.post('/routes/odometer', {
        vehicle_id: requirement.vehicle_id,
        route_id: route.id,
        odometer_reading: parsedOdometer
      });

      setDriverDay((current) => ({
        ...current,
        odometer_requirement: {
          ...(current?.odometer_requirement || {}),
          submitted: true,
          latest_entry: {
            odometer_reading: parsedOdometer
          }
        }
      }));
      setRoute((current) => current
        ? {
            ...current,
            vehicle: current.vehicle
              ? { ...current.vehicle, current_mileage: parsedOdometer }
              : current.vehicle,
            vehicle_current_mileage: parsedOdometer
          }
        : current);
      setOdometerInput('');
      await continueIntoRouteWorkflow();
    } catch (error) {
      setOdometerError(
        error.response?.data?.error ||
        'Odometer reading is outside the allowed range. Please recheck the truck odometer or contact your manager.'
      );
    } finally {
      setIsSubmittingOdometer(false);
    }
  }

  async function handleClockToggle() {
    if (!clockedInAt) {
      const hasPermission = await ensureLocationPermission({ showAlert: true });

      if (!hasPermission) {
        return;
      }
    }

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
  const routePresentation = route ? getRoutePresentation(route.status) : null;
  const routeSummary = getRouteSummary(route);
  const driverDayStatus = getDriverDayStatus(driverDay, route);
  const waitingCopy = getDriverWaitingCopy(driverDay);
  const postDispatchNotice = getPostDispatchChangeNotice(route);
  const vehicleCheckRequirement = getVehicleCheckRequirement(driverDay, route);
  const odometerRequirement = getOdometerRequirement(driverDay, route);
  const locationRequirementCopy = getLocationRequirementCopy();
  const showLocationGate = Boolean(route && !hasLocationAccess);
  const locationPermissionDenied = isLocationPermissionBlocked || isLocationPermissionDenied;
  const locationButtonLabel = locationPermissionDenied ? 'Open Settings' : 'Enable Location';
  const breakButtonLabel = activeBreak ? `End ${formatBreakLabel(activeBreak.break_type)}` : 'Break';
  const dailyReminder = useMemo(() => getDailySafetyReminder(new Date()), []);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={appTheme.colors.orange} size="large" />
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
                <Text style={styles.dateText}>{friendlyDate}</Text>
              </View>
              <Pressable onPress={handleLogout} style={styles.logoutButton}>
                <Text style={styles.logoutText}>Logout</Text>
              </Pressable>
            </View>

            {showLocationGate ? (
              <View style={styles.locationGateCard}>
                <Text style={styles.locationGateTitle}>{locationRequirementCopy.title}</Text>
                <Text style={styles.locationGateBody}>{locationRequirementCopy.body}</Text>
                <View style={styles.locationGateBullets}>
                  {locationRequirementCopy.bullets.map((bullet) => (
                    <View key={bullet} style={styles.locationGateBulletRow}>
                      <Text style={styles.locationGateBulletDot}>•</Text>
                      <Text style={styles.locationGateBulletText}>{bullet}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.locationGateSecondary}>
                  {locationPermissionDenied ? locationRequirementCopy.blocked : locationRequirementCopy.secondary}
                </Text>
                <Pressable
                  onPress={() => {
                    if (locationPermissionDenied) {
                      Linking.openSettings?.().catch(() => {});
                      return;
                    }

                    ensureLocationPermission({ showAlert: true });
                  }}
                  style={({ pressed }) => [
                    styles.locationGateButton,
                    isResolvingLocationPermission && styles.buttonDisabled,
                    pressed && !isResolvingLocationPermission ? styles.buttonPressed : null
                  ]}
                >
                  {isResolvingLocationPermission ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.locationGateButtonText}>{locationButtonLabel}</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

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
                  <Text style={styles.inlineEmptyTitle}>
                    {driverDayStatus === 'awaiting_dispatch' ? waitingCopy.title : 'No route assigned yet'}
                  </Text>
                  <Text style={styles.inlineEmptyBody}>
                    {driverDayStatus === 'awaiting_dispatch'
                      ? waitingCopy.body
                      : 'Your manager still needs to assign today&apos;s route.'}
                  </Text>
                </View>
              )}
            </View>

            {postDispatchNotice ? (
              <View style={styles.inlineNoticeState}>
                <Text style={styles.inlineNoticeTitle}>{postDispatchNotice.title}</Text>
                <Text style={styles.inlineNoticeBody}>{postDispatchNotice.body}</Text>
              </View>
            ) : null}

            {vehicleCheckRequirement && hasLocationAccess ? (
              <View style={styles.odometerCard}>
                <Text style={styles.odometerEyebrow}>Required before route start</Text>
                <Text style={styles.odometerTitle}>
                  {vehicleCheckRequirement.require_full_checklist ? 'Complete vehicle inspection' : 'Complete vehicle check'}
                </Text>
                <Text style={styles.odometerBody}>
                  {vehicleCheckRequirement.vehicle_name || vehicleCheckRequirement.vehicle_id || 'Selected truck'}
                </Text>

                {vehicleCheckRequirement.require_truck_confirmation ? (
                  <Pressable
                    onPress={() => {
                      setVehicleCheckConfirmed((current) => !current);
                      setVehicleCheckError('');
                    }}
                    style={({ pressed }) => [
                      styles.vehicleCheckConfirmRow,
                      vehicleCheckConfirmed && styles.vehicleCheckConfirmRowActive,
                      pressed ? styles.buttonPressed : null
                    ]}
                  >
                    <View style={[
                      styles.vehicleCheckCheckbox,
                      vehicleCheckConfirmed && styles.vehicleCheckCheckboxActive
                    ]}>
                      <Text style={styles.vehicleCheckCheckboxText}>{vehicleCheckConfirmed ? '✓' : ''}</Text>
                    </View>
                    <Text style={styles.vehicleCheckConfirmText}>
                      I confirm this is my truck for today.
                    </Text>
                  </Pressable>
                ) : null}

                {vehicleCheckRequirement.require_odometer_entry ? (
                  <>
                    <View style={styles.odometerDetailGrid}>
                      <View style={styles.odometerDetail}>
                        <Text style={styles.odometerDetailLabel}>Last recorded</Text>
                        <Text style={styles.odometerDetailValue}>
                          {formatMileage(vehicleCheckRequirement.last_recorded_odometer)}
                        </Text>
                      </View>
                      <View style={styles.odometerDetail}>
                        <Text style={styles.odometerDetailLabel}>Acceptable range</Text>
                        <Text style={styles.odometerDetailValue}>
                          {formatMileage(vehicleCheckRequirement.minimum_odometer)} to {formatMileage(vehicleCheckRequirement.maximum_odometer)}
                        </Text>
                      </View>
                    </View>
                    <TextInput
                      keyboardType="number-pad"
                      onChangeText={(value) => {
                        setVehicleCheckOdometerInput(value.replace(/[^\d]/g, ''));
                        setVehicleCheckError('');
                      }}
                      placeholder="Current odometer reading"
                      placeholderTextColor={appTheme.colors.textMuted}
                      style={styles.odometerInput}
                      value={vehicleCheckOdometerInput}
                    />
                  </>
                ) : null}

                {vehicleCheckRequirement.require_full_checklist ? (
                  <View style={styles.vehicleChecklist}>
                    {vehicleCheckRequirement.checklist_fields.map((field) => {
                      const selectedStatus = vehicleChecklistStatuses[field.id] || 'pass';
                      return (
                        <View key={field.id} style={styles.vehicleChecklistItem}>
                          <Text style={styles.vehicleChecklistLabel}>{field.label}</Text>
                          <View style={styles.vehicleChecklistChoices}>
                            {[
                              ['pass', 'Good'],
                              ['fail', 'Needs attention'],
                              ['not_applicable', 'N/A']
                            ].map(([status, label]) => (
                              <Pressable
                                key={status}
                                onPress={() => {
                                  setVehicleChecklistStatuses((current) => ({
                                    ...current,
                                    [field.id]: status
                                  }));
                                  setVehicleCheckError('');
                                }}
                                style={[
                                  styles.vehicleChecklistChoice,
                                  selectedStatus === status && styles.vehicleChecklistChoiceActive
                                ]}
                              >
                                <Text style={[
                                  styles.vehicleChecklistChoiceText,
                                  selectedStatus === status && styles.vehicleChecklistChoiceTextActive
                                ]}>
                                  {label}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {vehicleCheckRequirement.show_issue_note_box ? (
                  <TextInput
                    multiline
                    onChangeText={(value) => {
                      setVehicleCheckIssueNote(value);
                      setVehicleCheckError('');
                    }}
                    placeholder="Report any issue noticed today"
                    placeholderTextColor={appTheme.colors.textMuted}
                    style={[styles.odometerInput, styles.vehicleCheckNoteInput]}
                    value={vehicleCheckIssueNote}
                  />
                ) : null}

                {vehicleCheckError ? <Text style={styles.odometerError}>{vehicleCheckError}</Text> : null}
                <Pressable
                  disabled={isSubmittingVehicleCheck}
                  onPress={handleSubmitVehicleCheck}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.startRouteButton,
                    isSubmittingVehicleCheck && styles.buttonDisabled,
                    pressed && !isSubmittingVehicleCheck ? styles.buttonPressed : null
                  ]}
                >
                  {isSubmittingVehicleCheck ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Save Vehicle Check</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {odometerRequirement && !vehicleCheckRequirement && hasLocationAccess ? (
              <View style={styles.odometerCard}>
                <Text style={styles.odometerEyebrow}>Required before route start</Text>
                <Text style={styles.odometerTitle}>Enter truck odometer</Text>
                <Text style={styles.odometerBody}>
                  {odometerRequirement.vehicle_name || odometerRequirement.vehicle_id || 'Selected vehicle'}
                </Text>
                <View style={styles.odometerDetailGrid}>
                  <View style={styles.odometerDetail}>
                    <Text style={styles.odometerDetailLabel}>Last recorded</Text>
                    <Text style={styles.odometerDetailValue}>{formatMileage(odometerRequirement.last_recorded_odometer)}</Text>
                  </View>
                  <View style={styles.odometerDetail}>
                    <Text style={styles.odometerDetailLabel}>Acceptable range</Text>
                    <Text style={styles.odometerDetailValue}>
                      {formatMileage(odometerRequirement.minimum_odometer)} to {formatMileage(odometerRequirement.maximum_odometer)}
                    </Text>
                  </View>
                </View>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => {
                    setOdometerInput(value.replace(/[^\d]/g, ''));
                    setOdometerError('');
                  }}
                  placeholder="Current odometer reading"
                  placeholderTextColor={appTheme.colors.textMuted}
                  style={styles.odometerInput}
                  value={odometerInput}
                />
                {odometerError ? <Text style={styles.odometerError}>{odometerError}</Text> : null}
                <Pressable
                  disabled={isSubmittingOdometer}
                  onPress={handleSubmitOdometer}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    styles.startRouteButton,
                    isSubmittingOdometer && styles.buttonDisabled,
                    pressed && !isSubmittingOdometer ? styles.buttonPressed : null
                  ]}
                >
                  {isSubmittingOdometer ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Continue</Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {routePresentation?.actionLabel && !vehicleCheckRequirement && !odometerRequirement ? (
              <Pressable
                disabled={isStartingRoute || !hasLocationAccess}
                onPress={handleRouteAction}
                style={({ pressed }) => [
                  styles.primaryButton,
                  styles.startRouteButton,
                  (isStartingRoute || !hasLocationAccess) && styles.buttonDisabled,
                  pressed && !isStartingRoute && hasLocationAccess ? styles.buttonPressed : null
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
              disabled={isUpdatingClock || (!route && !clockedInAt) || (!hasLocationAccess && !clockedInAt)}
              onPress={handleClockToggle}
              style={({ pressed }) => [
                styles.clockButton,
                clockedInAt ? styles.clockButtonActive : styles.clockButtonIdle,
                styles.actionButton,
                (isUpdatingClock || (!route && !clockedInAt) || (!hasLocationAccess && !clockedInAt)) && styles.buttonDisabled,
                pressed && !isUpdatingClock && (hasLocationAccess || clockedInAt) ? styles.clockButtonPressed : null
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
    backgroundColor: appTheme.colors.backgroundWarm
  },
  contentContainer: {
    flexGrow: 1,
    paddingBottom: appTheme.spacing.lg
  },
  container: {
    flex: 1,
    paddingHorizontal: appTheme.spacing.lg,
    paddingTop: appTheme.spacing.sm,
    paddingBottom: appTheme.spacing.lg
  },
  mainContent: {
    gap: appTheme.spacing.md
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
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.sm
  },
  emptyText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body,
    textAlign: 'center'
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: appTheme.spacing.sm,
    marginBottom: appTheme.spacing.xs,
    marginTop: 56
  },
  topRowText: {
    flex: 1,
    flexShrink: 1,
    paddingRight: appTheme.spacing.sm
  },
  dateText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: appTheme.typography.lineHeights.body
  },
  logoutButton: {
    alignSelf: 'flex-start',
    flexShrink: 0,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: appTheme.spacing.xs,
    paddingVertical: appTheme.spacing.xs
  },
  logoutText: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  locationGateCard: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.lg,
    borderWidth: 1,
    padding: appTheme.spacing.lg
  },
  locationGateTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.xs
  },
  locationGateBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  locationGateBullets: {
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.sm
  },
  locationGateBulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.xs
  },
  locationGateBulletDot: {
    color: appTheme.colors.orange,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  locationGateBulletText: {
    color: appTheme.colors.textSecondary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  locationGateSecondary: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    lineHeight: 18,
    marginTop: appTheme.spacing.sm
  },
  locationGateButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.buttons.radius,
    justifyContent: 'center',
    marginTop: appTheme.spacing.md,
    minHeight: appTheme.buttons.height,
    paddingHorizontal: appTheme.buttons.horizontalPadding
  },
  locationGateButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  odometerCard: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  odometerEyebrow: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  odometerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleSmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  odometerBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  odometerDetailGrid: {
    gap: appTheme.spacing.sm
  },
  odometerDetail: {
    backgroundColor: appTheme.colors.backgroundWarm,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.sm
  },
  odometerDetailLabel: {
    color: appTheme.colors.textMuted,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold,
    marginBottom: 2,
    textTransform: 'uppercase'
  },
  odometerDetailValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  odometerInput: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.bold,
    minHeight: 52,
    paddingHorizontal: appTheme.spacing.md
  },
  odometerError: {
    color: appTheme.colors.dangerText,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  vehicleCheckConfirmRow: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.backgroundWarm,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.sm
  },
  vehicleCheckConfirmRowActive: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: appTheme.colors.green
  },
  vehicleCheckCheckbox: {
    alignItems: 'center',
    borderColor: appTheme.colors.borderStrong,
    borderRadius: 8,
    borderWidth: 2,
    height: 28,
    justifyContent: 'center',
    width: 28
  },
  vehicleCheckCheckboxActive: {
    backgroundColor: appTheme.colors.greenText,
    borderColor: appTheme.colors.greenText
  },
  vehicleCheckCheckboxText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  vehicleCheckConfirmText: {
    color: appTheme.colors.textPrimary,
    flex: 1,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  vehicleChecklist: {
    gap: appTheme.spacing.sm
  },
  vehicleChecklistItem: {
    backgroundColor: appTheme.colors.backgroundWarm,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.sm
  },
  vehicleChecklistLabel: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  vehicleChecklistChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs
  },
  vehicleChecklistChoice: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: appTheme.spacing.sm,
    paddingVertical: 8
  },
  vehicleChecklistChoiceActive: {
    backgroundColor: appTheme.colors.orange,
    borderColor: appTheme.colors.orange
  },
  vehicleChecklistChoiceText: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.bold
  },
  vehicleChecklistChoiceTextActive: {
    color: appTheme.colors.textInverse
  },
  vehicleCheckNoteInput: {
    minHeight: 88,
    paddingTop: appTheme.spacing.sm,
    textAlignVertical: 'top'
  },
  safetyCard: {
    ...appTheme.shadows.card,
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.xl,
    borderWidth: 1,
    borderLeftColor: appTheme.colors.orange,
    borderLeftWidth: 4,
    minHeight: 0,
    padding: appTheme.spacing.lg
  },
  safetyCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: appTheme.spacing.sm
  },
  safetyEyebrow: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.eyebrow,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  safetyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 26,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 32,
    marginBottom: appTheme.spacing.sm
  },
  safetySource: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginBottom: appTheme.spacing.md
  },
  safetyBulletList: {
    gap: appTheme.spacing.sm
  },
  safetyBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: appTheme.spacing.sm
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    marginTop: appTheme.spacing.lg,
    minHeight: 48,
    minWidth: 140,
    paddingHorizontal: appTheme.spacing.lg
  },
  retryButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  safetyBulletDot: {
    color: appTheme.colors.orange,
    fontSize: 18,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: 22
  },
  safetyBullet: {
    color: appTheme.colors.textSecondary,
    flex: 1,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  badgeBase: {
    borderRadius: appTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  badgeTextBase: {
    fontSize: appTheme.typography.label,
    fontWeight: appTheme.typography.weights.bold
  },
  badgeReady: {
    backgroundColor: appTheme.colors.greenSoft
  },
  badgeReadyText: {
    color: appTheme.colors.greenText
  },
  badgeInProgress: {
    backgroundColor: appTheme.colors.orangeSoft
  },
  badgeInProgressText: {
    color: appTheme.colors.orangeDeep
  },
  badgeComplete: {
    backgroundColor: appTheme.colors.grayBadge
  },
  badgeCompleteText: {
    color: appTheme.colors.grayBadgeText
  },
  routeMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.xs,
    marginTop: appTheme.spacing.md
  },
  routeMetaChip: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  routeMetaSecondary: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  inlineEmptyState: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    marginTop: appTheme.spacing.lg,
    padding: appTheme.spacing.md
  },
  inlineEmptyTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold,
    marginBottom: appTheme.spacing.xxs
  },
  inlineEmptyBody: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  inlineNoticeState: {
    backgroundColor: appTheme.colors.warningSoft,
    borderColor: appTheme.colors.orangeBorder,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    padding: appTheme.spacing.md
  },
  inlineNoticeTitle: {
    color: appTheme.colors.warningText,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold,
    marginBottom: appTheme.spacing.xxs
  },
  inlineNoticeBody: {
    color: appTheme.colors.infoText,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall
  },
  primaryButton: {
    ...appTheme.shadows.card,
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: appTheme.spacing.md
  },
  startRouteButton: {
    marginTop: appTheme.spacing.xxs
  },
  primaryButtonText: {
    color: appTheme.colors.textInverse,
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold
  },
  actionRow: {
    flexDirection: 'row',
    gap: appTheme.spacing.sm,
    marginTop: appTheme.spacing.xs
  },
  actionButton: {
    flex: 1
  },
  clockButton: {
    alignItems: 'center',
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: appTheme.spacing.md
  },
  clockButtonIdle: {
    backgroundColor: appTheme.colors.charcoal
  },
  clockButtonActive: {
    backgroundColor: appTheme.colors.charcoal
  },
  clockButtonPressed: {
    opacity: 0.9
  },
  clockButtonText: {
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold
  },
  clockButtonTextIdle: {
    color: appTheme.colors.textInverse
  },
  clockButtonTextActive: {
    color: appTheme.colors.textInverse
  },
  breakButton: {
    alignItems: 'center',
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: appTheme.spacing.md
  },
  breakButtonIdle: {
    backgroundColor: appTheme.colors.purple
  },
  breakButtonActive: {
    backgroundColor: '#5838bf'
  },
  breakButtonPressed: {
    opacity: 0.9
  },
  breakButtonText: {
    fontSize: appTheme.typography.bodyLarge,
    fontWeight: appTheme.typography.weights.bold
  },
  breakButtonTextIdle: {
    color: appTheme.colors.textInverse
  },
  breakButtonTextActive: {
    color: appTheme.colors.textInverse
  },
  timeStatusCard: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    marginTop: appTheme.spacing.sm,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  timeStatusText: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.bold
  },
  timeStatusSubtext: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    marginTop: appTheme.spacing.xxs
  },
  buttonDisabled: {
    opacity: 0.65
  },
  buttonPressed: {
    opacity: 0.92
  }
});
