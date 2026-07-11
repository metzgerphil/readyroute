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
  inferLocationType,
  normalizeManifestStopType
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

function buildContactFixtureWorkbookBuffer(rows) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Combined Manifest'],
      ['Date', '04/13/2026'],
      ['WA#', '0810']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'ST#',
        'Delivery/Pickup',
        'Contact Name',
        'Recipient',
        'Customer',
        'Business Name',
        'Company Name',
        'Phone',
        'Telephone',
        'Alternate Phone',
        'Email Address',
        'Customer Instructions',
        'Delivery Instructions',
        'Consignee',
        'Shipper',
        'Address Line 1',
        'Address Line 2',
        'City',
        'State',
        'Postal Code',
        '# Pkgs',
        'SID'
      ],
      ...rows
    ]),
    'Stop Details'
  );

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

test('parseXLSManifest preserves optional customer contact fields from flexible headers', () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Combined Manifest'],
      ['Date', '04/13/2026'],
      ['WA#', '0810']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'ST#',
        'Delivery/Pickup',
        'Recipient Name',
        'Business Name',
        'Company Name',
        'Phone',
        'Alternate Phone',
        'Email Address',
        'Delivery Instructions',
        'Customer Instructions',
        'Consignee',
        'Shipper',
        'Contact Preference',
        'Address Line 1',
        'Address Line 2',
        'City',
        'State',
        'Postal Code',
        '# Pkgs',
        'SID',
        'Ready',
        'Close'
      ],
      [
        1,
        'Delivery',
        'Acme Receiving',
        'Acme Warehouse',
        'Acme Corp',
        '(555) 111-2222 ext. 9',
        '555.222.3333',
        'dock@example.com',
        'Use rear dock',
        'Call before delivery',
        'Acme Logistics',
        'Sender Co',
        'Text first',
        '123 Main St',
        'Suite 200',
        'San Diego',
        'CA',
        '92029',
        2,
        'SID123',
        '',
        ''
      ]
    ]),
    'Stop Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const stop = manifest.stops[0];

  assert.equal(stop.contact_name, 'Acme Receiving');
  assert.equal(stop.business_name, 'Acme Warehouse');
  assert.equal(stop.company_name, 'Acme Corp');
  assert.equal(stop.primary_phone, '(555) 111-2222 ext. 9');
  assert.equal(stop.alternate_phone, '555.222.3333');
  assert.equal(stop.email, 'dock@example.com');
  assert.equal(stop.delivery_instructions, 'Use rear dock');
  assert.equal(stop.customer_instructions, 'Call before delivery');
  assert.equal(stop.consignee, 'Acme Logistics');
  assert.equal(stop.shipper, 'Sender Co');
  assert.equal(stop.contact_source, 'manifest');
  assert.deepEqual(stop.raw_contact_metadata, {
    'Contact Preference': 'Text first'
  });
});

test('parseXLSManifest parses FedEx Delivery Manifest stop and package detail tabs', () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Delivery Manifest'],
      ['Date', '05/11/2026'],
      ['WA#', '828 BRIDGE 01 - EOD'],
      ['IC/ISP', 'Bridge Transportation Inc'],
      ['Driver', 'CHAVEZ,MARCO ANTONIO'],
      ['Vehicle #', '538765']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'ST#',
        'SID',
        '# Pkgs',
        'Recipient',
        'Contact Name',
        'Address Line 1',
        'Address Line 2',
        'City',
        'State',
        'Postal Code',
        'Stop Instructions',
        'Phone',
        'Completed',
        'DeliveryTimeBegin',
        'DeliveryTimeEnd'
      ],
      [
        1,
        '1001',
        2,
        'Gloria Claudat',
        '',
        '19752 Mount Israel Pl',
        '',
        'Escondido',
        'CA',
        '92029',
        'FRONT DOOR:please deliver Friday',
        '555-111-5913',
        'N',
        '10:00',
        '12:00'
      ]
    ]),
    'Stop Details'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['ST#', 'SID', 'Recipient', 'Contact Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', 'Track ID', 'Prem Svc'],
      [1, '1001', 'Gloria Claudat', '', '19752 Mount Israel Pl', '', 'Escondido', 'CA', '92029', '794612345678', 'ISIGNRES'],
      [1, '1001', 'Gloria Claudat', '', '19752 Mount Israel Pl', '', 'Escondido', 'CA', '92029', '794612345679', 'RES']
    ]),
    'Package Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const [stop] = manifest.stops;

  assert.equal(manifest.manifest_meta.work_area_name, '828');
  assert.equal(manifest.manifest_meta.driver_name, 'Marco Antonio Chavez');
  assert.equal(stop.type, 'delivery');
  assert.equal(stop.contact_name, 'Gloria Claudat');
  assert.equal(stop.primary_phone, '555-111-5913');
  assert.equal(stop.delivery_instructions, 'FRONT DOOR:please deliver Friday');
  assert.equal(stop.ready_time, '10:00');
  assert.equal(stop.close_time, '12:00');
  assert.equal(stop.package_count, 2);
  assert.deepEqual(stop.packages, [
    {
      tracking_number: '794612345678',
      service_code: 'ISIGNRES',
      hazmat: false
    },
    {
      tracking_number: '794612345679',
      service_code: 'RES',
      hazmat: false
    }
  ]);
});

