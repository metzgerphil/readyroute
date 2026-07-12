const mockStorage = new Map();

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key) => mockStorage.get(key) || null),
  setItem: jest.fn(async (key, value) => mockStorage.set(key, value)),
  removeItem: jest.fn(async (key) => mockStorage.delete(key))
}));

jest.mock('expo-task-manager', () => ({
  isTaskDefined: jest.fn(() => false),
  defineTask: jest.fn()
}));

jest.mock('expo-location', () => ({
  Accuracy: { BestForNavigation: 6 },
  ActivityType: { AutomotiveNavigation: 1 },
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn()
}));

jest.mock('./api', () => ({
  __esModule: true,
  default: { post: jest.fn() }
}));

jest.mock('./auth', () => ({
  getToken: jest.fn(),
  saveToken: jest.fn()
}));

import * as Location from 'expo-location';
import api from './api';
import { getToken, saveToken } from './auth';
import {
  DRIVER_LOCATION_INTERVAL_MS,
  DRIVER_LOCATION_TASK,
  postDriverLocation,
  requestAlwaysLocationPermission,
  startDriverLocationTracking,
  stopDriverLocationTracking
} from './driverLocationTracking';

describe('driver background location tracking', () => {
  beforeEach(() => {
    mockStorage.clear();
    jest.clearAllMocks();
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Location.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Location.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
    Location.startLocationUpdatesAsync.mockResolvedValue();
    Location.stopLocationUpdatesAsync.mockResolvedValue();
    api.post.mockResolvedValue({ data: { ok: true } });
    getToken.mockResolvedValue('driver-token');
    saveToken.mockResolvedValue();
  });

  it('starts native background tracking only after always permission is granted', async () => {
    await expect(startDriverLocationTracking('route-1')).resolves.toEqual({ started: true });

    expect(saveToken).toHaveBeenCalledWith('driver-token');
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(
      DRIVER_LOCATION_TASK,
      expect.objectContaining({
        timeInterval: DRIVER_LOCATION_INTERVAL_MS,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true
      })
    );
  });

  it('requests foreground permission before background permission', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', granted: false });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Location.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'undetermined', granted: false });
    Location.requestBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });

    await expect(requestAlwaysLocationPermission()).resolves.toEqual(expect.objectContaining({ granted: true }));
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(Location.requestBackgroundPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  it('posts at most once per five-second interval across foreground and task callbacks', async () => {
    const first = { timestamp: 10_000, coords: { latitude: 33.1, longitude: -117.2 } };
    const second = { timestamp: 12_000, coords: { latitude: 33.2, longitude: -117.3 } };
    const third = { timestamp: 15_000, coords: { latitude: 33.3, longitude: -117.4 } };

    await expect(postDriverLocation('route-1', first)).resolves.toBe(true);
    await expect(postDriverLocation('route-1', second)).resolves.toBe(false);
    await expect(postDriverLocation('route-1', third)).resolves.toBe(true);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it('stops native updates and clears tracking state', async () => {
    Location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    await startDriverLocationTracking('route-1');
    await stopDriverLocationTracking();

    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(DRIVER_LOCATION_TASK);
    expect(mockStorage.size).toBe(0);
  });
});
