const test = require('node:test');
const assert = require('node:assert/strict');

const { parseVehicleImportRows } = require('./resourceImport');

test('vehicle imports keep Vehicle ID and License Plate separate', () => {
  const [vehicle] = parseVehicleImportRows({
    originalname: 'vehicles.csv',
    buffer: Buffer.from([
      'Vehicle ID,License Plate,Make,Model,Year',
      '329310,WA-12345,Freightliner,MT45,2012'
    ].join('\n'))
  });

  assert.equal(vehicle.name, '329310');
  assert.equal(vehicle.plate, 'WA-12345');
});
