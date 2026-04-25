const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const { decryptFedexSecret } = require('./fedexCredentials');
const { normalizeRouteWorkAreaName, parseFccWorkAreaIdentity } = require('./routeIdentity');

const execFileAsync = promisify(execFile);

function sanitizeSegment(value, fallback = 'default') {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return normalized || fallback;
}

function getBaseWorkingDirectory() {
  return process.env.FEDEX_FCC_WORKDIR || path.join('/tmp', 'readyroute-fedex-sync');
}

function getSessionStatePath(fedexAccount) {
  return path.join(
    getBaseWorkingDirectory(),
    'sessions',
    `${sanitizeSegment(fedexAccount?.id || fedexAccount?.account_number, 'fedex-account')}.json`
  );
}

function splitCommandArgs(value) {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function createCliFedexFccAdapter(options = {}) {
  const defaultExecutable = process.execPath;
  const defaultScriptPath = path.join(__dirname, '../scripts/fccAutomationRunner.js');
  const command = options.command || process.env.FEDEX_FCC_AUTOMATION_COMMAND || defaultExecutable;
  const commandArgs = Array.isArray(options.commandArgs)
    ? options.commandArgs
    : splitCommandArgs(
        options.commandArgs || process.env.FEDEX_FCC_AUTOMATION_ARGS || (command === defaultExecutable ? defaultScriptPath : '')
      );
  const runCommand = options.runCommand || (async ({ executable, args, env }) => execFileAsync(executable, args, { env }));
  const logger = options.logger || console;

  if (!command) {
    return null;
  }

  async function runFccAutomation({ account, fedexAccount, workDate, routeSyncSettings, triggerSource, runMode }) {
    const username = String(fedexAccount?.fcc_username || '').trim();
    const password = decryptFedexSecret(fedexAccount?.fcc_password_encrypted || null);

    if (!username || !password) {
      throw new Error('FCC credentials are missing for the default FedEx account.');
    }

    const runWorkingDirectory = path.join(
      getBaseWorkingDirectory(),
      sanitizeSegment(account?.id, 'account'),
      sanitizeSegment(workDate, 'work-date'),
      `${Date.now()}`
    );
    const sessionStatePath = getSessionStatePath(fedexAccount);

    await fs.mkdir(runWorkingDirectory, { recursive: true });
    await fs.mkdir(path.dirname(sessionStatePath), { recursive: true });

    const environment = {
      ...process.env,
      READYROUTE_FCC_USERNAME: username,
      READYROUTE_FCC_PASSWORD: password,
      READYROUTE_FCC_WORK_DATE: workDate,
      READYROUTE_FCC_ACCOUNT_NUMBER: String(fedexAccount?.account_number || ''),
      READYROUTE_FCC_CONNECTION_REFERENCE: String(fedexAccount?.connection_reference || ''),
      READYROUTE_FCC_TIMEZONE: String(routeSyncSettings?.operations_timezone || account?.operations_timezone || ''),
      READYROUTE_FCC_TRIGGER: String(triggerSource || 'manual'),
      READYROUTE_FCC_DOWNLOAD_DIR: runWorkingDirectory,
      READYROUTE_FCC_SESSION_STATE_PATH: sessionStatePath,
      READYROUTE_FCC_RUN_MODE: String(runMode || 'daily')
    };

    const { stdout, stderr } = await runCommand({
      executable: command,
      args: commandArgs,
      env: environment
    });

    if (stderr) {
      logger.warn('FCC automation stderr:', stderr);
    }

    let payload;
    try {
      payload = JSON.parse(String(stdout || '{}'));
    } catch (_error) {
      throw new Error('FCC automation returned invalid JSON.');
    }

    return {
      payload,
      runWorkingDirectory,
      sessionStatePath
    };
  }

  return {
    async pullDailyManifests({ account, fedexAccount, workDate, routeSyncSettings, triggerSource }) {
      const { payload, runWorkingDirectory, sessionStatePath } = await runFccAutomation({
        account,
        fedexAccount,
        workDate,
        routeSyncSettings,
        triggerSource,
        runMode: 'daily'
      });

      const manifests = Array.isArray(payload?.manifests) ? payload.manifests : [];

      const manifestPairs = await Promise.all(
        manifests.map(async (manifest, index) => {
          if (!manifest?.xls_path) {
            throw new Error(`FCC automation manifest ${index + 1} is missing xls_path.`);
          }

          const manifestBuffer = await fs.readFile(manifest.xls_path);
          const gpxBuffer = manifest.gpx_path ? await fs.readFile(manifest.gpx_path) : null;
          const identity = parseFccWorkAreaIdentity(manifest.work_area_name || '');

          return {
            work_area_name: identity.routeCode || normalizeRouteWorkAreaName(manifest.work_area_name) || null,
            raw_work_area_name: identity.rawWorkAreaName || manifest.work_area_name || null,
            driver_name: manifest.driver_name || identity.driverName || null,
            date: manifest.date || workDate,
            driver_id: manifest.driver_id || null,
            vehicle_id: manifest.vehicle_id || null,
            manifest_file: {
              originalname: path.basename(manifest.xls_path),
              buffer: manifestBuffer
            },
            companion_gpx_file: gpxBuffer
              ? {
                  originalname: path.basename(manifest.gpx_path),
                  buffer: gpxBuffer
                }
              : null
          };
        })
      );

      return {
        manifest_count: manifestPairs.length,
        changed_route_count: 0,
        has_changes: false,
        summary: payload?.summary || `Pulled ${manifestPairs.length} FCC manifests.`,
        details: {
          runner: path.basename(command),
          session_state_path: sessionStatePath,
          download_directory: runWorkingDirectory,
          progress_snapshot_count: Array.isArray(payload?.progress_snapshots) ? payload.progress_snapshots.length : 0
        },
        manifest_pairs: manifestPairs
      };
    },

    async pullRouteProgress({ account, fedexAccount, workDate, routeSyncSettings, triggerSource }) {
      const { payload, runWorkingDirectory, sessionStatePath } = await runFccAutomation({
        account,
        fedexAccount,
        workDate,
        routeSyncSettings,
        triggerSource,
        runMode: 'progress'
      });

      const progressSnapshots = Array.isArray(payload?.progress_snapshots) ? payload.progress_snapshots : [];
      const completedStopCount = progressSnapshots.reduce(
        (sum, snapshot) => sum + (snapshot?.rows || []).filter((row) => row?.is_completed).length,
        0
      );

      return {
        route_count: progressSnapshots.length,
        completed_stop_count: completedStopCount,
        has_changes: completedStopCount > 0,
        summary: payload?.summary || `Pulled FCC progress for ${progressSnapshots.length} work areas.`,
        details: {
          runner: path.basename(command),
          session_state_path: sessionStatePath,
          download_directory: runWorkingDirectory
        },
        progress_snapshots: progressSnapshots
      };
    }
  };
}

module.exports = {
  createCliFedexFccAdapter,
  getSessionStatePath
};
