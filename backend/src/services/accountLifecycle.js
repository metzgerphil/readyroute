const DEFAULT_RETENTION_DAYS = 60;

const ACCOUNT_STATUSES = Object.freeze({
  ACTIVE: 'active',
  CANCELING: 'canceling',
  RETAINED: 'retained'
});

function toValidDate(value, fallback = null) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function buildCancellationSchedule({
  now = new Date(),
  serviceEndsAt = null,
  retentionDays = DEFAULT_RETENTION_DAYS
} = {}) {
  const requestedAt = toValidDate(now, new Date());
  const requestedServiceEnd = toValidDate(serviceEndsAt, requestedAt);
  const effectiveServiceEnd = requestedServiceEnd.getTime() < requestedAt.getTime()
    ? requestedAt
    : requestedServiceEnd;
  const normalizedRetentionDays = Number.isFinite(Number(retentionDays)) && Number(retentionDays) > 0
    ? Math.floor(Number(retentionDays))
    : DEFAULT_RETENTION_DAYS;

  return {
    account_status: ACCOUNT_STATUSES.CANCELING,
    cancellation_requested_at: requestedAt.toISOString(),
    service_ends_at: effectiveServiceEnd.toISOString(),
    retention_ends_at: addDays(effectiveServiceEnd, normalizedRetentionDays).toISOString()
  };
}

function getEffectiveAccountStatus(account = {}, now = new Date()) {
  const storedStatus = String(account.account_status || ACCOUNT_STATUSES.ACTIVE).trim().toLowerCase();
  const currentTime = toValidDate(now, new Date()).getTime();
  const serviceEndsAt = toValidDate(account.service_ends_at);

  if (
    storedStatus === ACCOUNT_STATUSES.CANCELING &&
    serviceEndsAt &&
    serviceEndsAt.getTime() <= currentTime
  ) {
    return ACCOUNT_STATUSES.RETAINED;
  }

  return Object.values(ACCOUNT_STATUSES).includes(storedStatus)
    ? storedStatus
    : ACCOUNT_STATUSES.ACTIVE;
}

function getAccountAccess(account = {}, { method = 'GET', now = new Date() } = {}) {
  const status = getEffectiveAccountStatus(account, now);
  const isReadMethod = ['GET', 'HEAD', 'OPTIONS'].includes(String(method || 'GET').toUpperCase());

  if (status === ACCOUNT_STATUSES.RETAINED) {
    return {
      allowed: isReadMethod,
      read_only: true,
      status,
      error: isReadMethod
        ? null
        : 'This ReadyRoute workspace is in its data-retention period and is read-only.'
    };
  }

  return {
    allowed: true,
    read_only: false,
    status,
    error: null
  };
}

module.exports = {
  ACCOUNT_STATUSES,
  DEFAULT_RETENTION_DAYS,
  buildCancellationSchedule,
  getAccountAccess,
  getEffectiveAccountStatus
};
