const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeManifestStops, normalizeMergedStopSequences } = require('./manifestMerge');

test('mergeManifestStops merges by SID and address without requiring sequence alignment', () => {
  const merged = mergeManifestStops(
    [
      {
        sequence: 1,
        sid: 'SID123',
        address_line1: '123 Main St',
        address: '123 Main St, San Diego, CA 92029',
        lat: null,
        lng: null
      },
      {
        sequence: 2,
        sid: '',
        address_line1: '456 Market St',
        address: '456 Market St, San Diego, CA 92101',
        lat: null,
        lng: null
      }
    ],
    [
      {
        sequence: 9,
        sid: 'SID123',
        address_line1: '123 Main St',
        address: '123 Main St',
        lat: 33.1,
        lng: -117.2,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      },
      {
        sequence: 12,
        sid: '',
        address_line1: '456 Market St',
        address: '456 Market St',
        lat: 33.2,
        lng: -117.3,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      }
    ]
  );

  assert.equal(merged[0].lat, 33.1);
  assert.equal(merged[0].lng, -117.2);
  assert.equal(merged[1].lat, 33.2);
  assert.equal(merged[1].lng, -117.3);
});

test('mergeManifestStops preserves contact fields and does not overwrite them with GPX blanks', () => {
  const merged = mergeManifestStops(
    [
      {
        sequence: 1,
        sid: 'SID123',
        address_line1: '123 Main St',
        address: '123 Main St, San Diego, CA 92029',
        contact_name: 'Acme Receiving',
        primary_phone: '(555) 111-2222 ext. 9',
        email: 'dock@example.com',
        delivery_instructions: 'Use rear dock',
        raw_contact_metadata: {
          'Contact Preference': 'Text first'
        },
        lat: null,
        lng: null
      }
    ],
    [
      {
        sequence: 1,
        sid: 'SID123',
        address_line1: '123 Main St',
        address: '123 Main St',
        contact_name: '',
        primary_phone: '',
        email: '',
        raw_contact_metadata: {
          'Warehouse Contact': 'Dock office'
        },
        lat: 33.1,
        lng: -117.2,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      }
    ]
  );

  assert.equal(merged[0].lat, 33.1);
  assert.equal(merged[0].contact_name, 'Acme Receiving');
  assert.equal(merged[0].primary_phone, '(555) 111-2222 ext. 9');
  assert.equal(merged[0].email, 'dock@example.com');
  assert.equal(merged[0].delivery_instructions, 'Use rear dock');
  assert.deepEqual(merged[0].raw_contact_metadata, {
    'Warehouse Contact': 'Dock office',
    'Contact Preference': 'Text first'
  });
});

test('mergeManifestStops does not force sequence-based merges when GPX and XLS are misaligned', () => {
  const merged = mergeManifestStops(
    [
      {
        sequence: 1,
        sid: '1500',
        address_line1: '1741 W 9TH AVE',
        address: '1741 W 9TH AVE, ESCONDIDO, CA 92029-2104',
        contact_name: 'NIURKA ULLOA',
        lat: null,
        lng: null
      },
      {
        sequence: 2,
        sid: '1501',
        address_line1: '1354 W VALLEY PKWY',
        address: '1354 W VALLEY PKWY, ESCONDIDO, CA 92029',
        lat: null,
        lng: null
      }
    ],
    [
      {
        sequence: 1,
        sid: '1060',
        address_line1: '9908 DEL DIOS HWY',
        address: '9908 DEL DIOS HWY',
        lat: 33.06,
        lng: -117.12,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      },
      {
        sequence: 2,
        sid: '1061',
        address_line1: '20310 DATE LN',
        address: '20310 DATE LN',
        lat: 33.07,
        lng: -117.11,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      }
    ]
  );

  assert.equal(merged[0].lat, null);
  assert.equal(merged[0].lng, null);
  assert.equal(merged[1].lat, null);
  assert.equal(merged[1].lng, null);
  assert.equal(merged[0].contact_name, 'NIURKA ULLOA');
});

