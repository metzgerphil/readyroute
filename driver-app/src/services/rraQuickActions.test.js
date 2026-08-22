jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), removeItem: jest.fn(), setItem: jest.fn() }));
jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('./auth', () => ({ getDriverFromToken: jest.fn(() => ({ driver_id: 'driver-1' })), getToken: jest.fn(async () => 'token') }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';
import { getRraQuickActions, getRraReferenceCodes, RRA_CODES_CACHE_KEY, RRA_CONTACTS_CACHE_PREFIX } from './rraQuickActions';

beforeEach(() => jest.clearAllMocks());

test('caches company contacts under the signed-in driver identity', async () => {
  const actions = { cxpc: { phone: '8005551212' }, manager: { name: 'Vlad', phone: '4155550100' } };
  api.get.mockResolvedValue({ data: { quick_actions: actions } });
  await expect(getRraQuickActions()).resolves.toEqual(actions);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(`${RRA_CONTACTS_CACHE_PREFIX}:driver-1`, JSON.stringify(actions));
});

test('caches verified codes and returns them when offline', async () => {
  const codes = { delivery: [{ code: '02', label: 'Incorrect recipient address' }], pickup: [] };
  api.get.mockResolvedValueOnce({ data: { codes } });
  await expect(getRraReferenceCodes()).resolves.toEqual(codes);
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(RRA_CODES_CACHE_KEY, JSON.stringify(codes));
  api.get.mockRejectedValueOnce(new Error('offline'));
  AsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(codes));
  await expect(getRraReferenceCodes()).resolves.toEqual(codes);
});
