export function buildVehicleBarcodeValue(value) {
  const normalized = String(value || '').trim().replace(/^v+/i, '').replace(/\s+/g, '');
  return normalized ? `V${normalized}` : null;
}
