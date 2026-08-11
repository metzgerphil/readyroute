const assert = require('node:assert/strict');
const test = require('node:test');

const {
  REQUIRED_CONFIRMATION,
  assertResetAuthorized,
  buildAccountDeleteQuery,
  listStorageFiles
} = require('./resetProductionCompanies');

test('company reset requires an exact destructive confirmation', () => {
  assert.doesNotThrow(() => assertResetAuthorized('audit', ''));
  assert.throws(() => assertResetAuthorized('reset', 'delete everything'), /exact confirmation/);
  assert.doesNotThrow(() => assertResetAuthorized('reset', REQUIRED_CONFIRMATION));
});

test('company reset SQL is limited to validated captured account IDs', () => {
  const query = buildAccountDeleteQuery(['10000000-0000-4000-8000-000000000001']);
  assert.match(query, /where id in \('10000000-0000-4000-8000-000000000001'::uuid\)/);
  assert.throws(() => buildAccountDeleteQuery(["bad-id'); drop table accounts;--"]), /invalid account ID/);
});

test('storage listing walks account folders recursively', async () => {
  const listings = {
    'account-1': [{ name: 'driver-1', id: null }, { name: 'root.pdf', id: 'object-1' }],
    'account-1/driver-1': [{ name: 'license.pdf', id: 'object-2' }]
  };
  const bucket = {
    async list(prefix) {
      return { data: listings[prefix] || [], error: null };
    }
  };
  assert.deepEqual(await listStorageFiles(bucket, 'account-1'), [
    'account-1/driver-1/license.pdf',
    'account-1/root.pdf'
  ]);
});
