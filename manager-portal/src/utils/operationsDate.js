import { format } from 'date-fns';

export const OPERATIONS_SELECTED_DATE_STORAGE_KEY = 'readyroute:selected-operations-date';
const LEGACY_MANIFEST_SELECTED_DATE_STORAGE_KEY = 'readyroute:manifest-selected-date';
const DATE_SENSITIVE_OPERATIONS_PATHS = new Set([
  '/',
  '/manifest',
  '/fleet-map',
  '/routes',
  '/time-commits'
]);

export function getTodayString() {
  return format(new Date(), 'yyyy-MM-dd');
}

export function loadStoredOperationsDate() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return (
      window.sessionStorage.getItem(OPERATIONS_SELECTED_DATE_STORAGE_KEY) ||
      window.sessionStorage.getItem(LEGACY_MANIFEST_SELECTED_DATE_STORAGE_KEY)
    );
  } catch {
    return null;
  }
}

export function saveStoredOperationsDate(dateValue) {
  if (typeof window === 'undefined' || !dateValue) {
    return;
  }

  try {
    window.sessionStorage.setItem(OPERATIONS_SELECTED_DATE_STORAGE_KEY, dateValue);
    window.sessionStorage.setItem(LEGACY_MANIFEST_SELECTED_DATE_STORAGE_KEY, dateValue);
  } catch {
    // Ignore session storage write failures in the browser.
  }
}

export function getOperationsDateFromSearch(searchParams) {
  if (!searchParams) {
    return null;
  }

  if (typeof searchParams === 'string') {
    return new URLSearchParams(searchParams).get('date');
  }

  return searchParams.get('date');
}

export function isOperationsDatePath(pathname = '') {
  const normalizedPath = pathname || '/';

  return (
    DATE_SENSITIVE_OPERATIONS_PATHS.has(normalizedPath) ||
    normalizedPath.startsWith('/routes/') ||
    normalizedPath.startsWith('/route/')
  );
}

export function buildOperationsDatePath(path, dateValue) {
  if (!dateValue) {
    return path;
  }

  const hashIndex = path.indexOf('#');
  const pathWithoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
  const queryIndex = pathWithoutHash.indexOf('?');
  const pathname = queryIndex >= 0 ? pathWithoutHash.slice(0, queryIndex) : pathWithoutHash;
  const search = queryIndex >= 0 ? pathWithoutHash.slice(queryIndex + 1) : '';

  if (!isOperationsDatePath(pathname)) {
    return path;
  }

  const params = new URLSearchParams(search);
  params.set('date', dateValue);
  const queryString = params.toString();

  return `${pathname}${queryString ? `?${queryString}` : ''}${hash}`;
}
