const MANAGER_TOKEN_KEY = 'readyroute_manager_token';

export function getManagerToken() {
  return window.localStorage.getItem(MANAGER_TOKEN_KEY);
}

export function saveManagerToken(token) {
  window.localStorage.setItem(MANAGER_TOKEN_KEY, token);
}

export function clearManagerToken() {
  window.localStorage.removeItem(MANAGER_TOKEN_KEY);
}
