const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
  parseXLSManifest,
  parseGPXManifest,
  detectApartmentUnitStop,
  detectManifestFormat,
  detectBusinessContact,
  detectSecondaryAddressType,
  extractFloorLabel,
  inferLocationType
} = require('./manifestParser');

function buildFedExWorkbookBuffer() {
  const workbook = XLSX.utils.book_new();

  const headerRows = [
    ['Page', 'Combined Manifest'],
    ['Date', '04/13/2026'],
    ['SA#', '919'],
    ['WA#', '0810'],
    ['IC/ISP', 'Bridge Transportation Inc'],
    ['Driver', 'JIMENEZ,LUIS'],
    ['User Type', 'DRIVER'],
    ['Vehicle #', '402984'],
    ['Vehicle Type', 'VAN']
  ];

  const stopDetailRows = [
    [
      'ST#',
      'Delivery/Pickup',
      'Contact Name',
      'Address Line 1',
      'Address Line 2',
      'City',
      'State',
      'Postal Code',
      '# Pkgs',
      'SID',
      'Ready',
      'Close'
    ]
  ];

  for (let stopNumber = 1; stopNumber <= 111; stopNumber += 1) {
    stopDetailRows.push([
      stopNumber,
      'Delivery',
      stopNumber === 1
        ? 'PALOMAR REHABILITATION'
        : stopNumber === 2
          ? 'Stone Brewing'
          : stopNumber === 3
            ? 'KEVIN HIGHLAND'
            : stopNumber === 4
              ? 'AGUILAR DE SORI, ESPERANZA'
              : stopNumber === 5
                ? 'SCOTT OR APRIL FRIEDLE'
                : stopNumber === 6
                  ? 'FedEx Office # 2699'
                : `Customer ${stopNumber}`,
      `${100 + stopNumber} Main St`,
      stopNumber === 4 ? 'APT B' : stopNumber === 10 ? 'Suite 200' : stopNumber === 26 ? 'BLDG C' : '',
      'San Diego',
      'CA',
      stopNumber === 10 ? '92029-4159' : '92101',
      stopNumber === 10 ? 3 : 1,
      `${900000000 + stopNumber}`,
      stopNumber === 25 ? '09:30' : '00:00',
      stopNumber === 25 ? '10:30' : stopNumber === 26 ? '20:00' : '00:00'
    ]);
  }

  stopDetailRows.push([
    10,
    'Pickup',
    'Customer 10',
    '110 Main St',
    'Suite 200',
    'San Diego',
    'CA',
    '92029-4159',
    2,
    0,
    '13:00',
    '14:00'
  ]);

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(headerRows), 'Header');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(stopDetailRows), 'Stop Details');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('parseXLSManifest parses FedEx Combined Manifest metadata and 111 grouped stops', () => {
  const buffer = buildFedExWorkbookBuffer();
  const manifest = parseXLSManifest(buffer);

  assert.equal(manifest.manifest_meta.date, '2026-04-13');
  assert.equal(manifest.manifest_meta.work_area_name, '810');
  assert.equal(manifest.manifest_meta.driver_name, 'Luis Jimenez');
  assert.equal(manifest.manifest_meta.vehicle_number, '402984');
  assert.equal(manifest.manifest_meta.sa_number, '919');
  assert.equal(manifest.manifest_meta.contractor_name, 'Bridge Transportation Inc');
  assert.equal(manifest.stops.length, 111);
});

test('parseXLSManifest groups combined stops and keeps time commit data accurate', () => {
  const buffer = buildFedExWorkbookBuffer();
  const manifest = parseXLSManifest(buffer);

  const combinedStop = manifest.stops.find((stop) => stop.stop_number === 10);
  const deliveryTcStop = manifest.stops.find((stop) => stop.stop_number === 25);
  const closeOnlyTcStop = manifest.stops.find((stop) => stop.stop_number === 26);
  const noTcStop = manifest.stops.find((stop) => stop.stop_number === 1);
  const uppercasePersonStop = manifest.stops.find((stop) => stop.stop_number === 3);
  const commaPersonApartmentStop = manifest.stops.find((stop) => stop.stop_number === 4);
  const sharedFamilyStop = manifest.stops.find((stop) => stop.stop_number === 5);
  const suiteBusinessStop = manifest.stops.find((stop) => stop.stop_number === 10);
  const fedexOfficeStop = manifest.stops.find((stop) => stop.stop_number === 6);

  assert.ok(combinedStop);
  assert.equal(combinedStop.type, 'combined');
  assert.equal(combinedStop.has_delivery, true);
  assert.equal(combinedStop.has_pickup, true);
  assert.equal(combinedStop.package_count, 5);
  assert.equal(combinedStop.address_line2, 'Suite 200');
  assert.equal(combinedStop.postal_code, '92029-4159');
  assert.equal(combinedStop.pickup_ready_time, '13:00');
  assert.equal(combinedStop.pickup_close_time, '14:00');
  assert.equal(combinedStop.has_time_commit, true);

  assert.ok(deliveryTcStop);
  assert.equal(deliveryTcStop.ready_time, '09:30');
  assert.equal(deliveryTcStop.close_time, '10:30');
  assert.equal(deliveryTcStop.has_time_commit, true);

  assert.ok(closeOnlyTcStop);
  assert.equal(closeOnlyTcStop.ready_time, null);
  assert.equal(closeOnlyTcStop.close_time, '20:00');
  assert.equal(closeOnlyTcStop.has_time_commit, true);

  assert.ok(noTcStop);
  assert.equal(noTcStop.ready_time, null);
  assert.equal(noTcStop.close_time, null);
  assert.equal(noTcStop.has_time_commit, false);
  assert.equal(manifest.stops.find((stop) => stop.stop_number === 1)?.is_business, true);
  assert.equal(manifest.stops.find((stop) => stop.stop_number === 2)?.is_business, true);
  assert.equal(uppercasePersonStop?.is_business, false);
  assert.equal(commaPersonApartmentStop?.is_business, false);
  assert.equal(commaPersonApartmentStop?.is_apartment_unit, true);
  assert.equal(commaPersonApartmentStop?.secondary_address_type, 'unit');
  assert.equal(commaPersonApartmentStop?.unit_label, 'B');
  assert.equal(sharedFamilyStop?.is_business, false);
  assert.equal(suiteBusinessStop?.is_business, true);
  assert.equal(suiteBusinessStop?.secondary_address_type, 'suite');
  assert.equal(suiteBusinessStop?.suite_label, '200');
  assert.equal(suiteBusinessStop?.location_type, 'office');
  assert.equal(fedexOfficeStop?.is_business, true);
  assert.equal(fedexOfficeStop?.name, 'FedEx Office # 2699');
  assert.equal(closeOnlyTcStop?.building_label, 'Building C');
});

