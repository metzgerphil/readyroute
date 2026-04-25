const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const bcrypt = require('bcrypt');
const request = require('supertest');
const { createClient } = require('@supabase/supabase-js');

const { createApp } = require('../src/app');

jest.setTimeout(180000);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

function getTodayInLa() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function buildTestGpx(addresses) {
  const waypoints = addresses
    .map(
      (stop) => `  <wpt lat="${stop.lat}" lon="${stop.lng}"><n>${stop.address}</n></wpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ReadyRoute E2E">
${waypoints}
</gpx>`;
}

function getTinyTestImageBase64() {
  return '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxAQEBUQEBAVFhUVFRUVFRUVFRUVFRUVFRUWFhUVFRUYHSggGBolGxUVITEhJSkrLi4uFx8zODMsNygtLisBCgoKDg0OGhAQGi0fHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAAEAAQMBIgACEQEDEQH/xAAXAAADAQAAAAAAAAAAAAAAAAAAAQID/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEAMQAAAB6AAAAP/EABQQAQAAAAAAAAAAAAAAAAAAADD/2gAIAQEAAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAADD/2gAIAQIBAT8Af//EABQRAQAAAAAAAAAAAAAAAAAAADD/2gAIAQMBAT8Af//Z';
}

describe('ReadyRoute end-to-end workflow', () => {
  test('runs the complete delivery day flow and cleans up test data', async () => {
    const app = createApp();
    const api = request(app);
    const uniqueSuffix = `e2e-${Date.now()}`;
    const managerEmail = `${uniqueSuffix}@example.com`;
    const managerPassword = 'ReadyRoute!123';
    const driverEmail = `${uniqueSuffix}.driver@example.com`;
    const driverPin = '1234';
    const today = getTodayInLa();

    const cleanup = {
      accountId: null,
      driverId: null,
      vehicleId: null,
      routeId: null,
      stopIds: [],
      packageIds: []
    };

    const rawStops = [
      { address: '3707 Rosecrans St San Diego CA 92110', lat: 32.7586, lng: -117.2221 },
      { address: '111 W Harbor Dr San Diego CA 92101', lat: 32.7088, lng: -117.1689 },
      { address: '100 Park Blvd San Diego CA 92101', lat: 32.7076, lng: -117.1570 },
      { address: '7007 Friars Rd San Diego CA 92108', lat: 32.7696, lng: -117.1662 },
      { address: '2151 Hotel Circle S San Diego CA 92108', lat: 32.7581, lng: -117.1894 }
    ];

    try {
      // STEP 1 — Setup
      const managerPasswordHash = await bcrypt.hash(managerPassword, 10);
      const driverPinHash = await bcrypt.hash(driverPin, 10);

      const { data: account, error: accountError } = await supabase
        .from('accounts')
        .insert({
          company_name: `ReadyRoute Test ${uniqueSuffix}`,
          manager_email: managerEmail,
          manager_password_hash: managerPasswordHash,
          plan: 'starter'
        })
        .select('id')
        .single();

      expect(accountError).toBeNull();
      cleanup.accountId = account.id;

      const { data: driver, error: driverError } = await supabase
        .from('drivers')
        .insert({
          account_id: cleanup.accountId,
          name: `Test Driver ${uniqueSuffix}`,
          email: driverEmail,
          phone: '619-555-0101',
          hourly_rate: 25,
          pin: driverPinHash,
          is_active: true
        })
        .select('id')
        .single();

      expect(driverError).toBeNull();
      cleanup.driverId = driver.id;

      const { data: vehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .insert({
          account_id: cleanup.accountId,
          name: `Test Van ${uniqueSuffix}`,
          make: 'Ford',
          model: 'Transit',
          year: 2023,
          plate: uniqueSuffix.slice(0, 8).toUpperCase(),
          current_mileage: 1000
        })
        .select('id')
        .single();

      expect(vehicleError).toBeNull();
      cleanup.vehicleId = vehicle.id;

      // STEP 2 — Manager login
      const managerLogin = await api
        .post('/auth/manager/login')
        .send({ email: managerEmail, password: managerPassword });

      expect(managerLogin.status).toBe(200);
      const managerToken = managerLogin.body.token;
      expect(managerToken).toBeTruthy();

      // STEP 3 — Upload test GPX manifest
      const gpxContent = buildTestGpx(rawStops);
      const uploadResponse = await api
        .post('/routes/upload-gpx')
        .set('Authorization', `Bearer ${managerToken}`)
        .field('work_area_name', `810-${uniqueSuffix.slice(-4)}`)
        .field('driver_id', cleanup.driverId)
        .field('vehicle_id', cleanup.vehicleId)
        .field('date', today)
        .attach('file', Buffer.from(gpxContent, 'utf8'), 'test-manifest.gpx');

      expect(uploadResponse.status).toBe(201);
      expect(uploadResponse.body.total_stops).toBe(5);
      cleanup.routeId = uploadResponse.body.route_id;

      const dispatchResponse = await api
        .post('/manager/routes/dispatch')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          date: today,
          route_ids: [cleanup.routeId]
        });

      expect(dispatchResponse.status).toBe(200);

      const { data: uploadedStops, error: uploadedStopsError } = await supabase
        .from('stops')
        .select('id, route_id, sequence_order, address, lat, lng, completed_at, exception_code')
        .eq('route_id', cleanup.routeId)
        .order('sequence_order');

      expect(uploadedStopsError).toBeNull();
      expect(uploadedStops).toHaveLength(5);
      cleanup.stopIds = uploadedStops.map((stop) => stop.id);

      const validationObserved =
        (uploadResponse.body.address_warnings || []).length > 0 ||
        uploadedStops.some((stop, index) => stop.address !== rawStops[index].address);

      expect(validationObserved).toBe(false);

      const { data: uploadedPackages, error: uploadedPackagesError } = await supabase
        .from('packages')
        .select('id, stop_id')
        .in('stop_id', cleanup.stopIds);

      expect(uploadedPackagesError).toBeNull();
      cleanup.packageIds = (uploadedPackages || []).map((pkg) => pkg.id);

      // STEP 4 — Driver login
      const driverLogin = await api
        .post('/auth/driver/login')
        .send({ email: driverEmail, pin: driverPin });

      expect(driverLogin.status).toBe(200);
      const driverToken = driverLogin.body.token;
      expect(driverToken).toBeTruthy();

      // STEP 5 — Load today's route
      const todayRouteResponse = await api
        .get('/routes/today')
        .set('Authorization', `Bearer ${driverToken}`);

      expect(todayRouteResponse.status).toBe(200);
      expect(todayRouteResponse.body.route).toBeTruthy();
      expect(todayRouteResponse.body.route.stops).toHaveLength(5);

      const routeStops = todayRouteResponse.body.route.stops;

      // STEP 6 — Complete 3 stops
      for (let index = 0; index < 3; index += 1) {
        const stop = routeStops[index];
        const completeResponse = await api
          .patch(`/routes/stops/${stop.id}/complete`)
          .set('Authorization', `Bearer ${driverToken}`)
          .send({ status: 'delivered' });

        expect(completeResponse.status).toBe(200);

        const { data: routeRecord, error: routeRecordError } = await supabase
          .from('routes')
          .select('completed_stops')
          .eq('id', cleanup.routeId)
          .maybeSingle();

        expect(routeRecordError).toBeNull();
        expect(routeRecord.completed_stops).toBe(index + 1);
      }

      const now = new Date();
      const firstScan = new Date(now.getTime() - 45 * 60 * 1000);
      const secondScan = new Date(now.getTime() - 30 * 60 * 1000);
      const thirdScan = new Date(now.getTime() - 15 * 60 * 1000);

      await supabase
        .from('stops')
        .update({ completed_at: firstScan.toISOString() })
        .eq('id', routeStops[0].id);
      await supabase
        .from('stops')
        .update({ completed_at: secondScan.toISOString() })
        .eq('id', routeStops[1].id);
      await supabase
        .from('stops')
        .update({ completed_at: thirdScan.toISOString() })
        .eq('id', routeStops[2].id);

      // STEP 7 — Check stops/hr calculation
      const dashboardResponse = await api
        .get('/manager/dashboard')
        .set('Authorization', `Bearer ${managerToken}`);

      expect(dashboardResponse.status).toBe(200);
      const dashboardDriver = dashboardResponse.body.drivers.find((entry) => entry.driver_id === cleanup.driverId);
      expect(dashboardDriver).toBeTruthy();
      expect(typeof dashboardDriver.stops_per_hour).toBe('number');
      expect(dashboardDriver.stops_per_hour).toBeGreaterThan(0);

      const expectedSph = Number(
        (
          3 /
          ((Date.now() - firstScan.getTime()) / (1000 * 60 * 60))
        ).toFixed(1)
      );
      expect(Math.abs(dashboardDriver.stops_per_hour - expectedSph)).toBeLessThanOrEqual(0.2);

      // STEP 9 — Attempt one stop with Code 02
      const attemptedStop = routeStops[3];
      const attemptResponse = await api
        .patch(`/routes/stops/${attemptedStop.id}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          status: 'attempted',
          exception_code: '002'
        });

      expect(attemptResponse.status).toBe(200);

      const attemptedStopDetail = await api
        .get(`/routes/stops/${attemptedStop.id}`)
        .set('Authorization', `Bearer ${driverToken}`);

      expect(attemptedStopDetail.status).toBe(200);
      expect(attemptedStopDetail.body.stop.status).toBe('attempted');
      expect(attemptedStopDetail.body.stop.exception_code).toBe('002');

      // SCENARIO A — Delivery with Driver Release (Code 014)
      const driverReleaseStop = routeStops[0];
      const driverReleaseResponse = await api
        .patch(`/routes/stops/${driverReleaseStop.id}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          status: 'delivered',
          delivery_type_code: '014',
          pod_photo_url: 'https://example.com/test-driver-release.jpg'
        });

      expect(driverReleaseResponse.status).toBe(200);

      const { data: driverReleaseRecord, error: driverReleaseError } = await supabase
        .from('stops')
        .select('delivery_type_code')
        .eq('id', driverReleaseStop.id)
        .maybeSingle();

      expect(driverReleaseError).toBeNull();
      expect(driverReleaseRecord.delivery_type_code).toBe('014');

      const managerRoutesAfterDriverRelease = await api
        .get('/manager/routes')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ date: today });

      expect(managerRoutesAfterDriverRelease.status).toBe(200);
      const managerDriverReleaseStop = managerRoutesAfterDriverRelease.body.routes
        .flatMap((route) => route.stops || [])
        .find((stop) => stop.id === driverReleaseStop.id);
      expect(managerDriverReleaseStop).toBeTruthy();
      expect(managerDriverReleaseStop.delivery_type_code).toBe('014');

      // SCENARIO B — Delivery with Signature (Code 013)
      const signatureStop = routeStops[1];
      const signatureUploadResponse = await api
        .post(`/routes/stops/${signatureStop.id}/signature`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          image_base64: getTinyTestImageBase64(),
          signer_name: 'John Smith',
          age_confirmed: false
        });

      expect(signatureUploadResponse.status).toBe(201);
      expect(signatureUploadResponse.body.signature_url).toBeTruthy();

      const { data: signatureStopAfterUpload, error: signatureUploadError } = await supabase
        .from('stops')
        .select('signature_url, signer_name, age_confirmed')
        .eq('id', signatureStop.id)
        .maybeSingle();

      expect(signatureUploadError).toBeNull();
      expect(signatureStopAfterUpload.signature_url).toBeTruthy();
      expect(signatureStopAfterUpload.signer_name).toBe('John Smith');
      expect(signatureStopAfterUpload.age_confirmed).toBe(false);

      const signatureCompleteResponse = await api
        .patch(`/routes/stops/${signatureStop.id}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          status: 'delivered',
          delivery_type_code: '013'
        });

      expect(signatureCompleteResponse.status).toBe(200);

      const managerSignatureResponse = await api
        .get(`/manager/stops/${signatureStop.id}/signature`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(managerSignatureResponse.status).toBe(200);
      expect(managerSignatureResponse.body.stop.signature_url).toBeTruthy();
      expect(managerSignatureResponse.body.stop.signer_name).toBe('John Smith');
      expect(managerSignatureResponse.body.stop.delivery_type_code).toBe('013');

      // SCENARIO C — Category 2 code with service score warning
      const category2Stop = routeStops[3];
      const category2Response = await api
        .patch(`/routes/stops/${category2Stop.id}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          status: 'attempted',
          exception_code: '002'
        });

      expect(category2Response.status).toBe(200);

      const { data: category2Record, error: category2Error } = await supabase
        .from('stops')
        .select('status, exception_code')
        .eq('id', category2Stop.id)
        .maybeSingle();

      expect(category2Error).toBeNull();
      expect(category2Record.exception_code).toBe('002');

      const category2StopDetail = await api
        .get(`/routes/stops/${category2Stop.id}`)
        .set('Authorization', `Bearer ${driverToken}`);

      expect(category2StopDetail.status).toBe(200);
      expect(category2StopDetail.body.stop.status).toBe('attempted');
      expect(category2StopDetail.body.stop.exception_code).toBe('002');

      const managerRoutesAfterCategory2 = await api
        .get('/manager/routes')
        .set('Authorization', `Bearer ${managerToken}`)
        .query({ date: today });

      expect(managerRoutesAfterCategory2.status).toBe(200);
      const managerCategory2Stop = managerRoutesAfterCategory2.body.routes
        .flatMap((route) => route.stops || [])
        .find((stop) => stop.id === category2Stop.id);
      expect(managerCategory2Stop).toBeTruthy();
      expect(managerCategory2Stop.exception_code).toBe('002');

      // SCENARIO D — Pickup stop codes
      const pickupStop = routeStops[4];
      const { error: pickupMarkError } = await supabase
        .from('stops')
        .update({ is_pickup: true })
        .eq('id', pickupStop.id);

      expect(pickupMarkError).toBeNull();

      const pickupAttemptResponse = await api
        .patch(`/routes/stops/${pickupStop.id}/complete`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          status: 'pickup_attempted',
          exception_code: 'P10'
        });

      expect(pickupAttemptResponse.status).toBe(200);

      const { data: pickupRecord, error: pickupRecordError } = await supabase
        .from('stops')
        .select('status, exception_code, is_pickup')
        .eq('id', pickupStop.id)
        .maybeSingle();

      expect(pickupRecordError).toBeNull();
      expect(pickupRecord.is_pickup).toBe(true);
      expect(pickupRecord.exception_code).toBe('P10');

      const pickupStopDetail = await api
        .get(`/routes/stops/${pickupStop.id}`)
        .set('Authorization', `Bearer ${driverToken}`);

      expect(pickupStopDetail.status).toBe(200);
      expect(pickupStopDetail.body.stop.status).toBe('pickup_attempted');
      expect(pickupStopDetail.body.stop.exception_code).toBe('P10');

      // SCENARIO E — Status codes endpoint
      const statusCodesResponse = await api
        .get('/routes/status-codes')
        .set('Authorization', `Bearer ${driverToken}`);

      expect(statusCodesResponse.status).toBe(200);
      expect(Array.isArray(statusCodesResponse.body.codes)).toBe(true);

      const categories = [...new Set(statusCodesResponse.body.codes.map((code) => code.category))];
      expect(categories).toEqual(expect.arrayContaining(['1', '2', '3', 'P1', 'P2']));

      const category2Codes = statusCodesResponse.body.codes.filter((code) => code.category === '2');
      expect(category2Codes.length).toBeGreaterThan(0);
      expect(category2Codes.every((code) => code.affects_service_score === true)).toBe(true);

      const code002 = statusCodesResponse.body.codes.find((code) => code.code === '002');
      expect(code002).toBeTruthy();
      expect(code002.requires_warning).toBe(true);
    } finally {
      // STEP 10 — Cleanup
      if (cleanup.packageIds.length) {
        await supabase.from('packages').delete().in('id', cleanup.packageIds);
      }

      if (cleanup.stopIds.length) {
        await supabase.from('stops').delete().in('id', cleanup.stopIds);
      }

      if (cleanup.routeId) {
        await supabase.from('routes').delete().eq('id', cleanup.routeId);
      }

      if (cleanup.vehicleId) {
        await supabase.from('vehicles').delete().eq('id', cleanup.vehicleId);
      }

      if (cleanup.driverId) {
        await supabase.from('drivers').delete().eq('id', cleanup.driverId);
      }

      if (cleanup.accountId) {
        await supabase.from('accounts').delete().eq('id', cleanup.accountId);
      }
    }
  });
});
