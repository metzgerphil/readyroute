import { buildVehicleBarcodeValue } from '../utils/vehicleBarcode';

describe('buildVehicleBarcodeValue', () => {
  it('adds exactly one uppercase V prefix', () => {
    expect(buildVehicleBarcodeValue('1234')).toBe('V1234');
    expect(buildVehicleBarcodeValue('v1234')).toBe('V1234');
    expect(buildVehicleBarcodeValue('vv1234')).toBe('V1234');
    expect(buildVehicleBarcodeValue('')).toBeNull();
  });
});
