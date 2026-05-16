const MANAGER_TOKEN_KEY = 'readyroute_manager_token';
const SELECTED_CSA_ID_KEY = 'readyroute_selected_csa_id';

export function getManagerToken() {
  return window.localStorage.getItem(MANAGER_TOKEN_KEY);
}

export function decodeManagerTokenPayload(token) {
  if (!token) {
    return null;
  }

  try {
    const payload = token.split('.')[1];
    const base64Payload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const normalizedPayload = base64Payload.padEnd(
      base64Payload.length + ((4 - (base64Payload.length % 4)) % 4),
      '='
    );
    return JSON.parse(window.atob(normalizedPayload));
  } catch {
    return null;
  }
}

export function getManagerTokenPayload() {
  return decodeManagerTokenPayload(getManagerToken());
}

export function getManagerAccountId() {
  return getManagerTokenPayload()?.account_id || null;
}

export function getSelectedCsaId() {
  return window.localStorage.getItem(SELECTED_CSA_ID_KEY);
}

export function saveSelectedCsaId(csaId) {
  if (csaId) {
    window.localStorage.setItem(SELECTED_CSA_ID_KEY, csaId);
  } else {
    window.localStorage.removeItem(SELECTED_CSA_ID_KEY);
  }
}

export function clearSelectedCsaId() {
  window.localStorage.removeItem(SELECTED_CSA_ID_KEY);
}

export function saveManagerToken(token) {
  window.localStorage.setItem(MANAGER_TOKEN_KEY, token);
  saveSelectedCsaId(decodeManagerTokenPayload(token)?.account_id || null);
}

export function clearManagerToken() {
  window.localStorage.removeItem(MANAGER_TOKEN_KEY);
  clearSelectedCsaId();
}
