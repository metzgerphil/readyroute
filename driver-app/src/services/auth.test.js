import { Buffer } from 'buffer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  isAvailableAsync: jest.fn(),
  setItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  getDriverFromToken,
  getLastPortalMode,
  getPinColorMode,
  getPortalAccess,
  getSessionIdentity,
  getToken,
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
  beforeEach(() => {
    jest.clearAllMocks();
    SecureStore.isAvailableAsync.mockResolvedValue(true);
    SecureStore.getItemAsync.mockResolvedValue(null);
  });

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

    SecureStore.getItemAsync.mockResolvedValueOnce(token);
    AsyncStorage.setItem.mockResolvedValueOnce();

    await savePinColorMode('black');

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('readyroute_pin_color_mode:driver-42', 'black');

    SecureStore.getItemAsync.mockResolvedValueOnce(token);
    AsyncStorage.getItem.mockResolvedValueOnce('black');

    await expect(getPinColorMode()).resolves.toBe('black');
    expect(AsyncStorage.getItem).toHaveBeenLastCalledWith('readyroute_pin_color_mode:driver-42');
  });

  it('notifies live pin color mode subscribers when the preference changes', async () => {
    const token = makeToken({ sub: 'driver-88' });
    const listener = jest.fn();
    const unsubscribe = subscribePinColorMode(listener);

    SecureStore.getItemAsync.mockResolvedValueOnce(token);
    AsyncStorage.setItem.mockResolvedValueOnce();

    await savePinColorMode('sid');

    expect(listener).toHaveBeenCalledWith('sid');

    unsubscribe();
  });

  it('stores both driver and manager tokens for a mobile session', async () => {
    SecureStore.setItemAsync.mockResolvedValue();

    await saveSessionTokens({
      driverToken: 'driver-token',
      managerToken: 'manager-token'
    });

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'readyroute_driver_token',
      'driver-token',
      expect.any(Object)
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'readyroute_manager_token',
      'manager-token',
      expect.any(Object)
    );
  });

  it('migrates a legacy AsyncStorage token into SecureStore', async () => {
    SecureStore.getItemAsync.mockResolvedValueOnce(null);
    AsyncStorage.getItem.mockResolvedValueOnce('legacy-driver-token');

    await expect(getToken()).resolves.toBe('legacy-driver-token');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'readyroute_driver_token',
      'legacy-driver-token',
      expect.any(Object)
    );
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('readyroute_driver_token');
  });

  it('does not fall back to plaintext tokens when SecureStore is unavailable', async () => {
    SecureStore.isAvailableAsync.mockResolvedValue(false);

    await expect(getToken()).resolves.toBeNull();

    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('readyroute_driver_token');
    expect(AsyncStorage.getItem).not.toHaveBeenCalled();
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
      managerEmail: null,
      primaryRole: 'Manager',
      roles: {
        driver: true,
        manager: true
      }
    });
  });
});
