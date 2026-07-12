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

function assertSmokeVehicle(vehicle) {
  const name = String(vehicle?.name || '');
  const plate = String(vehicle?.plate || '');
  const notes = String(vehicle?.notes || '');

  if (!/^Smoke Test Vehicle [a-z0-9-]+$/i.test(name) || !/^SMK[A-Z0-9]+$/.test(plate) || !notes.startsWith('ReadyRoute production smoke ')) {
    throw new Error('Refusing to clean up a vehicle that is not an isolated smoke record');
  }
}

function assertSmokeInspectionPhoto(photo, vehicleId) {
  const bucket = String(photo?.storage_bucket || '');
  const path = String(photo?.storage_path || '');

  if (bucket !== 'vehicle-inspection-photos' || !path.includes(`/${vehicleId}/manager-inspection/vedr/`)) {
    throw new Error('Refusing to clean up a photo that is not an isolated manager inspection smoke record');
  }
}

async function deleteSmokeVehicle(supabase, vehicleId, photo = null) {
  const { data: vehicle, error: vehicleLookupError } = await supabase
    .from('vehicles')
    .select('id, account_id, name, plate, notes')
    .eq('id', vehicleId)
    .maybeSingle();

  if (vehicleLookupError) {
    throw vehicleLookupError;
  }

  if (!vehicle) {
    return;
  }

  assertSmokeVehicle(vehicle);

  if (photo?.storage_path) {
    assertSmokeInspectionPhoto(photo, vehicleId);
    const { error: photoDeleteError } = await supabase.storage
      .from(photo.storage_bucket)
      .remove([photo.storage_path]);

    if (photoDeleteError) {
      throw photoDeleteError;
    }
  }

  const { error: vehicleDeleteError } = await supabase
    .from('vehicles')
    .delete()
    .eq('id', vehicle.id)
    .eq('account_id', vehicle.account_id);

  if (vehicleDeleteError) {
    throw vehicleDeleteError;
  }
}

