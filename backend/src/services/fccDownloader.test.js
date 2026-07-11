const test = require('node:test');
const assert = require('node:assert/strict');

const { createCliFedexFccAdapter, getSessionStatePath } = require('./fccDownloader');

test('createCliFedexFccAdapter exposes disabled FCC automation methods', async () => {
  const adapter = createCliFedexFccAdapter({
    command: '/usr/bin/fake-runner',
    async runCommand() {
      throw new Error('runner should not be called while FCC automation is disabled');
    }
  });

  assert.ok(adapter);
  await assert.rejects(
    () => adapter.pullDailyManifests({
      account: { id: 'acct-1' },
      fedexAccount: { id: 'fx-1' },
      workDate: '2026-04-24'
    }),
    /FCC portal automation is disabled/
  );
  await assert.rejects(
    () => adapter.pullRouteProgress({
      account: { id: 'acct-1' },
      fedexAccount: { id: 'fx-1' },
      workDate: '2026-04-24'
    }),
    /FCC portal automation is disabled/
  );
});

test('getSessionStatePath builds a stable per-fedex-account cache path', () => {
  const sessionPath = getSessionStatePath({ id: 'fx-1', account_number: '123456789' });
  assert.match(sessionPath, /fx-1\.json$/);
});
