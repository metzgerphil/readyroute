import axios from 'axios';

import {
  clearManagerToken,
  clearReadyRouteStaffToken,
  getManagerAccountId,
  getManagerToken,
  getReadyRouteStaffToken,
  getSelectedCsaId
} from './auth';
import { getStaffLoginUrl } from '../utils/portalHost';

const LOCAL_API_URL = import.meta.env.VITE_API_URL_LOCAL || 'http://localhost:3001';
const PRODUCTION_API_URL = import.meta.env.VITE_API_URL || 'https://api.readyroute.org';
const API_URL = import.meta.env.DEV ? LOCAL_API_URL : PRODUCTION_API_URL;

const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toLowerCase();
  const url = String(config.url || '');
  const isReadyRouteStaffRequest = (
    url.startsWith('/staff') ||
    (url.startsWith('/support/tickets') && method !== 'post')
  );
  const token = isReadyRouteStaffRequest
    ? getReadyRouteStaffToken()
    : getManagerToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (isReadyRouteStaffRequest) {
    return config;
  }

  const selectedCsaId = getSelectedCsaId();
  const tokenAccountId = getManagerAccountId();
  if (selectedCsaId && tokenAccountId && selectedCsaId === tokenAccountId) {
    config.headers['X-ReadyRoute-CSA-Id'] = selectedCsaId;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const requestUrl = String(error.config?.url || '');
      const requestMethod = String(error.config?.method || 'get').toLowerCase();
      const isReadyRouteStaffRequest = (
        requestUrl.startsWith('/staff') ||
        (requestUrl.startsWith('/support/tickets') && requestMethod !== 'post')
      );

      if (isReadyRouteStaffRequest) {
        clearReadyRouteStaffToken();
        if (window.location.pathname !== '/readyroute/login') {
          window.location.assign(getStaffLoginUrl(window.location.hostname));
        }
      } else {
        clearManagerToken();
      }

      if (!isReadyRouteStaffRequest && window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