test('parseXLSManifest skips nonpositive ST numbers and malformed shifted rows', () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Combined Manifest'],
      ['Date', '04/15/2026'],
      ['SA#', '306902'],
      ['WA#', '0828']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['ST#', 'Delivery/Pickup', 'Contact Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', '# Pkgs', 'SID', 'Ready', 'Close'],
      [1, 'Delivery', 'GOOD STOP', '123 Main St', '', 'Escondido', 'CA', '92025', 1, 'SID1', '', ''],
      [0, 'Delivery', 'ADVANCED COMMUNICATION SYSTEMS', '92029', '', '', '', '', 1, '', '', ''],
      [2, 'Delivery', 'ALSO GOOD', '456 Oak Ave', 'STE 100', 'Escondido', 'CA', '92029', 2, 'SID2', '', '17:00']
    ]),
    'Stop Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  assert.equal(manifest.stops.length, 2);
  assert.deepEqual(
    manifest.stops.map((stop) => stop.stop_number),
    [1, 2]
  );
  assert.equal(manifest.stops[1].close_time, '17:00');
  assert.equal(manifest.stops[1].has_time_commit, true);
});

test('detectApartmentUnitStop flags residential units without turning suites into apartments', () => {
  assert.equal(
    detectApartmentUnitStop({
      address_line1: '1314 South Juniper Street',
      address_line2: 'APT A',
      is_business: false
    }),
    true
  );

  assert.equal(
    detectApartmentUnitStop({
      address_line1: '810 East Washington Avenue',
      address_line2: 'UNIT B',
      is_business: false
    }),
    true
  );

  assert.equal(
    detectApartmentUnitStop({
      address_line1: '2125 Citracado Pkwy',
      address_line2: 'STE 100',
      is_business: false
    }),
    false
  );

  assert.equal(
    detectApartmentUnitStop({
      address_line1: '550 East 10th Avenue',
      address_line2: 'APT 1',
      is_business: true
    }),
    false
  );
});

test('detectBusinessContact treats pickups, store numbers, and suites as commercial signals', () => {
  assert.equal(detectBusinessContact('FedEx Office # 2699', '', 'delivery'), true);
  assert.equal(detectBusinessContact('GNC STORE #07309', '', 'delivery'), true);
  assert.equal(detectBusinessContact('Customer Name', 'STE A', 'delivery'), true);
  assert.equal(detectBusinessContact('CHILIS BAR AND GRILL', '', 'delivery'), true);
  assert.equal(detectBusinessContact('VETCO TOTAL CARE 596', '', 'delivery'), true);
  assert.equal(detectBusinessContact('BEST BUY 1712', '', 'delivery'), true);
  assert.equal(detectBusinessContact('THE ELIZABETH HOSPICE - BOOK 3 - JE', 'STE 100', 'delivery'), true);
  assert.equal(detectBusinessContact('PETCO # 596', '', 'delivery'), true);
  assert.equal(detectBusinessContact('Jane Smith', 'Receiving Dock', 'delivery'), true);
  assert.equal(detectBusinessContact('Jane Smith', 'APT 2', 'delivery'), false);
  assert.equal(detectBusinessContact('Pickup Customer', '', 'pickup'), true);
});