test('parseXLSManifest parses FedEx Pickup Manifest pickup rows as pickup stops', () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Pickup Manifest'],
      ['Date', '05/11/2026'],
      ['SA#', '306902'],
      ['WA#', '0840'],
      ['IC/ISP', 'Bridge Transportation Inc'],
      ['Driver', 'morales,miguel eduar']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['PU List', 'Station', 'WA', 'PUID', 'Type', '# Pkgs', 'Shipper #', 'Shipper Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', 'Origin Station & WA#', 'Ready', 'Close', 'PU Closed', 'Reas Code', 'Pkgs Picked Up'],
      ['64325', '919', '0840', '4', 'SCH', '0', '5153213', 'JAMES COFFEE COMPANY', '341-343 E PENNSYLVANIA AVE', 'Back', 'ESCONDIDO', 'CA', '92025', '', '14:00', '15:00', '14:02', '', '0'],
      ['64325', '919', '0840', '8', 'AUT', '0', '348310', 'DISCOUNT TIRE CAS 0', '550 N BROADWAY', '', 'ESCONDIDO', 'CA', '92025', '', '15:00', '17:00', '', "909-CANCELLED SCH P/U-DON'T PICKUP", '0']
    ]),
    'Stop Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  assert.equal(manifest.manifest_meta.work_area_name, '840');
  assert.equal(manifest.manifest_meta.driver_name, 'Miguel Eduar Morales');
  assert.equal(manifest.stops.length, 2);
  assert.equal(manifest.stops[0].type, 'pickup');
  assert.equal(manifest.stops[0].has_pickup, true);
  assert.equal(manifest.stops[0].has_delivery, false);
  assert.equal(manifest.stops[0].contact_name, 'JAMES COFFEE COMPANY');
  assert.equal(manifest.stops[0].business_name, 'JAMES COFFEE COMPANY');
  assert.equal(manifest.stops[0].shipper, 'JAMES COFFEE COMPANY');
  assert.equal(manifest.stops[0].address_line2, 'Back');
  assert.equal(manifest.stops[0].ready_time, '14:00');
  assert.equal(manifest.stops[0].close_time, '15:00');
  assert.equal(manifest.stops[0].pickup_package_count, 0);
  assert.deepEqual(manifest.stops[0].raw_contact_metadata, {
    'PU List': '64325',
    Station: '919',
    WA: '0840',
    PUID: '4',
    Type: 'SCH',
    'Shipper #': '5153213',
    'PU Closed': '14:02',
    'Pkgs Picked Up': '0'
  });
  assert.equal(manifest.stops[1].raw_contact_metadata['Reas Code'], "909-CANCELLED SCH P/U-DON'T PICKUP");
});

