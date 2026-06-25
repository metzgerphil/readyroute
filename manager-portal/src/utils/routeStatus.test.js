import assert from 'node:assert/strict';
import test from 'node:test';

import { getRouteStatusMeta } from './routeStatus.js';

test('route status uses dispatched state ahead of pending route status', () => {
  assert.deepEqual(
    getRouteStatusMeta({
      dispatch_state: 'dispatched',
      status: 'pending'
    }),
    {
      label: 'Dispatched',
      tone: 'active',
      color: '#27ae60'
    }
  );
});

test('route status keeps review sync states ahead of raw route status', () => {
  assert.equal(
    getRouteStatusMeta({
      sync_state: 'needs_attention',
      status: 'ready'
    }).label,
    'Needs review'
  );
});
