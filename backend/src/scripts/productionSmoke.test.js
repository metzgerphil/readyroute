const assert = require('node:assert/strict');
const test = require('node:test');

const {
  assertSmokeEmail,
  assertSmokeInspectionPhoto,
  assertSmokeVehicle
} = require('./productionSmoke');

test('production smoke cleanup accepts only isolated driver identities', () => {
  assert.doesNotThrow(() => assertSmokeEmail('smoke-driver-123-abc@example.com'));
  assert.throws(
    () => assertSmokeEmail('driver@customer.example'),
    /Refusing to clean up non-smoke driver email/
  );
});

test('production smoke cleanup accepts only marked vehicle records', () => {
  assert.doesNotThrow(() => assertSmokeVehicle({
    name: 'Smoke Test Vehicle 123-abc',
    plate: 'SMK123ABC',
    notes: 'ReadyRoute production smoke 123-abc'
  }));
  assert.throws(
    () => assertSmokeVehicle({
      name: '204526',
      plate: 'REAL123',
      notes: 'Customer vehicle'
    }),
    /Refusing to clean up a vehicle that is not an isolated smoke record/
  );
});

test('production smoke cleanup accepts only its private inspection photo path', () => {
  assert.doesNotThrow(() => assertSmokeInspectionPhoto({
    storage_bucket: 'vehicle-inspection-photos',
    storage_path: 'account-1/vehicle-1/manager-inspection/vedr/smoke.png'
  }, 'vehicle-1'));
  assert.throws(
    () => assertSmokeInspectionPhoto({
      storage_bucket: 'vehicle-inspection-photos',
      storage_path: 'account-1/another-vehicle/manager-inspection/vedr/customer.png'
    }, 'vehicle-1'),
    /Refusing to clean up a photo that is not an isolated manager inspection smoke record/
  );
});
