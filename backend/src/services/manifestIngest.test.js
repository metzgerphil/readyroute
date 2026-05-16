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

class QueryStub {
  constructor(table, handler) {
    this.table = table;
    this.handler = handler;
    this.operation = null;
    this.payload = null;
    this.filters = [];
  }

  select(columns) {
    this.operation = 'select';
    this.columns = columns;
    return this;
  }

  insert(payload) {
    this.operation = 'insert';
    this.payload = payload;
    return this.handler(this);
  }

  eq(column, value) {
    this.filters.push({ type: 'eq', column, value });
    return this;
  }

  is(column, value) {
    this.filters.push({ type: 'is', column, value });
    return this;
  }

  in(column, value) {
    this.filters.push({ type: 'in', column, value });
    return this;
  }

  order(column, options) {
    this.orderBy = { column, options };
    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.handler(this)).then(resolve, reject);
  }
}

function createSupabaseStub(handler) {
  return {
    from(table) {
      return new QueryStub(table, handler);
    }
  };
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

test('stageManifestArtifacts does not mutate a dispatched driver route on later sync', async () => {
  const events = [];
  const writes = [];
  const service = createManifestIngestService({
    now: () => new Date('2026-04-25T16:00:00.000Z'),
    supabase: createSupabaseStub((query) => {
      if (query.table === 'location_corrections' && query.operation === 'select') {
        return { data: [], error: null };
      }

      if (query.table === 'routes' && query.operation === 'select') {
        return {
          data: [
            {
              id: 'route-live-817',
              work_area_name: '817',
              status: 'pending',
              dispatch_state: 'dispatched',
              dispatched_at: '2026-04-25T15:30:00.000Z',
              dispatched_by_manager_user_id: 'manager-1',
              completed_stops: 0,
              completed_at: null,
              driver_id: 'driver-1',
              vehicle_id: 'vehicle-1',
              manifest_fingerprint: 'previous-live-fingerprint',
              last_manifest_change_at: '2026-04-25T15:00:00.000Z'
            }
          ],
          error: null
        };
      }

      if (query.table === 'route_sync_events' && query.operation === 'insert') {
        events.push(query.payload);
        return { data: null, error: null };
      }

      writes.push(`${query.table}:${query.operation}`);
      throw new Error(`Unexpected query ${query.table}:${query.operation}`);
    })
  });

  const result = await service.stageManifestArtifacts({
    accountId: 'acct-1',
    managerUserId: 'manager-1',
    manifestFile: {
      originalname: 'combined-manifest.xlsx',
      buffer: buildManifestBuffer({ date: '04/25/2026' })
    },
    requestedDate: '2026-04-25',
    requestedWorkAreaName: '817',
    source: 'manifest_upload'
  });

  assert.equal(result.route_id, 'route-live-817');
  assert.equal(result.live_route_protected, true);
  assert.equal(result.driver_route_unchanged, true);
  assert.equal(result.post_dispatch_change_held, true);
  assert.equal(result.sync_state, 'changed_after_dispatch');
  assert.deepEqual(writes, []);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'post_dispatch_change');
  assert.equal(events[0].details.driver_route_unchanged, true);
  assert.equal(events[0].details.live_route_protected, true);
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

test('mergePendingManifestStops keeps same-address pickup and delivery rows from duplicating package detail', () => {
  const merged = __private.mergePendingManifestStops(
    [
      {
        id: 'pickup-row',
        sequence: 1,
        stop_number: 1,
        type: 'pickup',
        has_delivery: false,
        has_pickup: true,
        is_pickup: true,
        address: '230 MARKET PL, ESCONDIDO, CA 92029',
        address_line1: '230 MARKET PL',
        address_line2: '',
        sid: '0',
        contact_name: 'ACTION MAIL',
        package_count: 1,
        pickup_package_count: 1
      },
      {
        id: 'delivery-row',
        sequence: 2,
        stop_number: 2,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        is_pickup: false,
        address: '230 MARKET PL, ESCONDIDO, CA 92029',
        address_line1: '230 MARKET PL',
        address_line2: '',
        sid: '8095',
        contact_name: 'ACTION MAIL',
        package_count: 3,
        delivery_package_count: 3
      }
    ],
    [
      {
        sequence: 2,
        stop_number: 2,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        is_pickup: false,
        address: '230 MARKET PL, ESCONDIDO, CA 92029',
        address_line1: '230 MARKET PL',
        address_line2: '',
        sid: '8095',
        contact_name: 'ERIN ALONSO',
        package_count: 3,
        delivery_package_count: 3,
        packages: [
          { tracking_number: '517460036794' },
          { tracking_number: '517460036809' },
          { tracking_number: '797973590997' }
        ]
      }
    ]
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].type, 'pickup');
  assert.equal(merged[0].packages?.length || 0, 0);
  assert.equal(merged[1].type, 'delivery');
  assert.equal(merged[1].packages.length, 3);
  assert.deepEqual(merged[1].packages.map((pkg) => pkg.tracking_number), [
    '517460036794',
    '517460036809',
    '797973590997'
  ]);
});

test('mergePendingManifestStops treats repeated package tracking as a merge key across manifest layers', () => {
  const merged = __private.mergePendingManifestStops(
    [
      {
        sequence: 1,
        stop_number: 1,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '500 W GRAND AVE, ESCONDIDO, CA 92025',
        address_line1: '500 W GRAND AVE',
        address_line2: 'STE 100',
        sid: '1001',
        contact_name: 'Combined Name',
        package_count: 2,
        packages: [
          { tracking_number: 'TRACK-SHARED-1' },
          { tracking_number: 'TRACK-ONLY-COMBINED' }
        ]
      }
    ],
    [
      {
        sequence: 8,
        stop_number: 8,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '500 GRAND AVENUE, ESCONDIDO, CA 92025',
        address_line1: '500 GRAND AVENUE',
        address_line2: 'SUITE 100',
        sid: '2002',
        primary_phone: '555-222-3333',
        delivery_instructions: 'Leave at receiving',
        package_count: 2,
        packages: [
          { tracking_number: 'TRACK-SHARED-1', service_code: 'PRM' },
          { tracking_number: 'TRACK-ONLY-DELIVERY' }
        ]
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].primary_phone, '555-222-3333');
  assert.equal(merged[0].delivery_instructions, 'Leave at receiving');
  assert.deepEqual(merged[0].packages.map((pkg) => pkg.tracking_number), [
    'TRACK-SHARED-1',
    'TRACK-ONLY-COMBINED',
    'TRACK-ONLY-DELIVERY'
  ]);
  assert.doesNotThrow(() => __private.validateManifestPackageTracking(merged));
});

test('mergePendingManifestStops collapses final same-package stops before duplicate validation', () => {
  const merged = __private.mergePendingManifestStops(
    [],
    [
      {
        sequence: 15,
        stop_number: 15,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '1200 INDUSTRIAL RD, ESCONDIDO, CA 92029',
        address_line1: '1200 INDUSTRIAL RD',
        address_line2: 'BLDG A',
        sid: '7001',
        contact_name: 'Combined Stop',
        package_count: 2,
        packages: [
          { tracking_number: '520577567688' },
          { tracking_number: '482034495103' }
        ]
      },
      {
        sequence: 16,
        stop_number: 16,
        type: 'delivery',
        has_delivery: true,
        has_pickup: false,
        address: '1200 INDUSTRIAL ROAD, ESCONDIDO, CA 92029',
        address_line1: '1200 INDUSTRIAL ROAD',
        address_line2: '',
        sid: '8002',
        primary_phone: '555-444-1212',
        delivery_instructions: 'Use north dock',
        package_count: 2,
        packages: [
          { tracking_number: '520577567688', service_code: 'PRM' },
          { tracking_number: '482034495103' }
        ]
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].sequence, 1);
  assert.equal(merged[0].primary_phone, '555-444-1212');
  assert.equal(merged[0].delivery_instructions, 'Use north dock');
  assert.deepEqual(merged[0].packages.map((pkg) => pkg.tracking_number), [
    '520577567688',
    '482034495103'
  ]);
  assert.doesNotThrow(() => __private.validateManifestPackageTracking(merged));
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

test('applyManifestRouteAtomically calls the database transaction RPC with staged stops and packages', async () => {
  let rpcCall = null;
  const supabase = {
    rpc: async (name, params) => {
      rpcCall = { name, params };
      return {
        data: {
          route_id: 'route-atomic-1',
          stop_ids: [{ sequence_order: 1, id: 'stop-atomic-1' }]
        },
        error: null
      };
    }
  };

  const result = await __private.applyManifestRouteAtomically({
    supabase,
    routeId: 'route-atomic-1',
    accountId: 'acct-1',
    existingRoute: { id: 'route-atomic-1' },
    mergedIntoExistingRoute: true,
    routePayload: { work_area_name: '829' },
    stopInsertPayload: [{ sequence_order: 1, address: '101 Main St' }],
    packageInsertPayload: [{ route_stop_sequence: 1, tracking_number: 'TRACK-1' }]
  });

  assert.equal(rpcCall.name, 'replace_manifest_route_atomic');
  assert.equal(rpcCall.params.p_replace_existing, true);
  assert.equal(rpcCall.params.p_existing_route_id, 'route-atomic-1');
  assert.deepEqual(rpcCall.params.p_packages, [{ route_stop_sequence: 1, tracking_number: 'TRACK-1' }]);
  assert.equal(result.appliedAtomically, true);
  assert.equal(result.insertedStops[0].id, 'stop-atomic-1');
});

test('applyManifestRouteAtomically falls back when the transaction RPC migration is missing', async () => {
  const supabase = {
    rpc: async () => ({
      data: null,
      error: {
        message: 'Could not find the function public.replace_manifest_route_atomic in the schema cache'
      }
    })
  };

  const result = await __private.applyManifestRouteAtomically({
    supabase,
    routeId: 'route-1',
    accountId: 'acct-1',
    existingRoute: null,
    mergedIntoExistingRoute: false,
    routePayload: {},
    stopInsertPayload: [],
    packageInsertPayload: []
  });

  assert.equal(result, null);
});
