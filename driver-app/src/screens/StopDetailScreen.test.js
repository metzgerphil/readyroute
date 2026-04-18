jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn(),
    post: jest.fn()
  }
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn()
}));

import {
  formatSecondaryAddressDetails,
  formatWarningFlag,
  getPrimaryAddressLine,
  getStatusConfig,
  getStopTypeMeta,
  getTypeBadges
} from './StopDetailScreen';

describe('StopDetailScreen helpers', () => {
  it('formats status and stop type metadata correctly', () => {
    expect(getStatusConfig('pending').label).toBe('Pending');
    expect(getStatusConfig('delivered').label).toBe('Delivered');
    expect(getStopTypeMeta('pickup').label).toBe('Pickup');
    expect(getStopTypeMeta('combined').label).toBe('Delivery + Pickup');
    expect(getStopTypeMeta('delivery').label).toBe('Delivery');
  });

  it('builds primary and secondary address details for delivery intel', () => {
    expect(
      getPrimaryAddressLine({
        address: '15175 Highland Valley Road, Unit B, Escondido, CA 92025',
        address_line2: 'Unit B'
      })
    ).toBe('15175 Highland Valley Road');

    expect(
      formatSecondaryAddressDetails({
        secondary_address_type: 'suite',
        unit_label: '3B',
        suite_label: '210',
        building_label: 'Building C',
        floor_label: 'Floor 2'
      })
    ).toBe('Type SUITE · Unit 3B · Suite 210 · Building C · Floor 2');
  });

  it('formats warning flags and type badges for stop detail chips', () => {
    expect(formatWarningFlag('loading_dock')).toBe('Loading dock');
    expect(formatWarningFlag('dog')).toBe('Dog alert');

    const badges = getTypeBadges({
      is_business: true,
      stop_type: 'combined'
    });

    expect(badges.map((badge) => badge.label)).toEqual(
      expect.arrayContaining(['BUSINESS', 'PICKUP', 'DELIVERY'])
    );
  });
});
