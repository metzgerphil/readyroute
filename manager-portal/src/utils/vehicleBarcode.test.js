import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWebVehicleBarcodeOptions,
  isRenderableVehicleBarcode
} from './vehicleBarcode.js';

test('web vehicle barcode options always request Code 128 with high contrast and quiet space', () => {
  assert.deepEqual(buildWebVehicleBarcodeOptions('V400770'), {
    bcid: 'code128',
    text: 'V400770',
    scale: 4,
    height: 18,
    includetext: false,
    paddingwidth: 4,
    paddingheight: 3,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000'
  });
});

test('web vehicle barcode accepts only a non-empty Code 128 payload', () => {
  assert.equal(isRenderableVehicleBarcode({ symbology: 'CODE128', value: 'V400770' }), true);
  assert.equal(isRenderableVehicleBarcode({ symbology: 'QR', value: 'V400770' }), false);
  assert.equal(isRenderableVehicleBarcode({ symbology: 'CODE128', value: '' }), false);
});
