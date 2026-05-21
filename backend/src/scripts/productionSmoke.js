const { createClient } = require('@supabase/supabase-js');

try {
  require('dotenv').config();
} catch (_error) {
  // dotenv is available in the backend package; this guard keeps the smoke
  // script usable in stripped-down CI installs too.
}

const DEFAULT_BACKEND_URL = 'https://api.readyroute.org';
const DEFAULT_PORTAL_URL = 'https://portal.readyroute.org';

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name) {
  return process.env[name] || '';
}

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let body = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch (_error) {
      body = text;
    }
  }

  if (!response.ok) {
    const detail = typeof body === 'string' ? body : JSON.stringify(body);
    throw new Error(`${options.method || 'GET'} ${url} failed with ${response.status}: ${detail}`);
  }

  return body;
}

async function requestOk(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${url} failed with ${response.status}`);
  }

  return response;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSmokeEmail(email) {
  if (!/^smoke-driver-[a-z0-9-]+@example\.com$/.test(email)) {
    throw new Error(`Refusing to clean up non-smoke driver email: ${email}`);
  }
}

async function deleteSmokeDriverByEmail(supabase, email) {
  assertSmokeEmail(email);

  const { error } = await supabase
    .from('drivers')
    .delete()
    .eq('email', email);

  if (error) {
    throw error;
  }
}

async function main() {
  const backendUrl = normalizeBaseUrl(process.env.SMOKE_BACKEND_URL || DEFAULT_BACKEND_URL);
  const portalUrl = normalizeBaseUrl(process.env.SMOKE_PORTAL_URL || DEFAULT_PORTAL_URL);
  const managerEmail = optionalEnv('SMOKE_MANAGER_EMAIL');
  const managerPassword = optionalEnv('SMOKE_MANAGER_PASSWORD');
  const passwordResetEmail = optionalEnv('SMOKE_PASSWORD_RESET_EMAIL');
  const supabaseUrl = optionalEnv('SUPABASE_URL');
  const supabaseServiceKey = optionalEnv('SUPABASE_SERVICE_KEY');
  const smokeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const smokeDriver = {
    name: `Smoke Test Driver ${smokeId}`,
    email: `smoke-driver-${smokeId}@example.com`,
    fedex_driver_id: `SMOKE-${smokeId.slice(-8).toUpperCase()}`,
    phone: '',
    pin: ''
  };

  console.log(`Smoke target backend: ${backendUrl}`);
  console.log(`Smoke target portal: ${portalUrl}`);

  await requestJson(`${backendUrl}/health`);
  console.log('ok backend health');

  await requestOk(`${portalUrl}/login`, { method: 'HEAD' });
  await requestOk(`${portalUrl}/drivers`, { method: 'HEAD' });
  console.log('ok portal routes');

  if (passwordResetEmail) {
    await requestJson(`${backendUrl}/auth/manager/request-password-reset`, {
      method: 'POST',
      body: JSON.stringify({
        email: passwordResetEmail
      })
    });
    console.log('ok manager password reset request');
  } else {
    console.log('skip manager password reset request: SMOKE_PASSWORD_RESET_EMAIL not set');
  }

  const hasDriverSmokeEnv = managerEmail && managerPassword && supabaseUrl && supabaseServiceKey;

  if (!hasDriverSmokeEnv) {
    console.log('skip authenticated driver smoke: SMOKE_MANAGER_EMAIL, SMOKE_MANAGER_PASSWORD, SUPABASE_URL, or SUPABASE_SERVICE_KEY not set');
    console.log('production smoke passed');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const login = await requestJson(`${backendUrl}/auth/manager/login`, {
    method: 'POST',
    body: JSON.stringify({
      email: managerEmail,
      password: managerPassword
    })
  });

  assert(login?.token, 'Manager login did not return a token');
  const authHeaders = { Authorization: `Bearer ${login.token}` };
  console.log('ok manager login');

  await requestJson(`${backendUrl}/manager/driver-access`, {
    headers: authHeaders
  });
  console.log('ok driver access lookup');

  await deleteSmokeDriverByEmail(supabase, smokeDriver.email);

  try {
    const created = await requestJson(`${backendUrl}/manager/drivers`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(smokeDriver)
    });

    assert(created?.driver_id, 'Driver create did not return a driver_id');
    assert(created?.starter_pin_applied === true, 'Driver create did not apply the starter PIN');
    console.log(`ok driver create ${created.driver_id}`);

    const drivers = await requestJson(`${backendUrl}/manager/drivers`, {
      headers: authHeaders
    });
    const foundDriver = (drivers?.drivers || []).find((driver) => driver.email === smokeDriver.email);

    assert(foundDriver, 'Created smoke driver was not returned by GET /manager/drivers');
    assert(foundDriver.fedex_driver_id === smokeDriver.fedex_driver_id, 'Created smoke driver FedEx ID did not round-trip');
    assert(!foundDriver.phone, 'Created smoke driver unexpectedly has a phone value');
    console.log('ok driver list verification');
  } finally {
    await deleteSmokeDriverByEmail(supabase, smokeDriver.email);
  }

  const remaining = await requestJson(`${backendUrl}/manager/drivers`, {
    headers: authHeaders
  });
  const stillPresent = (remaining?.drivers || []).some((driver) => driver.email === smokeDriver.email);

  assert(!stillPresent, 'Smoke driver cleanup did not remove the driver');
  console.log('ok smoke driver cleanup');
  console.log('production smoke passed');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
