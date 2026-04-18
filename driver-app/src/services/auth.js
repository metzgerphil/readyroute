import AsyncStorage from '@react-native-async-storage/async-storage';
import { Buffer } from 'buffer';

const TOKEN_KEY = 'readyroute_driver_token';
const CLOCKED_IN_AT_KEY = 'readyroute_clocked_in_at';
const SECURITY_DISMISSED_DATE_KEY = 'readyroute_security_dismissed_date';

function decodeBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

export async function saveToken(token) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getToken() {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function removeToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
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

export { CLOCKED_IN_AT_KEY, SECURITY_DISMISSED_DATE_KEY, TOKEN_KEY };
