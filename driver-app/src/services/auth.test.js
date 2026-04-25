import { Buffer } from 'buffer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getDriverFromToken,
  getLastPortalMode,
  getPinColorMode,
  getPortalAccess,
  getSessionIdentity,
  saveLastPortalMode,
  savePinColorMode,
  saveSessionTokens,
  subscribePinColorMode
} from './auth';

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

  it('stores both driver and manager tokens for a mobile session', async () => {
    AsyncStorage.setItem.mockResolvedValue();

    await saveSessionTokens({
      driverToken: 'driver-token',
      managerToken: 'manager-token'
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('readyroute_driver_token', 'driver-token');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('readyroute_manager_token', 'manager-token');
  });

  it('stores the last selected portal by the current account identity', async () => {
    const driverToken = makeToken({
      account_id: 'acct-42',
      driver_id: 'driver-42',
      email: 'driver@example.com',
      role: 'driver'
    });
    const managerToken = makeToken({
      account_id: 'acct-42',
      manager_email: 'driver@example.com',
      role: 'manager'
    });

    AsyncStorage.setItem.mockResolvedValueOnce();
    await saveLastPortalMode('manager', { driverToken, managerToken });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'readyroute_last_portal:acct-42:driver@example.com',
      'manager'
    );

    AsyncStorage.getItem.mockResolvedValueOnce('driver');
    await expect(getLastPortalMode({ driverToken, managerToken })).resolves.toBe('driver');
    expect(AsyncStorage.getItem).toHaveBeenLastCalledWith(
      'readyroute_last_portal:acct-42:driver@example.com'
    );
  });

  it('reports driver and manager access from saved tokens', () => {
    const driverToken = makeToken({
      account_id: 'acct-99',
      driver_id: 'driver-99',
      role: 'driver'
    });
    const managerToken = makeToken({
      account_id: 'acct-99',
      manager_email: 'manager@example.com',
      role: 'manager'
    });

    expect(getPortalAccess({ driverToken, managerToken })).toEqual({
      driver: true,
      manager: true
    });
  });

  it('derives the drawer identity from the active session mode', () => {
    const driverToken = makeToken({
      account_id: 'acct-99',
      driver_id: 'driver-99',
      full_name: 'Luis Perez',
      company_name: 'Bridge Transportation',
      role: 'driver'
    });
    const managerToken = makeToken({
      account_id: 'acct-99',
      full_name: 'Luis Perez',
      company_name: 'Bridge Transportation',
      role: 'manager'
    });

    expect(
      getSessionIdentity({
        activeMode: 'manager',
        driverToken,
        managerToken
      })
    ).toEqual({
      fullName: 'Luis Perez',
      companyName: 'Bridge Transportation',
      primaryRole: 'Manager',
      roles: {
        driver: true,
        manager: true
      }
    });
  });
});
