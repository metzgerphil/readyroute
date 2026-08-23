export function buildVehicleBarcodeValue(value) {
  const normalized = String(value || '').trim().replace(/^v+/i, '').replace(/\D/g, '');
  return normalized ? `V${normalized}` : null;
}
