export const MANAGER_PORTAL_HOST = 'portal.readyroute.org';
export const STAFF_PORTAL_HOST = 'staff.readyroute.org';
export const STAFF_LOGIN_PATH = '/readyroute/login';
export const STAFF_HOME_PATH = '/readyroute/support';

function withLocationSuffix(pathname, search = '', hash = '') {
  return `${pathname}${search || ''}${hash || ''}`;
}

export function getStaffLoginUrl(hostname = '') {
  return String(hostname || '').toLowerCase() === STAFF_PORTAL_HOST
    ? STAFF_LOGIN_PATH
    : `https://${STAFF_PORTAL_HOST}${STAFF_LOGIN_PATH}`;
}

export function getPortalHostRedirect({
  hostname = '',
  pathname = '/',
  search = '',
  hash = '',
  hasStaffToken = false
} = {}) {
  const normalizedHostname = String(hostname || '').toLowerCase();
  const normalizedPathname = pathname || '/';
  const isStaffPath = (
    normalizedPathname === '/readyroute' ||
    normalizedPathname.startsWith('/readyroute/') ||
    normalizedPathname === '/admin/support'
  );

  if (normalizedHostname === MANAGER_PORTAL_HOST && isStaffPath) {
    const destinationPath = normalizedPathname === '/admin/support'
      ? STAFF_HOME_PATH
      : normalizedPathname;
    return `https://${STAFF_PORTAL_HOST}${withLocationSuffix(destinationPath, search, hash)}`;
  }

  if (normalizedHostname !== STAFF_PORTAL_HOST) {
    return null;
  }

  if (normalizedPathname === '/') {
    return hasStaffToken ? STAFF_HOME_PATH : STAFF_LOGIN_PATH;
  }

  if (normalizedPathname === '/login') {
    return withLocationSuffix(STAFF_LOGIN_PATH, search, hash);
  }

  if (!isStaffPath) {
    return STAFF_LOGIN_PATH;
  }

  return null;
}
