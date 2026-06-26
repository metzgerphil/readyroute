import AsyncStorage from '@react-native-async-storage/async-storage';

import api from './api';
import { getDriverFromToken, getToken } from './auth';

const CACHE_VERSION = 1;
const MANIFEST_CACHE_PREFIX = `readyroute_driver_manifest:v${CACHE_VERSION}`;
const ROUTE_SUMMARY_CACHE_PREFIX = `readyroute_driver_route_summary:v${CACHE_VERSION}`;

let manifestPrefetchPromise = null;

export function getTodayStorageDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function getDriverCacheScope() {
  try {
    if (typeof getToken !== 'function' || typeof getDriverFromToken !== 'function') {
      return 'default';
    }

    const token = await getToken();
    const driver = getDriverFromToken(token);
    const accountId = driver?.account_id || driver?.accountId || 'default-account';
    const driverId = driver?.driver_id || driver?.sub || driver?.id || 'default-driver';

    return `${accountId}:${driverId}`;
  } catch (_error) {
    return 'default';
  }
}

async function getSummaryCacheKey(date = getTodayStorageDate()) {
  const scope = await getDriverCacheScope();
  return `${ROUTE_SUMMARY_CACHE_PREFIX}:${scope}:${date}`;
}

async function getManifestCacheKey(routeId) {
  const scope = await getDriverCacheScope();
  return `${MANIFEST_CACHE_PREFIX}:${scope}:${routeId}`;
}

function normalizeRouteSummary(payload = {}, savedAt = new Date().toISOString()) {
  const route = payload?.route || null;
  const routePreview = payload?.driver_day?.route_preview || null;
  const routeDate = route?.date || routePreview?.date || getTodayStorageDate();

  return {
    cache_version: CACHE_VERSION,
    saved_at: savedAt,
    date: routeDate,
    route_id: route?.id || null,
    route_status: route?.status || null,
    driver_day_status: payload?.driver_day?.status || (route ? 'dispatched' : 'unassigned'),
    last_manifest_change_at: route?.last_manifest_change_at || routePreview?.last_manifest_change_at || null,
    work_area_name: route?.work_area_name || routePreview?.work_area_name || null
  };
}

function normalizeManifestPayload(payload = {}, savedAt = new Date().toISOString()) {
  const route = payload?.route || null;

  if (!route?.id || !Array.isArray(route.stops)) {
    return null;
  }

  return {
    cache_version: CACHE_VERSION,
    cached_at: savedAt,
    route,
    driver_day: payload?.driver_day || {
      status: 'dispatched'
    }
  };
}

function parseCachedJson(value) {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

async function getCachedRouteSummary(date = getTodayStorageDate()) {
  const key = await getSummaryCacheKey(date);
  const cached = parseCachedJson(await AsyncStorage.getItem(key));

  if (!cached || cached.cache_version !== CACHE_VERSION || cached.date !== date) {
    if (cached) {
      await AsyncStorage.removeItem(key);
    }
    return null;
  }

  return cached;
}

export async function saveDriverRouteSummary(payload = {}) {
  const summary = normalizeRouteSummary(payload);
  const key = await getSummaryCacheKey(summary.date);
  await AsyncStorage.setItem(key, JSON.stringify(summary));
  return summary;
}

export async function saveDriverManifest(payload = {}) {
  const manifest = normalizeManifestPayload(payload);

  if (!manifest) {
    await saveDriverRouteSummary(payload);
    return null;
  }

  const [manifestKey] = await Promise.all([
    getManifestCacheKey(manifest.route.id),
    saveDriverRouteSummary(payload)
  ]);

  await AsyncStorage.setItem(manifestKey, JSON.stringify(manifest));
  return manifest;
}

export async function getCachedDriverManifest({ date = getTodayStorageDate(), routeId = null } = {}) {
  const summary = routeId
    ? null
    : await getCachedRouteSummary(date);
  const resolvedRouteId = routeId || summary?.route_id || null;

  if (!resolvedRouteId) {
    return null;
  }

  const key = await getManifestCacheKey(resolvedRouteId);
  const cached = parseCachedJson(await AsyncStorage.getItem(key));

  if (
    !cached ||
    cached.cache_version !== CACHE_VERSION ||
    cached.route?.id !== resolvedRouteId ||
    cached.route?.date !== date ||
    !Array.isArray(cached.route?.stops)
  ) {
    if (cached) {
      await AsyncStorage.removeItem(key);
    }
    return null;
  }

  return {
    route: cached.route,
    driver_day: cached.driver_day || {
      status: 'dispatched'
    },
    cached_at: cached.cached_at || null
  };
}

export async function fetchDriverManifest() {
  const response = await api.get('/routes/today', {
    params: {
      view: 'manifest'
    }
  });

  await saveDriverManifest(response.data || {});
  return response.data || {};
}

export function prefetchDriverManifest() {
  if (!manifestPrefetchPromise) {
    manifestPrefetchPromise = fetchDriverManifest()
      .catch(() => null)
      .finally(() => {
        manifestPrefetchPromise = null;
      });
  }

  return manifestPrefetchPromise;
}

export {
  CACHE_VERSION,
  MANIFEST_CACHE_PREFIX,
  ROUTE_SUMMARY_CACHE_PREFIX
};
