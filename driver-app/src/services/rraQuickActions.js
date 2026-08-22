import AsyncStorage from '@react-native-async-storage/async-storage';

import api from './api';
import { getDriverFromToken, getToken } from './auth';

const RRA_CODES_CACHE_KEY = 'readyroute_rra_reference_codes:v1';
const RRA_CONTACTS_CACHE_PREFIX = 'readyroute_rra_quick_actions:v1';

async function readCache(key) {
  const value = await AsyncStorage.getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    await AsyncStorage.removeItem(key);
    return null;
  }
}

async function getContactCacheKey() {
  const driver = getDriverFromToken(await getToken());
  const identity = driver?.driver_id || driver?.sub || driver?.id;
  return identity ? `${RRA_CONTACTS_CACHE_PREFIX}:${identity}` : null;
}

export async function getRraQuickActions() {
  const cacheKey = await getContactCacheKey();
  try {
    const response = await api.get('/driver-help/quick-actions');
    const actions = response.data?.quick_actions || { cxpc: null, manager: null };
    if (cacheKey) await AsyncStorage.setItem(cacheKey, JSON.stringify(actions));
    return actions;
  } catch (error) {
    const cached = cacheKey ? await readCache(cacheKey) : null;
    if (cached) return cached;
    throw error;
  }
}

export async function getRraReferenceCodes() {
  try {
    const response = await api.get('/driver-help/reference-codes');
    const codes = response.data?.codes || { delivery: [], pickup: [] };
    await AsyncStorage.setItem(RRA_CODES_CACHE_KEY, JSON.stringify(codes));
    return codes;
  } catch (error) {
    const cached = await readCache(RRA_CODES_CACHE_KEY);
    if (cached) return cached;
    throw error;
  }
}

export { RRA_CODES_CACHE_KEY, RRA_CONTACTS_CACHE_PREFIX };
