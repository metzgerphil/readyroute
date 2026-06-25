const MANAGER_TOKEN_KEY = 'readyroute_manager_token';
const SELECTED_CSA_ID_KEY = 'readyroute_selected_csa_id';
const SELECTED_CSA_CONTEXT_KEY = 'readyroute_selected_csa_context';

function getStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }

  return window.localStorage;
}

function getStorageItem(key) {
  return getStorage()?.getItem(key) || null;
}

function setStorageItem(key, value) {
  getStorage()?.setItem(key, value);
}

function removeStorageItem(key) {
  getStorage()?.removeItem(key);
}

export function getManagerToken() {
  return getStorageItem(MANAGER_TOKEN_KEY);
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
  return getStorageItem(SELECTED_CSA_ID_KEY);
}

export function saveSelectedCsaId(csaId) {
  if (csaId) {
    setStorageItem(SELECTED_CSA_ID_KEY, csaId);
  } else {
    removeStorageItem(SELECTED_CSA_ID_KEY);
  }
}

export function clearSelectedCsaId() {
  removeStorageItem(SELECTED_CSA_ID_KEY);
}

export function getCachedSelectedCsaContext() {
  const rawContext = getStorageItem(SELECTED_CSA_CONTEXT_KEY);

  if (!rawContext) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawContext);

    if (!parsed?.id || !parsed?.company_name) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export function saveCachedSelectedCsaContext(csa) {
  if (!csa?.id || !csa?.company_name) {
    return;
  }

  setStorageItem(SELECTED_CSA_CONTEXT_KEY, JSON.stringify({
    id: csa.id,
    company_name: csa.company_name
  }));
}

export function clearCachedSelectedCsaContext() {
  removeStorageItem(SELECTED_CSA_CONTEXT_KEY);
}

export function saveManagerToken(token) {
  setStorageItem(MANAGER_TOKEN_KEY, token);
  saveSelectedCsaId(decodeManagerTokenPayload(token)?.account_id || null);
}

export function clearManagerToken() {
  removeStorageItem(MANAGER_TOKEN_KEY);
  clearSelectedCsaId();
  clearCachedSelectedCsaContext();
}