test('mergeManifestStops replaces synthetic XLS sequence values with GPX sequence when matched', () => {
  const merged = mergeManifestStops(
    [
      {
        sequence: 100001,
        stop_number: 100001,
        uses_synthetic_sequence: true,
        sid: 'SID123',
        address_line1: '123 Main St',
        address: '123 Main St, San Diego, CA 92029',
        lat: null,
        lng: null
      }
    ],
    [
      {
        sequence: 27,
        sid: 'SID123',
        address_line1: '123 Main St',
        address: '123 Main St',
        lat: 33.1,
        lng: -117.2,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      }
    ]
  );

  assert.equal(merged[0].sequence, 27);
  assert.equal(merged[0].stop_number, 27);
  assert.equal(merged[0].uses_synthetic_sequence, false);
  assert.equal(merged[0].lat, 33.1);
  assert.equal(merged[0].lng, -117.2);
});

test('mergeManifestStops ignores placeholder SID values and falls back to address matching', () => {
  const merged = mergeManifestStops(
    [
      {
        sequence: 2,
        sid: '0',
        address_line1: '2015 ALDERGROVE AVE',
        address: '2015 ALDERGROVE AVE, ESCONDIDO, CA 92029-1902',
        lat: null,
        lng: null
      },
      {
        sequence: 3,
        sid: '0',
        address_line1: '2425 AUTO PARK WAY',
        address: '2425 AUTO PARK WAY, ESCONDIDO, CA 92029-1222',
        lat: null,
        lng: null
      }
    ],
    [
      {
        sequence: null,
        sid: '0',
        address_line1: '2015 ALDERGROVE AVE',
        address: '2015 ALDERGROVE AVE',
        lat: 33.116729,
        lng: -117.112454,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      },
      {
        sequence: null,
        sid: '0',
        address_line1: '2425 AUTO PARK WAY',
        address: '2425 AUTO PARK WAY',
        lat: 33.124775,
        lng: -117.120303,
        geocode_source: 'manifest',
        geocode_accuracy: 'manifest'
      }
    ]
  );

  assert.equal(merged[0].lat, 33.116729);
  assert.equal(merged[0].lng, -117.112454);
  assert.equal(merged[1].lat, 33.124775);
  assert.equal(merged[1].lng, -117.120303);
});

test('mergeManifestStops does not use duplicate SID values as unique coordinate matches', () => {
  const merged = mergeManifestStops(
    [
      {
        sequence: 9,
        sid: '1500',
        address_line1: '4180 CANYON DE ORO',
        address: '4180 CANYON DE ORO, ENCINITAS, CA 92024',
        lat: null,
        lng: null
      },
      {
        sequence: 22,
        sid: '1500',
        address_line1: '3086 STARRY NIGHT DR',
        address: '3086 STARRY NIGHT DR, ESCONDIDO, CA 92029',
        lat: null,
        lng: null
      }
    ],
    [
      {
        sequence: 9,
        sid: '1500',
        address_line1: '4180 CANYON DE ORO',
        address: '4180 CANYON DE ORO',
        lat: 33.01,
        lng: -117.01
      },
      {
        sequence: 22,
        sid: '1500',
        address_line1: '3086 STARRY NIGHT DR',
        address: '3086 STARRY NIGHT DR',
        lat: 33.22,
        lng: -117.22
      }
    ]
  );

  assert.equal(merged[0].lat, 33.01);
  assert.equal(merged[0].lng, -117.01);
  assert.equal(merged[1].lat, 33.22);
  assert.equal(merged[1].lng, -117.22);
});

test('normalizeMergedStopSequences produces a clean contiguous stop order', () => {
  const normalized = normalizeMergedStopSequences([
    { sequence: 1, stop_number: 1, sid: 'A' },
    { sequence: 1, stop_number: 1, sid: 'B' },
    { sequence: 6, stop_number: 6, sid: 'C' },
    { sequence: 9, stop_number: 9, sid: 'D' }
  ]);

  assert.deepEqual(
    normalized.map((stop) => stop.sequence),
    [1, 2, 3, 4]
  );
  assert.deepEqual(
    normalized.map((stop) => stop.stop_number),
    [1, 2, 3, 4]
  );
});
