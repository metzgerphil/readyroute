const {
  VEDR_CONNECTION_STATUSES,
  VEDR_PROVIDER_VALUES
} = require('../config/constants');

function normalizeVedrProvider(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function isValidVedrProvider(value) {
  const normalized = normalizeVedrProvider(value);
  return normalized === null || VEDR_PROVIDER_VALUES.includes(normalized);
}

function validateVedrSettingsPayload(payload = {}) {
  const errors = {};
  const normalizedProvider = normalizeVedrProvider(payload.provider);
  const normalizedAccountId = String(payload.account_id || '').trim();

  if (!normalizedAccountId) {
    errors.account_id = 'account_id is required';
  }

  if (!isValidVedrProvider(normalizedProvider)) {
    errors.provider = `provider must be one of: ${VEDR_PROVIDER_VALUES.join(', ')}`;
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    value: {
      account_id: normalizedAccountId || null,
      provider: normalizedProvider
    }
  };
}

function presentVedrSettings(row = {}) {
  const provider = normalizeVedrProvider(row.provider);
  const connectionStatus = String(row.connection_status || '').trim().toLowerCase()
    || (provider ? VEDR_CONNECTION_STATUSES.WAITING_FOR_LOGIN : VEDR_CONNECTION_STATUSES.NOT_STARTED);

  return {
    id: row.id || null,
    account_id: row.account_id || null,
    provider,
    connection_status: connectionStatus,
    provider_selected_at: row.provider_selected_at || null,
    connection_started_at: row.connection_started_at || null,
    connection_verified_at: row.connection_verified_at || null,
    setup_completed_at: row.setup_completed_at || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null
  };
}

module.exports = {
  VEDR_PROVIDERS: VEDR_PROVIDER_VALUES,
  isValidVedrProvider,
  normalizeVedrProvider,
  presentVedrSettings,
  validateVedrSettingsPayload
};
