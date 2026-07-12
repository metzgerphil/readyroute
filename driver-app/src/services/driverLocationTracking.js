import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import api from './api';
import { getToken, saveToken } from './auth';

export const DRIVER_LOCATION_TASK = 'readyroute-driver-location';
export const DRIVER_LOCATION_INTERVAL_MS = 5000;
export const DRIVER_LOCATION_ROUTE_KEY = 'readyroute_driver_location_route_v1';
export const DRIVER_LOCATION_POST_STATE_KEY = 'readyroute_driver_location_post_state_v1';
const MAX_TRACKING_DURATION_MS = 18 * 60 * 60 * 1000;

let postInFlight = false;

function hasGrantedPermission(permission) {
  return Boolean(permission?.granted || permission?.status === 'granted');
}

function isUsablePosition(position) {
  return Boolean(
    Number.isFinite(Number(position?.coords?.latitude)) &&
    Number.isFinite(Number(position?.coords?.longitude)) &&
    !(Number(position.coords.latitude) === 0 && Number(position.coords.longitude) === 0)
  );
}

async function readJson(key) {
  const value = await AsyncStorage.getItem(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

async function saveTrackingRoute(routeId) {
  await AsyncStorage.setItem(DRIVER_LOCATION_ROUTE_KEY, JSON.stringify({
    route_id: routeId,
    started_at: Date.now(),
    expires_at: Date.now() + MAX_TRACKING_DURATION_MS
  }));
}

async function clearTrackingState() {
  await Promise.all([
    AsyncStorage.removeItem(DRIVER_LOCATION_ROUTE_KEY),
    AsyncStorage.removeItem(DRIVER_LOCATION_POST_STATE_KEY)
  ]);
}

export async function postDriverLocation(routeId, position, options = {}) {
  if (!routeId || !isUsablePosition(position) || postInFlight) {
    return false;
  }

  const now = Number(position.timestamp) || Date.now();
  const state = await readJson(DRIVER_LOCATION_POST_STATE_KEY);
  if (
    !options.force &&
    state?.route_id === routeId &&
    Number.isFinite(Number(state.posted_at)) &&
    now - Number(state.posted_at) < DRIVER_LOCATION_INTERVAL_MS
  ) {
    return false;
  }

  postInFlight = true;

  try {
    await api.post('/routes/position', {
      lat: Number(position.coords.latitude),
      lng: Number(position.coords.longitude),
      route_id: routeId
    });
    await AsyncStorage.setItem(DRIVER_LOCATION_POST_STATE_KEY, JSON.stringify({
      route_id: routeId,
      posted_at: now,
      latitude: Number(position.coords.latitude),
      longitude: Number(position.coords.longitude)
    }));
    return true;
  } finally {
    postInFlight = false;
  }
}

async function stopExpiredTracking() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => {});
  }
  await clearTrackingState();
}

if (!TaskManager.isTaskDefined?.(DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      return;
    }

    const trackingRoute = await readJson(DRIVER_LOCATION_ROUTE_KEY);
    if (!trackingRoute?.route_id || Date.now() >= Number(trackingRoute.expires_at || 0)) {
      await stopExpiredTracking();
      return;
    }

    const locations = Array.isArray(data?.locations) ? data.locations : [];
    const latestPosition = locations[locations.length - 1];
    if (!latestPosition) {
      return;
    }

    await postDriverLocation(trackingRoute.route_id, latestPosition).catch(() => {});
  });
}

function getBackgroundLocationOptions() {
  const accuracy = Location.Accuracy?.BestForNavigation || Location.Accuracy?.Highest || Location.Accuracy?.High;

  return {
    ...(accuracy ? { accuracy } : {}),
    activityType: Location.ActivityType?.AutomotiveNavigation,
    distanceInterval: 0,
    timeInterval: DRIVER_LOCATION_INTERVAL_MS,
    deferredUpdatesInterval: DRIVER_LOCATION_INTERVAL_MS,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'ReadyRoute route tracking',
      notificationBody: 'Location sharing is active while you run your route.',
      notificationColor: '#FF6200',
      killServiceOnDestroy: false
    }
  };
}

export async function startDriverLocationTracking(routeId) {
  if (!routeId) {
    return { started: false, reason: 'missing_route' };
  }

  const [foregroundPermission, backgroundPermission, driverToken] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    getToken()
  ]);

  if (!hasGrantedPermission(foregroundPermission) || !hasGrantedPermission(backgroundPermission)) {
    return { started: false, reason: 'permission_required' };
  }

  if (!driverToken) {
    return { started: false, reason: 'missing_driver_session' };
  }

  // Re-save the token with after-first-unlock access so iOS can authenticate while locked.
  await saveToken(driverToken);
  await saveTrackingRoute(routeId);

  const hasStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
  if (!hasStarted) {
    await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, getBackgroundLocationOptions());
  }

  return { started: true };
}

export async function stopDriverLocationTracking() {
  const hasStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => false);
  if (hasStarted) {
    await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
  }
  await clearTrackingState();
}

export async function requestAlwaysLocationPermission() {
  let foregroundPermission = await Location.getForegroundPermissionsAsync();
  if (!hasGrantedPermission(foregroundPermission)) {
    foregroundPermission = await Location.requestForegroundPermissionsAsync();
  }

  if (!hasGrantedPermission(foregroundPermission)) {
    return { foreground: foregroundPermission, background: null, granted: false };
  }

  let backgroundPermission = await Location.getBackgroundPermissionsAsync();
  if (!hasGrantedPermission(backgroundPermission)) {
    backgroundPermission = await Location.requestBackgroundPermissionsAsync();
  }

  return {
    foreground: foregroundPermission,
    background: backgroundPermission,
    granted: hasGrantedPermission(backgroundPermission)
  };
}

export async function getAlwaysLocationPermission() {
  const [foreground, background] = await Promise.all([
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync()
  ]);

  return {
    foreground,
    background,
    granted: hasGrantedPermission(foreground) && hasGrantedPermission(background)
  };
}
