import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getPortalHostRedirect,
  getStaffLoginUrl,
  STAFF_HOME_PATH,
  STAFF_LOGIN_PATH
} from './portalHost.js';

test('moves staff routes off the manager portal without changing the route', () => {
  assert.equal(
    getPortalHostRedirect({
      hostname: 'portal.readyroute.org',
      pathname: '/readyroute/reset-password',
      search: '?token=abc'
    }),
    'https://staff.readyroute.org/readyroute/reset-password?token=abc'
  );
});

test('keeps manager routes on the manager portal', () => {
  assert.equal(
    getPortalHostRedirect({ hostname: 'portal.readyroute.org', pathname: '/drivers' }),
    null
  );
});

test('sends the staff domain root to login or the staff home', () => {
  assert.equal(
    getPortalHostRedirect({ hostname: 'staff.readyroute.org', pathname: '/' }),
    STAFF_LOGIN_PATH
  );
  assert.equal(
    getPortalHostRedirect({
      hostname: 'staff.readyroute.org',
      pathname: '/',
      hasStaffToken: true
    }),
    STAFF_HOME_PATH
  );
});

test('blocks manager pages from appearing on the staff domain', () => {
  assert.equal(
    getPortalHostRedirect({ hostname: 'staff.readyroute.org', pathname: '/drivers' }),
    STAFF_LOGIN_PATH
  );
});

test('uses an absolute staff login URL outside the staff domain', () => {
  assert.equal(getStaffLoginUrl('staff.readyroute.org'), STAFF_LOGIN_PATH);
  assert.equal(
    getStaffLoginUrl('portal.readyroute.org'),
    'https://staff.readyroute.org/readyroute/login'
  );
});
