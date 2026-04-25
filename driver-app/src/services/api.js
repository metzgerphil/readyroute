import axios from 'axios';

import { getSessionTokens } from './auth';

const LOCAL_API_URL = process.env.EXPO_PUBLIC_API_URL_LOCAL || 'http://127.0.0.1:3001';
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://readyroute-backend-production.up.railway.app';
const USE_LOCAL_API = String(process.env.EXPO_PUBLIC_USE_LOCAL_API || '').trim().toLowerCase() === 'true';

export const API_URL = __DEV__ && USE_LOCAL_API ? LOCAL_API_URL : PRODUCTION_API_URL;

let unauthorizedHandler = null;
let authContextResolver = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function setAuthContextResolver(resolver) {
  authContextResolver = resolver;
}

async function resolveAuthContext() {
  if (authContextResolver) {
    const context = await authContextResolver();
    return {
      activeMode: context?.activeMode || 'driver',
      driverToken: context?.driverToken || null,
      managerToken: context?.managerToken || null
    };
  }

  const sessionTokens = await getSessionTokens();
  return {
    activeMode: 'driver',
    driverToken: sessionTokens.driverToken || null,
    managerToken: sessionTokens.managerToken || null
  };
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000
});

api.interceptors.request.use(async (config) => {
  const authContext = await resolveAuthContext();
  const authMode = config.authMode || authContext.activeMode || 'driver';
  const token = authMode === 'manager' ? authContext.managerToken : authContext.driverToken;

  if (token) {
    config.headers = {
      ...config.headers,
      Authorization: `Bearer ${token}`
    };
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      if (unauthorizedHandler) {
        const authContext = await resolveAuthContext();
        const authMode = error.config?.authMode || authContext.activeMode || 'driver';
        await unauthorizedHandler({
          error,
          mode: authMode
        });
      }
    }

    return Promise.reject(error);
  }
);

export default api;
