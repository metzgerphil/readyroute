import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';

import {
  clearRouteCacheEncryptionKey,
  getSecureItem,
  removeSecureItem,
  setSecureItem
} from './secureStorage';

const TOKEN_KEY = 'readyroute_driver_token';
const MANAGER_TOKEN_KEY = 'readyroute_manager_token';
const CLOCKED_IN_AT_KEY = 'readyroute_clocked_in_at';
const SECURITY_DISMISSED_DATE_KEY = 'readyroute_security_dismissed_date';
const PIN_COLOR_MODE_KEY_PREFIX = 'readyroute_pin_color_mode';
const LAST_PORTAL_KEY_PREFIX = 'readyroute_last_portal';
const pinColorModeListeners = new Set();

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export async function saveToken(token) {
  await setSecureItem(TOKEN_KEY, token);
}

export async function saveManagerToken(token) {
  if (!token) {
    await removeSecureItem(MANAGER_TOKEN_KEY);
    return;
  }

  await setSecureItem(MANAGER_TOKEN_KEY, token);
}

export async function getToken() {
  return getSecureItem(TOKEN_KEY);
}

export async function getManagerToken() {
  return getSecureItem(MANAGER_TOKEN_KEY);
}

export async function removeToken() {
  await Promise.all([
    removeSecureItem(TOKEN_KEY),
    removeSecureItem(MANAGER_TOKEN_KEY),
    clearRouteCacheEncryptionKey()
  ]);
}

export async function removeDriverToken() {
  await removeSecureItem(TOKEN_KEY);
}

export async function removeManagerToken() {
  await removeSecureItem(MANAGER_TOKEN_KEY);
}

export async function saveSessionTokens({ driverToken = null, managerToken = null } = {}) {
  await Promise.all([
    driverToken ? setSecureItem(TOKEN_KEY, driverToken) : removeSecureItem(TOKEN_KEY),
    managerToken ? setSecureItem(MANAGER_TOKEN_KEY, managerToken) : removeSecureItem(MANAGER_TOKEN_KEY)
  ]);
}

export async function getSessionTokens() {
  const [driverToken, managerToken] = await Promise.all([
    getSecureItem(TOKEN_KEY),
    getSecureItem(MANAGER_TOKEN_KEY)
  ]);

  return {
    driverToken,
    managerToken
  };
}

export async function saveClockInTime(timestamp) {
  await AsyncStorage.setItem(CLOCKED_IN_AT_KEY, timestamp);
}

export async function getClockInTime() {
  return AsyncStorage.getItem(CLOCKED_IN_AT_KEY);
}

export async function removeClockInTime() {
  await AsyncStorage.removeItem(CLOCKED_IN_AT_KEY);
}

export async function saveSecurityDismissedDate(date) {
  await AsyncStorage.setItem(SECURITY_DISMISSED_DATE_KEY, date);
}

export async function getSecurityDismissedDate() {
  return AsyncStorage.getItem(SECURITY_DISMISSED_DATE_KEY);
}

async function getPinColorModeStorageKey() {
  const token = await getToken();
  const driver = getDriverFromToken(token);
  const driverId = driver?.sub || driver?.driver_id || driver?.id || 'default';
  return `${PIN_COLOR_MODE_KEY_PREFIX}:${driverId}`;
}

export async function savePinColorMode(mode) {
  const storageKey = await getPinColorModeStorageKey();
  await AsyncStorage.setItem(storageKey, mode);
  pinColorModeListeners.forEach((listener) => {
    try {
      listener(mode);
    } catch (_error) {
      // Preference listeners should never block the app.
    }
  });
}

export async function getPinColorMode() {
  const storageKey = await getPinColorModeStorageKey();
  return AsyncStorage.getItem(storageKey);
}

export function subscribePinColorMode(listener) {
  pinColorModeListeners.add(listener);
  return () => {
    pinColorModeListeners.delete(listener);
  };
}

function getPortalPreferenceStorageKey(driverToken, managerToken) {
  const driver = getDriverFromToken(driverToken);
  const manager = getManagerFromToken(managerToken);
  const accountId = driver?.account_id || manager?.account_id || 'default';
  const identityEmail = (driver?.email || manager?.manager_email || 'default').toLowerCase();
  return `${LAST_PORTAL_KEY_PREFIX}:${accountId}:${identityEmail}`;
}

export async function saveLastPortalMode(mode, options = {}) {
  const { driverToken, managerToken } = options.driverToken || options.managerToken
    ? options
    : await getSessionTokens();
  const storageKey = getPortalPreferenceStorageKey(driverToken, managerToken);
  await AsyncStorage.setItem(storageKey, mode);
}

export async function getLastPortalMode(options = {}) {
  const { driverToken, managerToken } = options.driverToken || options.managerToken
    ? options
    : await getSessionTokens();
  const storageKey = getPortalPreferenceStorageKey(driverToken, managerToken);
  return AsyncStorage.getItem(storageKey);
}

export function getDriverFromToken(token) {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split('.');

    if (!payload) {
      return null;
    }

    return JSON.parse(decodeBase64Url(payload));
  } catch (_error) {
    return null;
  }
}

export function getManagerFromToken(token) {
  return getDriverFromToken(token);
}

export function getSessionIdentity({ activeMode = 'driver', driverToken = null, managerToken = null } = {}) {
  const driver = getDriverFromToken(driverToken);
  const manager = getManagerFromToken(managerToken);
  const activePayload = activeMode === 'manager' ? manager : driver;
  const fallbackPayload = activeMode === 'manager' ? driver : manager;

  return {
    fullName:
      activePayload?.full_name ||
      activePayload?.manager_name ||
      activePayload?.name ||
      fallbackPayload?.full_name ||
      fallbackPayload?.manager_name ||
      fallbackPayload?.name ||
      'ReadyRoute User',
    companyName:
      activePayload?.company_name ||
      activePayload?.csa_name ||
      fallbackPayload?.company_name ||
      fallbackPayload?.csa_name ||
      null,
    managerEmail:
      manager?.manager_email ||
      manager?.email ||
      null,
    primaryRole: activeMode === 'manager' ? 'Manager' : 'Driver',
    roles: {
      driver: Boolean(driver?.driver_id || driver?.sub || driver?.id),
      manager: Boolean(manager?.account_id && manager?.role === 'manager')
    }
  };
}

export function getPortalAccess({ driverToken, managerToken } = {}) {
  const driver = getDriverFromToken(driverToken);
  const manager = getManagerFromToken(managerToken);

  return {
    driver: Boolean(driver?.driver_id || driver?.sub || driver?.id),
    manager: Boolean(manager?.account_id && manager?.role === 'manager')
  };
}

export {
  CLOCKED_IN_AT_KEY,
  LAST_PORTAL_KEY_PREFIX,
  MANAGER_TOKEN_KEY,
  PIN_COLOR_MODE_KEY_PREFIX,
  SECURITY_DISMISSED_DATE_KEY,
  TOKEN_KEY
};
