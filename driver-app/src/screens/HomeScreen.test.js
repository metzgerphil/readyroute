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

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn()
}));

import {
  DAILY_SAFETY_REMINDERS,
  getDailySafetyReminder,
  getDayOfYear,
  getDriverDayStatus,
  getLocationRequirementCopy,
  getPostDispatchChangeNotice,
  getDriverWaitingCopy,
  hasGrantedLocationPermission,
  shouldPromptForLocationPermission,
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

    expect(getRoutePresentation('pending').actionLabel).toBe('Acknowledge');
    expect(getRoutePresentation('in_progress').actionLabel).toBe('Continue Route');
    expect(getRoutePresentation('complete').actionLabel).toBeNull();
  });

  it('builds the storage date in stable YYYY-MM-DD format', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-15T09:30:00-07:00'));
    expect(getTodayStorageDate()).toBe('2026-04-15');
  });

  it('rotates a concrete safety reminder based on the calendar day', () => {
    const reminderDate = new Date('2026-04-15T09:30:00-07:00');
    const expectedIndex = (getDayOfYear(reminderDate) - 1) % DAILY_SAFETY_REMINDERS.length;

    expect(getDailySafetyReminder(reminderDate)).toEqual(DAILY_SAFETY_REMINDERS[expectedIndex]);
    expect(getDailySafetyReminder(reminderDate).bullets.length).toBeGreaterThan(2);
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

  it('derives the staged waiting state for drivers before dispatch', () => {
    expect(getDriverDayStatus({ status: 'awaiting_dispatch' }, null)).toBe('awaiting_dispatch');
    expect(getDriverDayStatus({ status: 'awaiting_dispatch' }, { id: 'route-1' })).toBe('dispatched');
    expect(
      getDriverWaitingCopy({
        route_preview: {
          work_area_name: '810',
          last_manifest_sync_at: '2026-04-24T13:45:00.000Z'
        }
      }).title
    ).toBe('Route staged for dispatch');
  });

  it('classifies post-dispatch route changes for driver messaging', () => {
    expect(
      getPostDispatchChangeNotice({
        post_dispatch_change_policy: {
          code: 'manager_review_required'
        }
      }).title
    ).toBe('Route changed after dispatch');
    expect(
      getPostDispatchChangeNotice({
        post_dispatch_change_policy: {
          code: 'driver_warning'
        }
      }).title
    ).toBe('Route updated after dispatch');
    expect(getPostDispatchChangeNotice(null)).toBeNull();
  });

  it('describes and validates the required location-sharing gate', () => {
    expect(hasGrantedLocationPermission({ granted: true })).toBe(true);
    expect(hasGrantedLocationPermission({ status: 'granted' })).toBe(true);
    expect(hasGrantedLocationPermission({ granted: false })).toBe(false);
    expect(shouldPromptForLocationPermission({ status: 'undetermined' })).toBe(true);
    expect(shouldPromptForLocationPermission({ status: 'denied' })).toBe(false);
    expect(getLocationRequirementCopy().title).toBe('Share location to use ReadyRoute');
  });
});