test('secondary address parsing and location type inference capture office and floor signals', () => {
  assert.equal(detectSecondaryAddressType('Receiving Dock'), 'business_access');
  assert.equal(detectSecondaryAddressType('FL 2'), 'floor');
  assert.equal(extractFloorLabel('2ND FL'), 'Floor 2');
  assert.equal(extractFloorLabel('Level 3'), 'Floor 3');

  assert.equal(
    inferLocationType({
      contact_name: 'ACME DENTAL',
      address_line2: 'STE 200',
      address: '123 Main St, Escondido, CA',
      is_business: true
    }),
    'office'
  );

  assert.equal(
    inferLocationType({
      contact_name: 'North Warehouse',
      address_line2: 'Receiving Dock',
      address: '500 Industrial Way, Escondido, CA',
      is_business: true
    }),
    'industrial'
  );

  assert.equal(
    inferLocationType({
      contact_name: 'Resident Name',
      address_line2: 'APT 2B',
      address: '100 Main St, Escondido, CA',
      is_business: false
    }),
    'apartment'
  );
});

test('parseGPXManifest remains available as a fallback parser', async () => {
  const manifest = await parseGPXManifest(
    Buffer.from(
      '<?xml version="1.0"?><gpx><wpt lat="32.1" lon="-117.1"><n>123 Main St</n></wpt></gpx>',
      'utf8'
    )
  );

  assert.equal(manifest.stops.length, 1);
  assert.equal(manifest.stops[0].address, '123 Main St');
  assert.equal(manifest.stops[0].type, 'delivery');
});

test('parseGPXManifest extracts route work area and waypoint stop metadata from CPC-style names', async () => {
  const manifest = await parseGPXManifest(
    Buffer.from(
      `<?xml version="1.0"?>
      <gpx>
        <rte>
          <name>WA 0829</name>
          <rtept lon="-117.11" lat="32.11">
            <name>Seq 20:SID 2089:2924 GAIT WAY:Ready 00:00:Close 20:00</name>
          </rtept>
          <rtept lon="-117.12" lat="32.12">
            <name>Seq 2:SID 1010:20785 CAMINO CIELO AZUL:Ready 00:00:Close 00:00</name>
          </rtept>
        </rte>
      </gpx>`,
      'utf8'
    )
  );

  assert.equal(manifest.manifest_meta.work_area_name, '829');
  assert.equal(manifest.stops.length, 2);
  assert.equal(manifest.stops[0].sequence, 2);
  assert.equal(manifest.stops[0].address, '20785 CAMINO CIELO AZUL');
  assert.equal(manifest.stops[0].sid, '1010');
  assert.equal(manifest.stops[0].has_time_commit, false);
  assert.equal(manifest.stops[1].sequence, 20);
  assert.equal(manifest.stops[1].address, '2924 GAIT WAY');
  assert.equal(manifest.stops[1].sid, '2089');
  assert.equal(manifest.stops[1].close_time, '20:00');
  assert.equal(manifest.stops[1].has_time_commit, true);
  assert.equal(manifest.stops[1].name, '2924 GAIT WAY');
});

test('parseGPXManifest supports standard GPX name tags and coordinate attribute order variants', async () => {
  const manifest = await parseGPXManifest(
    Buffer.from(
      `<?xml version="1.0"?>
      <gpx>
        <wpt lon="-117.11" lat="32.11"><name>456 Oak Ave</name></wpt>
        <rte>
          <rtept lat="32.12" lon="-117.12"><desc>789 Pine Rd</desc></rtept>
        </rte>
        <trk>
          <trkseg>
            <trkpt lon="-117.13" lat="32.13"><cmt>101 Maple Dr</cmt></trkpt>
          </trkseg>
        </trk>
      </gpx>`,
      'utf8'
    )
  );

  assert.equal(manifest.stops.length, 3);
  assert.equal(manifest.stops[0].address, '456 Oak Ave');
  assert.equal(manifest.stops[1].address, '789 Pine Rd');
  assert.equal(manifest.stops[2].address, '101 Maple Dr');
  assert.equal(manifest.stops[0].lat, 32.11);
  assert.equal(manifest.stops[0].lng, -117.11);
});

test('parseGPXManifest skips origin coordinates so invalid ocean pins never import as real stops', async () => {
  const manifest = await parseGPXManifest(
    Buffer.from(
      `<?xml version="1.0"?>
      <gpx>
        <wpt lat="0" lon="0"><name>Bad Origin Stop</name></wpt>
        <wpt lat="32.11" lon="-117.11"><name>Good Stop</name></wpt>
      </gpx>`,
      'utf8'
    )
  );

  assert.equal(manifest.stops.length, 1);
  assert.equal(manifest.stops[0].address, 'Good Stop');
  assert.equal(manifest.stops[0].lat, 32.11);
  assert.equal(manifest.stops[0].lng, -117.11);
});

test('detectManifestFormat identifies xls, xlsx, gpx, and unknown files', () => {
  const buffer = Buffer.from('test');

  assert.equal(detectManifestFormat(buffer, 'manifest.xls'), 'xls');
  assert.equal(detectManifestFormat(buffer, 'manifest.xlsx'), 'xls');
  assert.equal(detectManifestFormat(buffer, 'manifest.gpx'), 'gpx');
  assert.equal(detectManifestFormat(buffer, 'manifest.txt'), 'unknown');
});
