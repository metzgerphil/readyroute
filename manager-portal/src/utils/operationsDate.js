import { format } from 'date-fns';

export const OPERATIONS_SELECTED_DATE_STORAGE_KEY = 'readyroute:selected-operations-date';
const LEGACY_MANIFEST_SELECTED_DATE_STORAGE_KEY = 'readyroute:manifest-selected-date';

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
  } catch (_error) {
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
  } catch (_error) {
    // Ignore session storage write failures in the browser.
  }
}
