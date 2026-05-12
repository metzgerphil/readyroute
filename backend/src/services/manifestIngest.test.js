const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const { createManifestIngestService, __private } = require('./manifestIngest');

function buildManifestBuffer({ date = '04/25/2026' } = {}) {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Page', 'Combined Manifest'],
      ['Date', date],
      ['SA#', '306902'],
      ['WA#', '0817'],
      ['IC/ISP', 'Bridge Transportation Inc']
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
        'Address Line 1',
        'Address Line 2',
        'City',
        'State',
        'Postal Code',
        '# Pkgs',
        'SID'
      ],
      [1, 'Delivery', 'Customer One', '101 Main St', '', 'Escondido', 'CA', '92025', 1, '4000']
    ]),
    'Stop Details'
  );

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('stageManifestArtifacts rejects stale FCC manifests before staging them as the requested day', async () => {
  const service = createManifestIngestService({
    supabase: {
      from() {
        throw new Error('stale FCC manifest should fail before database access');
      }
    }
  });

  await assert.rejects(
    () =>
      service.stageManifestArtifacts({
        accountId: 'acct-1',
        manifestFile: {
          originalname: 'combined-manifest.xlsx',
          buffer: buildManifestBuffer({ date: '04/25/2026' })
        },
        requestedDate: '2026-04-26',
        requestedWorkAreaName: '817',
        source: 'fedex_sync'
      }),
    (error) => {
      assert.equal(error.code, 'STALE_FEDEX_MANIFEST_DATE');
      assert.equal(error.manifestDate, '2026-04-25');
      assert.equal(error.requestedDate, '2026-04-26');
      return true;
    }
  );
});

test('mergePendingManifestStops layers delivery and pickup manifests without dropping existing route detail', () => {
  const merged = __private.mergePendingManifestStops(
    [
      {
        id: 'combined-1',
        sequence: 1,
        stop_number: 1,
        type: 'combined',
        has_delivery: true,
        has_pickup: true,
        address: '111 W WASHINGTON AVE, ESCONDIDO, CA 92025',
        address_line1: '111 W WASHINGTON AVE',
        address_line2: '',
        contact_name: 'WALGREENS 05455',
        sid: '1001',
        package_count: 3,
        delivery_package_count: 2,
        pickup_package_count: 1,
        ready_time: '10:00',
        close_time: '19:00'
      },
      {
        id: 'pickup-only',
        sequence: 2,
        stop_number: 2,
        type: 'pickup',
        has_delivery: false,
        has_pickup: true,
        is_pickup: true,
        address: '341 E PENNSYLVANIA AVE, ESCONDIDO, CA 92025',
        address_line1: '341 E PENNSYLVANIA AVE',
        address_line2: '',
        contact_name: 'JAMES COFFEE COMPANY',
        sid: '0',
        package_count: 1,
        delivery_package_count: 0,
        pickup_package_count: 1
      }
    ],
    [
      {
        sequence: 1,
        stop_number: 1,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '111 W WASHINGTON AVE, ESCONDIDO, CA 92025',
        address_line1: '111 W WASHINGTON AVE',
        address_line2: '',
        contact_name: 'Walgreens Receiver',
        primary_phone: '555-111-2222',
        delivery_instructions: 'Use receiving dock',
        sid: '1001',
        package_count: 2,
        delivery_package_count: 2,
        pickup_package_count: 0,
        packages: [
          {
            tracking_number: '794612345678',
            service_code: 'ISIGNRES',
            requires_signature: true,
            requires_adult_signature: false,
            hazmat: false
          }
        ]
      },
      {
        sequence: 4,
        stop_number: 4,
        type: 'pickup',
        has_delivery: false,
        has_pickup: true,
        is_pickup: true,
        address: '341 E PENNSYLVANIA AVE, ESCONDIDO, CA 92025',
        address_line1: '341 E PENNSYLVANIA AVE',
        address_line2: '',
        contact_name: 'JAMES COFFEE COMPANY',
        sid: '0',
        package_count: 0,
        delivery_package_count: 0,
        pickup_package_count: 0,
        raw_contact_metadata: {
          PUID: '4',
          'PU Closed': '14:02'
        }
      }
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].type, 'combined');
  assert.equal(merged[0].has_delivery, true);
  assert.equal(merged[0].has_pickup, true);
  assert.equal(merged[0].primary_phone, '555-111-2222');
  assert.equal(merged[0].delivery_instructions, 'Use receiving dock');
  assert.equal(merged[0].pickup_package_count, 1);
  assert.equal(merged[0].packages[0].tracking_number, '794612345678');
  assert.equal(merged[1].type, 'pickup');
  assert.equal(merged[1].contact_name, 'JAMES COFFEE COMPANY');
  assert.equal(merged[1].raw_contact_metadata['PU Closed'], '14:02');
});