test('parseXLSManifest handles customer contact fixture variants without inventing blanks', () => {
  const manifest = parseXLSManifest(
    buildContactFixtureWorkbookBuffer([
      [1, 'Delivery', 'Contact Only', '', '', '', '', '', '', '', '', '', '', '', '', '101 A St', '', 'San Diego', 'CA', '92101', 1, 'SID1'],
      [2, 'Delivery', 'Phone Customer', '', '', '', '', '555-111-2222', '', '', '', '', '', '', '', '102 B St', '', 'San Diego', 'CA', '92101', 1, 'SID2'],
      [3, 'Delivery', 'Two Phone Customer', '', '', '', '', '555-111-3333', '', '555-222-3333', '', '', '', '', '', '103 C St', '', 'San Diego', 'CA', '92101', 1, 'SID3'],
      [4, 'Delivery', '', '', '', 'Business Co', '', '', '', '', '', '', '', '', '', '104 D St', '', 'San Diego', 'CA', '92101', 1, 'SID4'],
      [5, 'Delivery', '', '', '', '', 'Company LLC', '', '', '', '', '', '', '', '', '105 E St', '', 'San Diego', 'CA', '92101', 1, 'SID5'],
      [6, 'Delivery', 'Email Customer', '', '', '', '', '', '', '', 'email@example.com', '', '', '', '', '106 F St', '', 'San Diego', 'CA', '92101', 1, 'SID6'],
      [7, 'Delivery', 'Instruction Customer', '', '', '', '', '', '', '', '', 'Call on arrival', '', '', '', '107 G St', '', 'San Diego', 'CA', '92101', 1, 'SID7'],
      [8, 'Delivery', 'Delivery Instruction Customer', '', '', '', '', '', '', '', '', '', 'Use rear dock', '', '', '108 H St', '', 'San Diego', 'CA', '92101', 1, 'SID8'],
      [9, 'Delivery', '', '', '', '', '', '', '', '', '', '', '', '', '', '109 I St', '', 'San Diego', 'CA', '92101', 1, 'SID9'],
      [10, 'Delivery', '', 'Recipient Alias', '', '', '', '', '(555) 444.5555 x12', '', '', '', '', '', '', '110 J St', '', 'San Diego', 'CA', '92101', 1, 'SID10'],
      [11, 'Delivery', '', '', '', '', '', '', '', '', '', '', '', 'Consignee Contact', 'Shipper Contact', '111 K St', '', 'San Diego', 'CA', '92101', 1, 'SID11']
    ])
  );

  const stopsBySequence = new Map(manifest.stops.map((stop) => [stop.sequence, stop]));

  assert.equal(stopsBySequence.get(1).contact_name, 'Contact Only');
  assert.equal(stopsBySequence.get(1).contact_source, 'manifest');
  assert.equal(stopsBySequence.get(2).primary_phone, '555-111-2222');
  assert.equal(stopsBySequence.get(3).alternate_phone, '555-222-3333');
  assert.equal(stopsBySequence.get(4).business_name, 'Business Co');
  assert.equal(stopsBySequence.get(5).company_name, 'Company LLC');
  assert.equal(stopsBySequence.get(6).email, 'email@example.com');
  assert.equal(stopsBySequence.get(7).customer_instructions, 'Call on arrival');
  assert.equal(stopsBySequence.get(8).delivery_instructions, 'Use rear dock');
  assert.equal(stopsBySequence.get(9).contact_name, null);
  assert.equal(stopsBySequence.get(9).primary_phone, null);
  assert.equal(stopsBySequence.get(9).contact_source, null);
  assert.equal(stopsBySequence.get(10).contact_name, 'Recipient Alias');
  assert.equal(stopsBySequence.get(10).primary_phone, '(555) 444.5555 x12');
  assert.equal(stopsBySequence.get(11).contact_name, 'Consignee Contact');
  assert.equal(stopsBySequence.get(11).shipper, 'Shipper Contact');
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

test('parseXLSManifest treats explicit pickup service codes as pickup stops', () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Combined Manifest'],
      ['Date', '04/13/2026'],
      ['WA#', '0810'],
      ['Driver', 'JIMENEZ,LUIS']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['ST#', 'Service Type', 'Contact Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', '# Pkgs', 'SID', 'Ready', 'Close'],
      [1, 'Delivery', 'GOOD STOP', '123 Main St', '', 'Escondido', 'CA', '92025', 1, 'SID1', '', ''],
      [2, 'PUX', 'PICKUP CUSTOMER', '456 Oak Ave', 'Dock 2', 'Escondido', 'CA', '92029', 3, '', '13:00', '15:00']
    ]),
    'Stop Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const pickupStop = manifest.stops.find((stop) => stop.stop_number === 2);

  assert.equal(normalizeManifestStopType('PUX'), 'pickup');
  assert.equal(normalizeManifestStopType('Scheduled Pickup'), 'pickup');
  assert.equal(manifest.stops.length, 2);
  assert.equal(pickupStop.type, 'pickup');
  assert.equal(pickupStop.has_pickup, true);
  assert.equal(pickupStop.has_delivery, false);
  assert.equal(pickupStop.is_pickup, true);
  assert.equal(pickupStop.pickup_ready_time, '13:00');
  assert.equal(pickupStop.pickup_close_time, '15:00');
});

