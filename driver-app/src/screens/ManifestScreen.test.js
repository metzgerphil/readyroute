jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn()
  }
}));

import {
  getStatusConfig,
  isPriorityStop,
  isPickupStop,
  isHazmatStop
} from './ManifestScreen';

describe('ManifestScreen helpers', () => {
  it('returns the right status presentation for known stop states', () => {
    expect(getStatusConfig('delivered').label).toBe('Delivered');
    expect(getStatusConfig('attempted').label).toBe('Attempted');
    expect(getStatusConfig('incomplete').label).toBe('Incomplete');
    expect(getStatusConfig('pending').label).toBe('Pending');
  });

  it('detects priority and pickup stops from route data', () => {
    expect(isPriorityStop({ priority: true })).toBe(true);
    expect(isPriorityStop({ notes: 'Priority customer drop' })).toBe(true);
    expect(isPriorityStop({ notes: 'standard stop' })).toBe(false);

    expect(isPickupStop({ stop_type: 'pickup' })).toBe(true);
    expect(isPickupStop({ is_pickup: true })).toBe(true);
    expect(isPickupStop({ stop_type: 'delivery' })).toBe(false);
  });

  it('detects hazmat stops from package payloads', () => {
    expect(isHazmatStop({ packages: [{ id: 'pkg-1', hazmat: true }] })).toBe(true);
    expect(isHazmatStop({ packages: [{ id: 'pkg-2', hazmat: false }] })).toBe(false);
    expect(isHazmatStop({ packages: [] })).toBe(false);
  });
});
