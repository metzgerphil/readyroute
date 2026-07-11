import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildOperationsDatePath,
  getOperationsDateFromSearch,
  getResolvedOperationsDate,
  isOperationsDatePath
} from './operationsDate.js';

test('operation date path builder adds and replaces date on date-sensitive pages', () => {
  assert.equal(buildOperationsDatePath('/routes', '2026-05-08'), '/routes?date=2026-05-08');
  assert.equal(
    buildOperationsDatePath('/manifest?action=sync', '2026-05-08'),
    '/manifest?action=sync&date=2026-05-08'
  );
  assert.equal(
    buildOperationsDatePath('/fleet-map?date=2026-05-07#map', '2026-05-08'),
    '/fleet-map?date=2026-05-08#map'
  );
  assert.equal(
    buildOperationsDatePath('/routes/route-123?tab=stops', '2026-05-08'),
    '/routes/route-123?tab=stops&date=2026-05-08'
  );
});

test('operation date path builder skips non-date-sensitive pages', () => {
  assert.equal(buildOperationsDatePath('/drivers', '2026-05-08'), '/drivers');
  assert.equal(isOperationsDatePath('/time-commits'), true);
  assert.equal(isOperationsDatePath('/routes/route-123'), true);
  assert.equal(isOperationsDatePath('/route/route-123'), true);
  assert.equal(isOperationsDatePath('/vehicles'), false);
});

test('operation date search reader handles strings and URLSearchParams', () => {
  assert.equal(getOperationsDateFromSearch('?date=2026-05-08'), '2026-05-08');
  assert.equal(getOperationsDateFromSearch(new URLSearchParams('date=2026-05-09')), '2026-05-09');
  assert.equal(getOperationsDateFromSearch(''), null);
  assert.equal(getResolvedOperationsDate(new URLSearchParams('date=2026-05-10')), '2026-05-10');
});
