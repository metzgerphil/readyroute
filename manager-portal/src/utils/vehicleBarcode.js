export function buildWebVehicleBarcodeOptions(value) {
  return {
    bcid: 'code128',
    text: String(value || ''),
    scale: 4,
    height: 18,
    includetext: false,
    paddingwidth: 4,
    paddingheight: 3,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000'
  };
}

export function isRenderableVehicleBarcode(barcode) {
  return barcode?.symbology === 'CODE128' && Boolean(String(barcode?.value || ''));
}