test('parseXLSManifest preserves valid zero-number rows and still skips malformed shifted rows', () => {
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
      [0, 'Delivery', 'STARBUCKS', '351 W Felicita Ave', '', 'Escondido', 'CA', '92025-6515', 1, 'SID10', '', ''],
      [0, 'Delivery', 'VONS', '351 W Felicita Ave', '', 'Escondido', 'CA', '92025-6515', 4, 'SID11', '', ''],
      [0, 'Pickup', 'STARBUCKS', '351 W Felicita Ave', '', 'Escondido', 'CA', '92025-6515', 1, '', '13:00', '14:00'],
      [0, 'Delivery', 'ADVANCED COMMUNICATION SYSTEMS', '92029', '', '', '', '', 1, '', '', ''],
      [2, 'Delivery', 'ALSO GOOD', '456 Oak Ave', 'STE 100', 'Escondido', 'CA', '92029', 2, 'SID2', '', '17:00']
    ]),
    'Stop Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));

  assert.equal(manifest.stops.length, 4);
  assert.deepEqual(
    manifest.stops.map((stop) => stop.sequence),
    [1, 100001, 2, 100002]
  );
  assert.equal(manifest.stops[1].type, 'combined');
  assert.equal(manifest.stops[1].address, '351 W Felicita Ave, Escondido, CA 92025-6515');
  assert.equal(manifest.stops[1].pickup_ready_time, '13:00');
  assert.equal(manifest.stops[1].pickup_close_time, '14:00');
  assert.equal(manifest.stops[2].close_time, '17:00');
  assert.equal(manifest.stops[2].has_time_commit, true);
});

test('parseXLSManifest normalizes suspicious 02:00-04:00 business delivery windows to 14:00-16:00', () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Combined Manifest'],
      ['Date', '04/23/2026'],
      ['SA#', '306902'],
      ['WA#', '0810']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['ST#', 'Delivery/Pickup', 'Contact Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', '# Pkgs', 'SID', 'Ready', 'Close'],
      [56, 'Delivery', 'BEARCOM', '2229 ENTERPRISE ST', '', 'Escondido', 'CA', '92029-2073', 1, '3061', '02:00', '04:00'],
      [57, 'Delivery', 'Jane Smith', '123 Main St', 'APT A', 'Escondido', 'CA', '92029', 1, '3062', '02:00', '04:00']
    ]),
    'Stop Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const businessStop = manifest.stops.find((stop) => stop.stop_number === 56);
  const residentialStop = manifest.stops.find((stop) => stop.stop_number === 57);

  assert.equal(businessStop.ready_time, '14:00');
  assert.equal(businessStop.close_time, '16:00');
  assert.equal(residentialStop.ready_time, '02:00');
  assert.equal(residentialStop.close_time, '04:00');
});

test('parseXLSManifest normalizes suspicious 02:00-04:00 business delivery windows to 14:00-16:00', () => {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Combined Manifest'],
      ['Date', '04/23/2026'],
      ['SA#', '306902'],
      ['WA#', '0810']
    ]),
    'Header'
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['ST#', 'Delivery/Pickup', 'Contact Name', 'Address Line 1', 'Address Line 2', 'City', 'State', 'Postal Code', '# Pkgs', 'SID', 'Ready', 'Close'],
      [56, 'Delivery', 'BEARCOM', '2229 ENTERPRISE ST', '', 'Escondido', 'CA', '92029-2073', 1, '3061', '02:00', '04:00'],
      [57, 'Delivery', 'Jane Smith', '123 Main St', 'APT A', 'Escondido', 'CA', '92029', 1, '3062', '02:00', '04:00']
    ]),
    'Stop Details'
  );

  const manifest = parseXLSManifest(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  const businessStop = manifest.stops.find((stop) => stop.stop_number === 56);
  const residentialStop = manifest.stops.find((stop) => stop.stop_number === 57);

  assert.equal(businessStop.ready_time, '14:00');
  assert.equal(businessStop.close_time, '16:00');
  assert.equal(residentialStop.ready_time, '02:00');
  assert.equal(residentialStop.close_time, '04:00');
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

test('parseGPXManifest supports Delivery Manifest GPX delivery time labels', async () => {
  const manifest = await parseGPXManifest(
    Buffer.from(
      `<?xml version="1.0"?>
      <gpx>
        <rte>
          <name>WA 0828</name>
          <rtept lon="-117.13" lat="33.06">
            <name>Seq 1:SID 1001:19752 MOUNT ISRAEL PL:DeliveryTimeBegin 10:00:DeliveryTimeEnd 12:00</name>
          </rtept>
        </rte>
      </gpx>`,
      'utf8'
    )
  );

  assert.equal(manifest.manifest_meta.work_area_name, '828');
  assert.equal(manifest.stops.length, 1);
  assert.equal(manifest.stops[0].sequence, 1);
  assert.equal(manifest.stops[0].address, '19752 MOUNT ISRAEL PL');
  assert.equal(manifest.stops[0].ready_time, '10:00');
  assert.equal(manifest.stops[0].close_time, '12:00');
  assert.equal(manifest.stops[0].has_time_commit, true);
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
