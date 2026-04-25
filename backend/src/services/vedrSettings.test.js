const test = require('node:test');
const assert = require('node:assert/strict');

const {
  VEDR_PROVIDERS,
  isValidVedrProvider,
  normalizeVedrProvider,
  presentVedrSettings,
  validateVedrSettingsPayload
} = require('./vedrSettings');

test('vedr settings helpers normalize and validate providers', () => {
  assert.deepEqual(VEDR_PROVIDERS, ['groundcloud', 'velocitor']);

  assert.equal(normalizeVedrProvider(' GroundCloud '), 'groundcloud');
  assert.equal(normalizeVedrProvider(''), null);
  assert.equal(normalizeVedrProvider(null), null);

  assert.equal(isValidVedrProvider('groundcloud'), true);
  assert.equal(isValidVedrProvider('velocitor'), true);
  assert.equal(isValidVedrProvider(null), true);
  assert.equal(isValidVedrProvider('other'), false);
});

test('vedr settings payload validation requires account_id and constrains provider', () => {
  assert.deepEqual(validateVedrSettingsPayload({
    account_id: ' account-123 ',
    provider: 'Velocitor',
    provider_login_url: 'https://vtrack.velsol.com/Account/Login',
    provider_username_hint: 'vladfed0801@gmail.com'
  }), {
    valid: true,
    errors: {},
    value: {
      account_id: 'account-123',
      provider: 'velocitor',
      provider_login_url: 'https://vtrack.velsol.com/Account/Login',
      provider_username_hint: 'vladfed0801@gmail.com'
    }
  });

  assert.deepEqual(validateVedrSettingsPayload({
    provider: 'unknown'
  }), {
    valid: false,
    errors: {
      account_id: 'account_id is required',
      provider: 'provider must be one of: groundcloud, velocitor'
    },
    value: {
      account_id: null,
      provider: 'unknown',
      provider_login_url: null,
      provider_username_hint: null
    }
  });

  assert.deepEqual(validateVedrSettingsPayload({
    account_id: 'account-123',
    provider: 'velocitor',
    provider_login_url: 'not-a-url'
  }), {
    valid: false,
    errors: {
      provider_login_url: 'provider_login_url must be a valid URL'
    },
    value: {
      account_id: 'account-123',
      provider: 'velocitor',
      provider_login_url: 'not-a-url',
      provider_username_hint: null
    }
  });
});

test('presentVedrSettings normalizes a row for route handlers', () => {
  assert.deepEqual(presentVedrSettings({
    id: 'vedr-1',
    account_id: 'account-123',
    provider: 'GroundCloud',
    provider_login_url: 'https://groundcloud.io/',
    provider_username_hint: 'manager@example.com',
    connection_status: 'connected',
    provider_selected_at: '2026-04-17T11:30:00.000Z',
    connection_started_at: '2026-04-17T11:35:00.000Z',
    connection_verified_at: '2026-04-17T12:00:00.000Z',
    setup_completed_at: '2026-04-17T12:00:00.000Z',
    created_at: '2026-04-17T11:00:00.000Z',
    updated_at: '2026-04-17T12:00:00.000Z'
  }), {
    id: 'vedr-1',
    account_id: 'account-123',
    provider: 'groundcloud',
    provider_login_url: 'https://groundcloud.io/',
    provider_username_hint: 'manager@example.com',
    connection_status: 'connected',
    provider_selected_at: '2026-04-17T11:30:00.000Z',
    connection_started_at: '2026-04-17T11:35:00.000Z',
    connection_verified_at: '2026-04-17T12:00:00.000Z',
    setup_completed_at: '2026-04-17T12:00:00.000Z',
    created_at: '2026-04-17T11:00:00.000Z',
    updated_at: '2026-04-17T12:00:00.000Z'
  });
});
