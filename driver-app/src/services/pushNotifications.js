import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import api from './api';

const PUSH_ENDPOINTS = {
  driver: '/routes/notifications/device-token',
  manager: '/manager/notifications/device-token'
};

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true
    })
  });
} catch (_error) {
  // Native notification APIs are not available in every test/runtime surface.
}

export function getPushRegistrationEndpoint(mode) {
  return PUSH_ENDPOINTS[mode] || null;
}

export function getExpoPushProjectId() {
  return (
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.manifest?.extra?.eas?.projectId ||
    null
  );
}

export function isNativePushSupported(platform = Platform.OS) {
  return platform === 'ios' || platform === 'android';
}

function hasNotificationPermission(permission) {
  return Boolean(permission?.granted || permission?.status === 'granted');
}

function canRequestPermission(permission) {
  const status = String(permission?.status || '').toLowerCase();
  return !status || status === 'undetermined' || permission?.canAskAgain !== false;
}

async function ensureAndroidNotificationChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync('default', {
    name: 'ReadyRoute alerts',
    importance: Notifications.AndroidImportance.DEFAULT
  });
}

async function getNotificationPermission() {
  let permission = await Notifications.getPermissionsAsync();

  if (!hasNotificationPermission(permission) && canRequestPermission(permission)) {
    permission = await Notifications.requestPermissionsAsync();
  }

  return permission;
}

export async function registerPushNotificationsForMode(mode) {
  const endpoint = getPushRegistrationEndpoint(mode);

  if (!endpoint) {
    return { status: 'skipped', reason: 'unsupported_mode' };
  }

  if (!isNativePushSupported()) {
    return { status: 'skipped', reason: 'unsupported_platform' };
  }

  await ensureAndroidNotificationChannel();

  const permission = await getNotificationPermission();

  if (!hasNotificationPermission(permission)) {
    return { status: 'permission_denied' };
  }

  const projectId = getExpoPushProjectId();
  const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  const expoPushToken = tokenResponse?.data;

  if (!expoPushToken) {
    return { status: 'skipped', reason: 'missing_push_token' };
  }

  const response = await api.post(endpoint, {
    expo_push_token: expoPushToken,
    platform: Platform.OS,
    app_version: Constants.expoConfig?.version || Constants.nativeAppVersion || null,
    device_id: Constants.sessionId || null,
    device_name: Constants.deviceName || null
  }, {
    authMode: mode
  });

  return {
    status: response.data?.registered ? 'registered' : 'accepted',
    token: expoPushToken
  };
}

export async function registerPushNotificationsForSession({ activeMode, sessionTokens } = {}) {
  if (activeMode === 'driver' && !sessionTokens?.driverToken) {
    return { status: 'skipped', reason: 'missing_driver_token' };
  }

  if (activeMode === 'manager' && !sessionTokens?.managerToken) {
    return { status: 'skipped', reason: 'missing_manager_token' };
  }

  try {
    return await registerPushNotificationsForMode(activeMode);
  } catch (error) {
    return {
      status: 'error',
      error
    };
  }
}
