const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');

process.env.FEDEX_SYNC_CREDENTIALS_KEY = 'test-fedex-key';

const { createCliFedexFccAdapter, getSessionStatePath } = require('./fccDownloader');
const { encryptFedexSecret } = require('./fedexCredentials');

test('createCliFedexFccAdapter falls back to the in-repo FCC runner by default', async () => {
  const adapter = createCliFedexFccAdapter();
  assert.ok(adapter);
  assert.equal(typeof adapter.pullDailyManifests, 'function');
});

test('pullDailyManifests decrypts credentials and returns manifest buffers from the runner output', async () => {
  const tempDir = await fs.mkdtemp(path.join('/tmp', 'readyroute-fcc-test-'));
  const xlsPath = path.join(tempDir, 'route-810.xls');
  const gpxPath = path.join(tempDir, 'route-810.gpx');

  await fs.writeFile(xlsPath, Buffer.from('xls-body'));
  await fs.writeFile(gpxPath, Buffer.from('gpx-body'));

  let receivedEnv = null;
  const adapter = createCliFedexFccAdapter({
    command: '/usr/bin/fake-runner',
    commandArgs: ['--json'],
    async runCommand({ executable, args, env }) {
      receivedEnv = { executable, args, env };
      return {
        stdout: JSON.stringify({
          summary: 'Pulled 1 FCC manifest.',
          manifests: [
            {
              work_area_name: '810',
              date: '2026-04-24',
              xls_path: xlsPath,
              gpx_path: gpxPath
            }
          ]
        }),
        stderr: ''
      };
    }
  });

  const result = await adapter.pullDailyManifests({
    account: {
      id: 'acct-1',
      operations_timezone: 'America/Los_Angeles'
    },
    fedexAccount: {
      id: 'fx-1',
      account_number: '123456789',
      connection_reference: 'bridge-fcc',
      fcc_username: 'bridge@example.com',
      fcc_password_encrypted: encryptFedexSecret('super-secret-password')
    },
    workDate: '2026-04-24',
    routeSyncSettings: {
      operations_timezone: 'America/Los_Angeles'
    },
    triggerSource: 'manual'
  });

  assert.equal(receivedEnv.executable, '/usr/bin/fake-runner');
  assert.deepEqual(receivedEnv.args, ['--json']);
  assert.equal(receivedEnv.env.READYROUTE_FCC_USERNAME, 'bridge@example.com');
  assert.equal(receivedEnv.env.READYROUTE_FCC_PASSWORD, 'super-secret-password');
  assert.equal(receivedEnv.env.READYROUTE_FCC_WORK_DATE, '2026-04-24');
  assert.equal(result.manifest_count, 1);
  assert.equal(result.manifest_pairs[0].work_area_name, '810');
  assert.equal(String(result.manifest_pairs[0].manifest_file.buffer), 'xls-body');
  assert.equal(String(result.manifest_pairs[0].companion_gpx_file.buffer), 'gpx-body');
});

test('pullRouteProgress returns parsed FCC progress snapshots from the runner output', async () => {
  let receivedEnv = null;
  const adapter = createCliFedexFccAdapter({
    command: '/usr/bin/fake-runner',
    async runCommand({ executable, args, env }) {
      receivedEnv = { executable, args, env };
      return {
        stdout: JSON.stringify({
          summary: 'Synced 1 FCC progress snapshot.',
          progress_snapshots: [
            {
              work_area_name: '823',
              record_count: 172,
              rows: [
                { sid: '1001', is_completed: false },
                { sid: '1002', is_completed: true }
              ]
            }
          ]
        }),
        stderr: ''
      };
    }
  });

  const result = await adapter.pullRouteProgress({
    account: {
      id: 'acct-1',
      operations_timezone: 'America/Los_Angeles'
    },
    fedexAccount: {
      id: 'fx-1',
      account_number: '123456789',
      connection_reference: 'bridge-fcc',
      fcc_username: 'bridge@example.com',
      fcc_password_encrypted: encryptFedexSecret('super-secret-password')
    },
    workDate: '2026-04-24',
    routeSyncSettings: {
      operations_timezone: 'America/Los_Angeles'
    },
    triggerSource: 'scheduled'
  });

  assert.equal(receivedEnv.executable, '/usr/bin/fake-runner');
  assert.equal(receivedEnv.env.READYROUTE_FCC_RUN_MODE, 'progress');
  assert.equal(result.route_count, 1);
  assert.equal(result.completed_stop_count, 1);
  assert.equal(result.progress_snapshots[0].record_count, 172);
});

test('getSessionStatePath builds a stable per-fedex-account cache path', () => {
  const sessionPath = getSessionStatePath({ id: 'fx-1', account_number: '123456789' });
  assert.match(sessionPath, /fx-1\.json$/);
});
