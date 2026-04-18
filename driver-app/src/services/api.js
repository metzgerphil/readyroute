import axios from 'axios';

import { getToken, removeToken } from './auth';

const LOCAL_API_URL =
  process.env.EXPO_PUBLIC_API_URL_LOCAL ||
  process.env.EXPO_PUBLIC_API_URL ||
  'http://127.0.0.1:3001';
const PRODUCTION_API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.readyroute.app';

export const API_URL = __DEV__ ? LOCAL_API_URL : PRODUCTION_API_URL;

let unauthorizedHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();

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
      await removeToken();

      if (unauthorizedHandler) {
        unauthorizedHandler();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
