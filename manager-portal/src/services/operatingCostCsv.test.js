import assert from 'node:assert/strict';
import test from 'node:test';

import { parseOperatingCostCsv } from './operatingCostCsv.js';

test('parseOperatingCostCsv reads quoted vendor costs', () => {
  const rows = parseOperatingCostCsv('vendor,amount,category,notes\n"Google, Cloud",42.50,google_cloud_run,"July services"');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].vendor, 'Google, Cloud');
  assert.equal(rows[0].amount, '42.50');
});

test('parseOperatingCostCsv requires vendor and amount headers', () => {
  assert.throws(() => parseOperatingCostCsv('name,total\nVercel,20'), /vendor and amount/);
});