test('mergePendingManifestStops never turns blank pickup coordinates into origin pins', () => {
  const merged = __private.mergePendingManifestStops(
    [
      {
        id: 'delivery-1',
        sequence: 1,
        stop_number: 1,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '1550 SIMPSON WAY, ESCONDIDO, CA 92029',
        address_line1: '1550 SIMPSON WAY',
        address_line2: '',
        sid: '1001',
        lat: 33.123744,
        lng: -117.111447,
        package_count: 1
      }
    ],
    [
      {
        sequence: 4,
        stop_number: 4,
        type: 'pickup',
        has_delivery: false,
        has_pickup: true,
        is_pickup: true,
        address: '1550 SIMPSON WAY, ESCONDIDO, CA 92029',
        address_line1: '1550 SIMPSON WAY',
        address_line2: '',
        sid: '0',
        lat: null,
        lng: '',
        package_count: 6,
        pickup_package_count: 6
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].type, 'combined');
  assert.equal(merged[0].lat, 33.123744);
  assert.equal(merged[0].lng, -117.111447);
  assert.notEqual(merged[0].lat, 0);
  assert.notEqual(merged[0].lng, 0);
});

test('mergePendingManifestStops matches duplicate SID stops by address instead of collapsing them', () => {
  const merged = __private.mergePendingManifestStops(
    [
      {
        id: 'existing-1',
        sequence: 1,
        stop_number: 1,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '4180 CANYON DE ORO, ENCINITAS, CA 92024',
        address_line1: '4180 CANYON DE ORO',
        sid: '1500',
        package_count: 1
      },
      {
        id: 'existing-2',
        sequence: 2,
        stop_number: 2,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '3086 STARRY NIGHT DR, ESCONDIDO, CA 92029',
        address_line1: '3086 STARRY NIGHT DR',
        sid: '1500',
        package_count: 1
      }
    ],
    [
      {
        sequence: 1,
        stop_number: 1,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '4180 CANYON DE ORO, ENCINITAS, CA 92024',
        address_line1: '4180 CANYON DE ORO',
        sid: '1500',
        primary_phone: '555-111-0001',
        package_count: 1
      },
      {
        sequence: 2,
        stop_number: 2,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '3086 STARRY NIGHT DR, ESCONDIDO, CA 92029',
        address_line1: '3086 STARRY NIGHT DR',
        sid: '1500',
        primary_phone: '555-111-0002',
        package_count: 1
      }
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].address, '4180 CANYON DE ORO, ENCINITAS, CA 92024');
  assert.equal(merged[0].primary_phone, '555-111-0001');
  assert.equal(merged[1].address, '3086 STARRY NIGHT DR, ESCONDIDO, CA 92029');
  assert.equal(merged[1].primary_phone, '555-111-0002');
});

test('mergePendingManifestStops keeps same-street delivery suites separate when SIDs repeat', () => {
  const merged = __private.mergePendingManifestStops(
    [
      {
        id: 'existing-1',
        sequence: 1,
        stop_number: 1,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '124 MARKET PL, ESCONDIDO, CA 92029',
        address_line1: '124 MARKET PL',
        address_line2: null,
        sid: '5006',
        package_count: 1
      },
      {
        id: 'existing-2',
        sequence: 2,
        stop_number: 2,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '124 MARKET PL, STE 400, ESCONDIDO, CA 92029',
        address_line1: '124 MARKET PL',
        address_line2: 'STE 400',
        sid: '5006',
        package_count: 1
      }
    ],
    [
      {
        sequence: 1,
        stop_number: 1,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '124 MARKET PL, ESCONDIDO, CA 92029',
        address_line1: '124 MARKET PL',
        address_line2: null,
        sid: '4597',
        primary_phone: '555-111-0001',
        packages: [{ tracking_number: 'TRACK-1' }],
        package_count: 1
      },
      {
        sequence: 2,
        stop_number: 2,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '124 MARKET PL, STE 400, ESCONDIDO, CA 92029',
        address_line1: '124 MARKET PL',
        address_line2: 'STE 400',
        sid: '5006',
        primary_phone: '555-111-0002',
        packages: [{ tracking_number: 'TRACK-2' }],
        package_count: 1
      }
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].primary_phone, '555-111-0001');
  assert.equal(merged[0].packages[0].tracking_number, 'TRACK-1');
  assert.equal(merged[1].primary_phone, '555-111-0002');
  assert.equal(merged[1].packages[0].tracking_number, 'TRACK-2');
});

test('buildManifestLayers prefers explicit combined delivery pickup layers over legacy file field', () => {
  const legacyFile = { originalname: 'legacy.xls', buffer: Buffer.from('legacy') };
  const combinedFile = { originalname: 'CombinedManifest.xls', buffer: Buffer.from('combined') };
  const deliveryFile = { originalname: 'DeliveryManifest.xls', buffer: Buffer.from('delivery') };
  const pickupFile = { originalname: 'PickupManifest.xls', buffer: Buffer.from('pickup') };
  const combinedGpxFile = { originalname: 'CombinedManifest.gpx', buffer: Buffer.from('gpx') };

  const layers = __private.buildManifestLayers({
    manifestFile: legacyFile,
    combinedManifestFile: combinedFile,
    combinedGpxFile,
    deliveryManifestFile: deliveryFile,
    pickupManifestFile: pickupFile
  });

  assert.deepEqual(layers.map((layer) => layer.key), ['combined', 'delivery', 'pickup']);
  assert.equal(layers[0].file, combinedFile);
  assert.equal(layers[0].companionGpxFile, combinedGpxFile);
  assert.equal(layers[1].file, deliveryFile);
  assert.equal(layers[2].file, pickupFile);
});

test('mergeParsedManifestLayers summarizes layered contact package and service detail', () => {
  const merged = __private.mergeParsedManifestLayers([
    {
      key: 'combined',
      label: 'Combined manifest',
      format: 'xls',
      file: { originalname: 'CombinedManifest.xls' },
      stops: [
        {
          sequence: 1,
          stop_number: 1,
          type: 'delivery',
          has_delivery: true,
          address: '101 MAIN ST, ESCONDIDO, CA 92025',
          address_line1: '101 MAIN ST',
          sid: '1001',
          package_count: 1
        }
      ],
      manifest_meta: { date: '2026-05-11', work_area_name: '829' }
    },
    {
      key: 'delivery',
      label: 'Delivery manifest',
      format: 'xls',
      file: { originalname: 'DeliveryManifest.xls' },
      stops: [
        {
          sequence: 1,
          stop_number: 1,
          type: 'delivery',
          has_delivery: true,
          address: '101 MAIN ST, ESCONDIDO, CA 92025',
          address_line1: '101 MAIN ST',
          sid: '1001',
          primary_phone: '555-111-2222',
          delivery_instructions: 'Ring bell',
          package_count: 1,
          packages: [{ tracking_number: 'TRACK-101', service_code: 'PRM' }]
        }
      ],
      manifest_meta: { date: '2026-05-11', work_area_name: '829' }
    }
  ]);

  assert.equal(merged.manifestFormat, 'xls');
  assert.equal(merged.parsedStops.length, 1);
  assert.equal(merged.parsedStops[0].primary_phone, '555-111-2222');
  assert.equal(merged.parsedStops[0].delivery_instructions, 'Ring bell');
  assert.equal(merged.parsedStops[0].packages[0].tracking_number, 'TRACK-101');
  assert.equal(merged.manifestLayerSummary.length, 2);
  assert.equal(merged.manifestLayerSummary[1].contact_stop_count, 1);
  assert.equal(merged.manifestLayerSummary[1].explicit_package_count, 1);
  assert.equal(merged.manifestLayerSummary[1].service_code_count, 1);
});

test('validateManifestPackageTracking blocks duplicate package tracking before route mutation', () => {
  assert.throws(
    () => __private.validateManifestPackageTracking([
      {
        sequence: 1,
        packages: [{ tracking_number: 'TRACK-DUP' }]
      },
      {
        sequence: 2,
        packages: [{ tracking_number: 'TRACK-DUP' }]
      }
    ]),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.match(error.message, /duplicate package tracking/i);
      assert.equal(error.duplicate_packages[0].tracking_number, 'TRACK-DUP');
      return true;
    }
  );
});
