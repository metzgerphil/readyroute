import * as Crypto from 'expo-crypto';

import { getSecureItem, setSecureItem } from './secureStorage';
import { getOrCreateDeviceIdentity } from './deviceIdentity';

jest.mock('./secureStorage', () => ({
  getSecureItem: jest.fn(),
  setSecureItem: jest.fn()
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '12345678-1234-1234-1234-123456789012')
}));

test('creates and securely retains one stable device identity', async () => {
  getSecureItem.mockResolvedValueOnce(null).mockResolvedValueOnce('saved-device-identifier-1234');

  const created = await getOrCreateDeviceIdentity();
  const existing = await getOrCreateDeviceIdentity();

  expect(created.device_id).toBe('12345678-1234-1234-1234-123456789012');
  expect(existing.device_id).toBe('saved-device-identifier-1234');
  expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
  expect(setSecureItem).toHaveBeenCalledWith(
    'readyroute_authorized_device_id',
    '12345678-1234-1234-1234-123456789012'
  );
});
