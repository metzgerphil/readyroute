import assert from 'node:assert/strict';
import test from 'node:test';

import { getCanonicalStopId, isSameCanonicalStop } from './stopIdentity.js';

test('getCanonicalStopId prefers durable stop identifiers over visible labels', () => {
  assert.equal(
    getCanonicalStopId({
      id: 'route-stop-36',
      sequence_order: 36,
      sid: '1234'
    }),
    'route-stop-36'
  );
});

test('getCanonicalStopId falls back through manifest, SID, and sequence keys', () => {
  assert.equal(getCanonicalStopId({ manifestStopId: 'manifest-87', sequence_order: 87 }), 'manifest-87');
  assert.equal(getCanonicalStopId({ sid: '7788', sequence_order: 36 }), 'sid:7788');
  assert.equal(getCanonicalStopId({ route_id: 'route-1', sequence_order: 36 }), 'route:route-1:seq:36');
});

test('isSameCanonicalStop matches map and list rows by shared canonical id', () => {
  assert.equal(
    isSameCanonicalStop(
      { routeStopId: 'shared-stop', sequence_order: 36 },
      { route_stop_id: 'shared-stop', sequence_order: 87 }
    ),
    true
  );
});
