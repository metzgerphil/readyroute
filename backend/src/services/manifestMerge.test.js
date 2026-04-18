const test = require('node:test');
const assert = require('node:assert/strict');

const { mergeManifestStops } = require('./manifestMerge');

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
