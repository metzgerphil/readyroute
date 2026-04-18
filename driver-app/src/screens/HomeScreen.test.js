jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  }
}));

import {
  formatBreakLabel,
  getGreetingByTime,
  getRoutePresentation,
  getRouteSummary,
  getTodayStorageDate
} from './HomeScreen';

describe('HomeScreen helpers', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the correct greeting by time of day', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-15T08:00:00-07:00'));
    expect(getGreetingByTime()).toBe('Good morning');

    jest.setSystemTime(new Date('2026-04-15T14:00:00-07:00'));
    expect(getGreetingByTime()).toBe('Good afternoon');

    jest.setSystemTime(new Date('2026-04-15T20:00:00-07:00'));
    expect(getGreetingByTime()).toBe('Good evening');
  });

  it('formats break labels and route presentation consistently', () => {
    expect(formatBreakLabel('lunch')).toBe('Lunch');
    expect(formatBreakLabel('rest')).toBe('Break');
    expect(formatBreakLabel('other')).toBe('Break');

    expect(getRoutePresentation('pending').actionLabel).toBe('Start Route');
    expect(getRoutePresentation('in_progress').actionLabel).toBe('Continue Route');
    expect(getRoutePresentation('complete').actionLabel).toBeNull();
  });

  it('builds the storage date in stable YYYY-MM-DD format', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-15T09:30:00-07:00'));
    expect(getTodayStorageDate()).toBe('2026-04-15');
  });

  it('builds a compact route summary for the home card', () => {
    expect(
      getRouteSummary({
        work_area_name: '816',
        vehicle_name: '418666',
        stops_per_hour: 12.4
      })
    ).toEqual(['Route 816', 'Vehicle 418666', '12.4 stops/hr']);
  });
});
