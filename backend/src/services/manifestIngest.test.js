const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const { createManifestIngestService } = require('./manifestIngest');

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
