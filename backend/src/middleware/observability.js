const crypto = require('crypto');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRACE_ID_PATTERN = /^[a-f0-9]{32}$/i;

function releaseCommit() {
  return (
    process.env.RAILWAY_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.GIT_COMMIT_SHA ||
    null
  );
}

function resolveRequestId(value, randomUUID = crypto.randomUUID) {
  const candidate = String(value || '').trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function requestPath(req) {
  return String(req.originalUrl || req.url || req.path || '/').split('?')[0];
}

function requestIdentity(req) {
  const accountId = req.account?.account_id || req.driver?.account_id || null;
  const actorRole = req.readyrouteStaff?.role || req.account?.role || req.driver?.role || 'public';
  const identity = { actor_role: actorRole };

  if (accountId) identity.account_id = accountId;
  if (req.driver?.driver_id) identity.driver_id = req.driver.driver_id;
  if (req.account?.manager_user_id) identity.manager_user_id = req.account.manager_user_id;
  if (req.readyrouteStaff?.staff_user_id) {
    identity.staff_user_id = req.readyrouteStaff.staff_user_id;
    identity.staff_role = req.readyrouteStaff.staff_role;
  }

  return identity;
}

function cloudTraceField(req) {
  const traceId = String(req.headers['x-cloud-trace-context'] || '').split('/')[0];
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!projectId || !TRACE_ID_PATTERN.test(traceId)) return {};

  return { 'logging.googleapis.com/trace': `projects/${projectId}/traces/${traceId}` };
}

function defaultLog(record) {
  const output = `${JSON.stringify(record)}\n`;
  if (record.severity === 'ERROR') process.stderr.write(output);
  else process.stdout.write(output);
}

function shouldSkipSuccessfulRequest(path, statusCode) {
  if (statusCode >= 400) return false;
  return path === '/health' || path === '/health/ready' || path === '/routes/position';
}

function createRequestObservability(options = {}) {
  const enabled = options.enabled !== false;
  const log = options.log || defaultLog;
  const randomUUID = options.randomUUID || crypto.randomUUID;
  const now = options.now || (() => process.hrtime.bigint());

  return function requestObservability(req, res, next) {
    const startedAt = now();
    req.requestId = resolveRequestId(req.get('x-request-id'), randomUUID);
    res.set('X-Request-ID', req.requestId);

    res.once('finish', () => {
      if (!enabled) return;

      const path = requestPath(req);
      if (shouldSkipSuccessfulRequest(path, res.statusCode)) return;

      const durationMs = Number(now() - startedAt) / 1e6;
      log({
        severity: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
        message: 'HTTP request completed',
        timestamp: new Date().toISOString(),
        request_id: req.requestId,
        release_commit: releaseCommit(),
        ...cloudTraceField(req),
        ...requestIdentity(req),
        httpRequest: {
          requestMethod: req.method,
          requestUrl: path,
          status: res.statusCode,
          latency: `${Math.max(0, durationMs / 1000).toFixed(6)}s`
        }
      });
    });

    next();
  };
}

function logUnhandledRequestError(error, req, options = {}) {
  const log = options.log || defaultLog;
  log({
    severity: 'ERROR',
    message: 'Unhandled server error',
    timestamp: new Date().toISOString(),
    request_id: req.requestId || null,
    release_commit: releaseCommit(),
    ...cloudTraceField(req),
    ...requestIdentity(req),
    error_type: String(error?.name || 'Error').slice(0, 120),
    httpRequest: {
      requestMethod: req.method,
      requestUrl: requestPath(req),
      status: 500
    }
  });
}

module.exports = {
  createRequestObservability,
  logUnhandledRequestError,
  requestIdentity,
  resolveRequestId,
  shouldSkipSuccessfulRequest
};
