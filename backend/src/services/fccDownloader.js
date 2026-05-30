const fs = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

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

async function readManifestFile(filePath, key) {
  if (!filePath) {
    return null;
  }

  const buffer = await fs.readFile(filePath);
  return {
    originalname: path.basename(filePath),
    buffer,
    source_key: key
  };
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

  async function runFccAutomation(_options) {
    throw new Error('FCC portal automation is disabled. Download manifests from the FCC portal and upload them to ReadyRoute manually.');
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
          const primaryXlsPath = manifest?.combined_xls_path || manifest?.xls_path;

          if (!primaryXlsPath && !manifest?.delivery_xls_path && !manifest?.pickup_xls_path) {
            throw new Error(`FCC automation manifest ${index + 1} is missing manifest XLS paths.`);
          }

          const combinedManifestFile = await readManifestFile(primaryXlsPath, 'combined');
          const combinedGpxFile = await readManifestFile(manifest.combined_gpx_path || manifest.gpx_path, 'combined_gpx');
          const deliveryManifestFile = await readManifestFile(manifest.delivery_xls_path, 'delivery');
          const pickupManifestFile = await readManifestFile(manifest.pickup_xls_path, 'pickup');
          const identity = parseFccWorkAreaIdentity(manifest.work_area_name || '');

          return {
            work_area_name: identity.routeCode || normalizeRouteWorkAreaName(manifest.work_area_name) || null,
            raw_work_area_name: identity.rawWorkAreaName || manifest.work_area_name || null,
            driver_name: manifest.driver_name || identity.driverName || null,
            date: manifest.date || workDate,
            driver_id: manifest.driver_id || null,
            vehicle_id: manifest.vehicle_id || null,
            manifest_file: combinedManifestFile || deliveryManifestFile || pickupManifestFile,
            companion_gpx_file: combinedGpxFile,
            combined_manifest_file: combinedManifestFile,
            combined_gpx_file: combinedGpxFile,
            delivery_manifest_file: deliveryManifestFile,
            pickup_manifest_file: pickupManifestFile,
            download_errors: Array.isArray(manifest.download_errors) ? manifest.download_errors : [],
            artifact_record_counts: manifest.artifact_record_counts || {}
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
          progress_snapshot_count: Array.isArray(payload?.progress_snapshots) ? payload.progress_snapshots.length : 0,
          skipped_manifest_snapshots: Array.isArray(payload?.skipped_manifest_snapshots)
            ? payload.skipped_manifest_snapshots
            : [],
          manifest_artifacts: manifestPairs.map((pair) => ({
            work_area_name: pair.work_area_name,
            raw_work_area_name: pair.raw_work_area_name,
            date: pair.date,
            has_combined_xls: Boolean(pair.combined_manifest_file),
            has_combined_gpx: Boolean(pair.combined_gpx_file),
            has_delivery_xls: Boolean(pair.delivery_manifest_file),
            has_pickup_xls: Boolean(pair.pickup_manifest_file),
            download_errors: pair.download_errors,
            artifact_record_counts: pair.artifact_record_counts
          }))
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
      const exceptionStopCount = progressSnapshots.reduce(
        (sum, snapshot) => sum + (snapshot?.rows || []).filter((row) => row?.is_exception || row?.exception_code).length,
        0
      );

      return {
        route_count: progressSnapshots.length,
        completed_stop_count: completedStopCount,
        exception_stop_count: exceptionStopCount,
        has_changes: false,
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
