import { Buffer } from 'buffer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDriverFromToken, getPinColorMode, savePinColorMode, subscribePinColorMode } from './auth';

function makeToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encodedPayload}.signature`;
}

describe('auth service helpers', () => {
  it('extracts the driver payload from a token', () => {
    const token = makeToken({
      sub: 'driver-1',
      name: 'Phil',
      route_id: 'route-1'
    });

    expect(getDriverFromToken(token)).toEqual({
      sub: 'driver-1',
      name: 'Phil',
      route_id: 'route-1'
    });
  });

  it('returns null for missing or malformed tokens', () => {
    expect(getDriverFromToken(null)).toBeNull();
    expect(getDriverFromToken('not-a-jwt')).toBeNull();
    expect(getDriverFromToken('header.invalid.signature')).toBeNull();
  });

  it('stores and reads the pin color mode by the active driver token', async () => {
    const token = makeToken({
      sub: 'driver-42',
      name: 'Luis'
    });

    AsyncStorage.getItem.mockResolvedValueOnce(token);
    AsyncStorage.setItem.mockResolvedValueOnce();

    await savePinColorMode('black');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('readyroute_pin_color_mode:driver-42', 'black');

    AsyncStorage.getItem.mockResolvedValueOnce(token);
    AsyncStorage.getItem.mockResolvedValueOnce('black');

    await expect(getPinColorMode()).resolves.toBe('black');
    expect(AsyncStorage.getItem).toHaveBeenLastCalledWith('readyroute_pin_color_mode:driver-42');
  });

  it('notifies live pin color mode subscribers when the preference changes', async () => {
    const token = makeToken({ sub: 'driver-88' });
    const listener = jest.fn();
    const unsubscribe = subscribePinColorMode(listener);

    AsyncStorage.getItem.mockResolvedValueOnce(token);
    AsyncStorage.setItem.mockResolvedValueOnce();

    await savePinColorMode('sid');

    expect(listener).toHaveBeenCalledWith('sid');

    unsubscribe();
  });
});
