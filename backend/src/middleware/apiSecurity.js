const crypto = require('crypto');
const { ipKeyGenerator, rateLimit } = require('express-rate-limit');

const DEFAULT_LIMITS = {
  global: { windowMs: 15 * 60 * 1000, limit: 3000 },
  login: { windowMs: 15 * 60 * 1000, limit: 20 },
  passwordReset: { windowMs: 60 * 60 * 1000, limit: 6 },
  publicForm: { windowMs: 60 * 60 * 1000, limit: 20 },
  upload: { windowMs: 15 * 60 * 1000, limit: 60 },
  driverPosition: { windowMs: 60 * 1000, limit: 30 }
};

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIpKey(req) {
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
}

function hashKeyPart(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 20);
}

function getRequestIdentifier(req) {
  return String(
    req.body?.email ||
    req.body?.phone ||
    req.body?.account_id ||
    req.body?.manager_email ||
    req.params?.driver_id ||
    req.params?.managerUserId ||
    req.body?.token ||
    ''
  ).trim().toLowerCase();
}

function createLimiter({
  enabled = true,
  keyGenerator = getClientIpKey,
  limit,
  message,
  name,
  skip,
  skipSuccessfulRequests = false,
  windowMs
}) {
  if (!enabled) {
    return (_req, _res, next) => next();
  }

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: (req, res) => req.method === 'OPTIONS' || Boolean(skip?.(req, res)),
    skipSuccessfulRequests,
    keyGenerator,
    handler(req, res, _next, options) {
      const resetTime = req.rateLimit?.resetTime instanceof Date
        ? req.rateLimit.resetTime.getTime()
        : Date.now() + options.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
      return res.status(options.statusCode).json({
        error: message,
        code: 'RATE_LIMITED',
        limit: name,
        retry_after_seconds: retryAfterSeconds
      });
    }
  });
}

function createApiRateLimiters(options = {}) {
  const enabled = options.enabled !== false;
  const overrides = options.limits || {};
  const resolveLimit = (name, envName) => positiveInteger(
    overrides[name],
    positiveInteger(process.env[envName], DEFAULT_LIMITS[name].limit)
  );

  return {
    global: createLimiter({
      enabled,
      name: 'global_api',
      ...DEFAULT_LIMITS.global,
      limit: resolveLimit('global', 'RATE_LIMIT_GLOBAL'),
      message: 'Too many requests. Please wait briefly and try again.',
      skip: (req) => req.path === '/health' || req.path === '/billing/webhook' || req.path === '/routes/position'
    }),
    login: createLimiter({
      enabled,
      name: 'login',
      ...DEFAULT_LIMITS.login,
      limit: resolveLimit('login', 'RATE_LIMIT_LOGIN'),
      message: 'Too many login attempts. Please wait before trying again.',
      skipSuccessfulRequests: true,
      keyGenerator(req) {
        const identifier = getRequestIdentifier(req);
        return `${getClientIpKey(req)}:${req.path}:${hashKeyPart(identifier || 'missing')}`;
      }
    }),
    passwordReset: createLimiter({
      enabled,
      name: 'password_reset',
      ...DEFAULT_LIMITS.passwordReset,
      limit: resolveLimit('passwordReset', 'RATE_LIMIT_PASSWORD_RESET'),
      message: 'Too many password reset requests. Please wait before trying again.',
      keyGenerator(req) {
        const identifier = getRequestIdentifier(req);
        return `${getClientIpKey(req)}:${req.path}:${hashKeyPart(identifier || 'missing')}`;
      }
    }),
    publicForm: createLimiter({
      enabled,
      name: 'public_form',
      ...DEFAULT_LIMITS.publicForm,
      limit: resolveLimit('publicForm', 'RATE_LIMIT_PUBLIC_FORM'),
      message: 'Too many submissions. Please wait before trying again.',
      skip: (req) => req.method !== 'POST'
    }),
    upload: createLimiter({
      enabled,
      name: 'upload',
      ...DEFAULT_LIMITS.upload,
      limit: resolveLimit('upload', 'RATE_LIMIT_UPLOAD'),
      message: 'Too many uploads. Please wait before trying again.',
      skip: (req) => req.method !== 'POST'
    })
  };
}

function createDriverPositionLimiter(options = {}) {
  const configuredLimit = positiveInteger(
    options.limit,
    positiveInteger(process.env.RATE_LIMIT_DRIVER_POSITION, DEFAULT_LIMITS.driverPosition.limit)
  );

  return createLimiter({
    enabled: options.enabled !== false,
    name: 'driver_position',
    ...DEFAULT_LIMITS.driverPosition,
    limit: configuredLimit,
    message: 'Location updates are arriving too quickly. Please continue driving; tracking will resume automatically.',
    keyGenerator(req) {
      return req.driver?.driver_id
        ? `driver:${req.driver.driver_id}`
        : `ip:${getClientIpKey(req)}`;
    }
  });
}

module.exports = {
  DEFAULT_LIMITS,
  createApiRateLimiters,
  createDriverPositionLimiter,
  getClientIpKey
};