async function runManagerInspectionSmoke({ backendUrl, authHeaders, supabase, smokeId }) {
  const vehicleName = `Smoke Test Vehicle ${smokeId}`;
  const vehiclePlate = `SMK${smokeId.replace(/[^a-z0-9]/gi, '').slice(-9).toUpperCase()}`;
  const vehicleNotes = `ReadyRoute production smoke ${smokeId}`;
  let vehicleId = null;
  let inspectionPhoto = null;

  try {
    const createdVehicle = await requestJson(`${backendUrl}/vehicles`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: vehicleName,
        plate: vehiclePlate,
        truck_type: 'P1000',
        make: 'ReadyRoute',
        model: 'Smoke Test',
        year: 2026,
        current_mileage: 1,
        fuel_type: 'Diesel',
        notes: vehicleNotes
      })
    });

    assert(createdVehicle?.vehicle_id, 'Vehicle create did not return a vehicle_id');
    vehicleId = createdVehicle.vehicle_id;

    console.log(`ok manager inspection smoke vehicle ${vehicleId}`);

    const uploadedPhoto = await requestJson(`${backendUrl}/vehicles/${vehicleId}/inspection-photo`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        checklist_item_key: 'vedr',
        image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        mime_type: 'image/png',
        file_name: `smoke-${smokeId}.png`
      })
    });

    inspectionPhoto = uploadedPhoto?.photo;
    assert(inspectionPhoto?.storage_path, 'Manager inspection photo upload did not return a storage path');
    assert(inspectionPhoto?.url, 'Manager inspection photo upload did not return a signed URL');
    assertSmokeInspectionPhoto(inspectionPhoto, vehicleId);
    console.log('ok manager inspection private photo upload');

    const createdInspection = await requestJson(`${backendUrl}/vehicles/${vehicleId}/inspections`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        inspection_date: new Date().toISOString().slice(0, 10),
        odometer: 1,
        issue_note: `Production smoke ${smokeId}`,
        items: [
          {
            checklist_item_key: 'vedr',
            label: 'VEDR',
            category: 'safety_equipment',
            status: 'issue',
            severity: 'maintenance_soon',
            issue_details: { issue_type: 'Not Connected' },
            note: 'Production smoke inspection',
            photos: [inspectionPhoto]
          },
          {
            checklist_item_key: 'parking_sensors',
            label: 'Parking Sensors',
            category: 'safety_equipment',
            status: 'pass',
            severity: null,
            issue_details: {},
            photos: []
          }
        ]
      })
    });

    const inspection = createdInspection?.inspection;
    assert(inspection?.id, 'Manager inspection create did not return an inspection id');
    assert(inspection.status === 'safe_with_maintenance_reported', 'Manager inspection did not preserve maintenance severity');
    assert(inspection.issue_count === 1, 'Manager inspection did not preserve its issue count');
    assert(inspection.items?.[0]?.issue_details?.issue_type === 'Not Connected', 'Manager inspection did not preserve the VEDR issue choice');
    assert(inspection.items?.[0]?.photos?.[0]?.url, 'Manager inspection response did not provide private photo access');
    console.log(`ok detailed manager inspection ${inspection.id}`);

    const loadedInspection = await requestJson(`${backendUrl}/vehicles/inspections/${inspection.id}`, {
      headers: authHeaders
    });
    const loadedVedr = loadedInspection?.inspection?.items?.find((item) => item.checklist_item_key === 'vedr');

    assert(loadedInspection?.inspection?.id === inspection.id, 'Manager inspection detail did not return the created inspection');
    assert(loadedVedr?.issue_details?.issue_type === 'Not Connected', 'Manager inspection detail lost the VEDR issue choice');
    assert(loadedVedr?.photos?.[0]?.url, 'Manager inspection detail did not return a signed photo URL');
    console.log('ok manager inspection detail and private photo retrieval');
  } finally {
    if (vehicleId) {
      await deleteSmokeVehicle(supabase, vehicleId, inspectionPhoto);
      console.log('ok manager inspection smoke cleanup');
    }
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

  const missingAuthenticatedSmokeEnv = [
    ['SMOKE_MANAGER_EMAIL', managerEmail],
    ['SMOKE_MANAGER_PASSWORD', managerPassword],
    ['SUPABASE_URL', supabaseUrl],
    ['SUPABASE_SERVICE_KEY', supabaseServiceKey]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missingAuthenticatedSmokeEnv.length) {
    throw new Error(`Authenticated production smoke is not configured: ${missingAuthenticatedSmokeEnv.join(', ')}`);
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
    const leakedDriver = (drivers?.drivers || []).find((driver) => driver.email === smokeDriver.email);

    assert(!leakedDriver, 'Smoke driver leaked into the manager-facing driver list');
    console.log('ok smoke driver production-list filtering');

    const { data: persistedDriver, error: persistedDriverError } = await supabase
      .from('drivers')
      .select('id, email, fedex_driver_id, phone')
      .eq('id', created.driver_id)
      .maybeSingle();

    if (persistedDriverError) {
      throw persistedDriverError;
    }

    assert(persistedDriver?.email === smokeDriver.email, 'Created smoke driver was not persisted');
    assert(persistedDriver.fedex_driver_id === smokeDriver.fedex_driver_id, 'Created smoke driver FedEx ID did not round-trip');
    assert(!persistedDriver.phone, 'Created smoke driver unexpectedly has a phone value');
    console.log('ok driver persistence verification');
  } finally {
    await deleteSmokeDriverByEmail(supabase, smokeDriver.email);
  }

  const { data: remainingDriver, error: remainingDriverError } = await supabase
    .from('drivers')
    .select('id')
    .eq('email', smokeDriver.email)
    .maybeSingle();

  if (remainingDriverError) {
    throw remainingDriverError;
  }
  assert(!remainingDriver, 'Smoke driver cleanup did not remove the driver');
  console.log('ok smoke driver cleanup');

  await runManagerInspectionSmoke({
    backendUrl,
    authHeaders,
    supabase,
    smokeId
  });

  console.log('production smoke passed');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  assertSmokeEmail,
  assertSmokeInspectionPhoto,
  assertSmokeVehicle
};
