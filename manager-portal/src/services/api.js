import axios from 'axios';

import { clearManagerToken, getManagerToken } from './auth';

const LOCAL_API_URL = import.meta.env.VITE_API_URL_LOCAL || 'http://localhost:3001';
const PRODUCTION_API_URL = import.meta.env.VITE_API_URL || 'https://api.readyroute.app';
const API_URL = import.meta.env.DEV ? LOCAL_API_URL : PRODUCTION_API_URL;

const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use((config) => {
  const token = getManagerToken();

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearManagerToken();
      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
