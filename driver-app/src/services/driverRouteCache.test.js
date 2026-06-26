import AsyncStorage from '@react-native-async-storage/async-storage';

import api from './api';
import {
  fetchDriverManifest,
  getCachedDriverManifest,
  prefetchDriverManifest,
  saveDriverRouteSummary
} from './driverRouteCache';
import { getDriverFromToken, getToken } from './auth';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

jest.mock('./api', () => ({
  __esModule: true,
  default: {
    get: jest.fn()
  }
}));

jest.mock('./auth', () => ({
  getDriverFromToken: jest.fn(),
  getToken: jest.fn()
}));

describe('driverRouteCache', () => {
  let storage;

  beforeEach(() => {
    storage = new Map();
    jest.clearAllMocks();
    getToken.mockResolvedValue('driver-token');
    getDriverFromToken.mockReturnValue({
      account_id: 'acct-1',
      driver_id: 'driver-1'
    });
    AsyncStorage.getItem.mockImplementation(async (key) => storage.get(key) || null);
    AsyncStorage.setItem.mockImplementation(async (key, value) => {
      storage.set(key, value);
    });
    AsyncStorage.removeItem.mockImplementation(async (key) => {
      storage.delete(key);
    });
  });

  it('fetches the lean manifest view and caches it for the active route', async () => {
    api.get.mockResolvedValue({
      data: {
        route: {
          id: 'route-1',
          date: '2026-04-08',
          response_view: 'manifest',
          stops: [{ id: 'stop-1', sequence_order: 1 }]
        },
        driver_day: {
          status: 'dispatched'
        }
      }
    });

    const payload = await fetchDriverManifest();
    const cached = await getCachedDriverManifest({ date: '2026-04-08' });

    expect(api.get).toHaveBeenCalledWith('/routes/today', {
      params: {
        view: 'manifest'
      }
    });
    expect(payload.route.id).toBe('route-1');
    expect(cached.route.stops).toEqual([{ id: 'stop-1', sequence_order: 1 }]);
    expect(cached.driver_day.status).toBe('dispatched');
  });

  it('does not return an old cached manifest when the active route summary has no route', async () => {
    await saveDriverRouteSummary({
      route: null,
      driver_day: {
        status: 'unassigned'
      }
    });

    await expect(getCachedDriverManifest()).resolves.toBeNull();
  });

  it('deduplicates concurrent prefetch requests', async () => {
    let resolveRequest;
    api.get.mockReturnValue(new Promise((resolve) => {
      resolveRequest = resolve;
    }));

    const first = prefetchDriverManifest();
    const second = prefetchDriverManifest();

    resolveRequest({
      data: {
        route: {
          id: 'route-1',
          date: '2026-04-08',
          stops: []
        }
      }
    });

    await Promise.all([first, second]);

    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
