import React from 'react';
import { Alert, Animated } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import HomeScreen, { getDailySafetyReminder } from './HomeScreen';
import api from '../services/api';
import {
  getClockInTime,
  getDriverFromToken,
  getToken,
  removeClockInTime,
  removeToken,
  saveClockInTime
} from '../services/auth';
import { loadStatusCodes } from '../services/statusCodes';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  }
}));

jest.mock('../services/auth', () => ({
  getClockInTime: jest.fn(),
  getDriverFromToken: jest.fn(),
  getToken: jest.fn(),
  removeClockInTime: jest.fn(),
  removeToken: jest.fn(),
  saveClockInTime: jest.fn()
}));

jest.mock('../services/statusCodes', () => ({
  loadStatusCodes: jest.fn()
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn()
}));

describe('HomeScreen interactions', () => {
  const navigation = { navigate: jest.fn() };
  const onLogout = jest.fn();
  let animatedTimingSpy;
  let animatedParallelSpy;
  let activeBreakStartedAt;
  let activeBreakScheduledEndAt;

  beforeEach(() => {
    jest.clearAllMocks();
    activeBreakStartedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    activeBreakScheduledEndAt = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    animatedTimingSpy = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: (callback) => callback?.(),
      stop: jest.fn()
    });
    animatedParallelSpy = jest.spyOn(Animated, 'parallel').mockImplementation((animations) => ({
      start: (callback) => {
        animations.forEach((animation) => animation?.start?.());
        callback?.();
      },
      stop: jest.fn()
    }));

    getToken.mockResolvedValue('driver-token');
    getClockInTime.mockResolvedValue(null);
    getDriverFromToken.mockReturnValue({ name: 'Phil' });
    loadStatusCodes.mockResolvedValue(undefined);
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });

    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              status: 'pending',
              stops: [{ id: 'stop-1' }, { id: 'stop-2' }]
            }
          }
        });
      }

      if (url === '/timecards/status') {
        return Promise.resolve({
          data: {
            active_timecard: null,
            active_break: null
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  });

  afterEach(() => {
    animatedTimingSpy?.mockRestore();
    animatedParallelSpy?.mockRestore();
  });

  async function renderAndFlush() {
    const screen = render(<HomeScreen navigation={navigation} onLogout={onLogout} />);
    await act(async () => {
      await Promise.resolve();
    });
    return screen;
  }

  it('starts a pending route and opens My Drive', async () => {
    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText("Today's safety focus")).toBeTruthy();
      expect(screen.getByText('Acknowledge')).toBeTruthy();
    });

    const startButton = screen.getByText('Acknowledge');
    fireEvent.press(startButton);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/route-1/status', {
        status: 'in_progress'
      });
    });

    expect(navigation.navigate).toHaveBeenCalledWith('MyDrive');
  });

  it('shows a waiting-for-dispatch state when a staged route is assigned but not yet live', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: null,
            driver_day: {
              status: 'awaiting_dispatch',
              route_preview: {
                work_area_name: '810',
                last_manifest_sync_at: '2026-04-24T13:45:00.000Z'
              }
            }
          }
        });
      }

      if (url === '/timecards/status') {
        return Promise.resolve({
          data: {
            active_timecard: null,
            active_break: null
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Route staged for dispatch')).toBeTruthy();
      expect(screen.getByText(/Route 810 is loaded in ReadyRoute/)).toBeTruthy();
    });
  });

  it('shows a location-sharing gate when driver location permission is denied', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied', granted: false });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Share location to use ReadyRoute')).toBeTruthy();
      expect(screen.getByText('Enable Location')).toBeTruthy();
    });
  });

  it('clocks in and starts a lunch break from the action row', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    api.post.mockImplementation((url) => {
      if (url === '/timecards/clock-in') {
        return Promise.resolve({
          data: {
            clock_in_at: '2026-04-15T15:00:00.000Z'
          }
        });
      }

      if (url === '/timecards/breaks/start') {
        return Promise.resolve({
          data: {
            active_break: {
              break_type: 'lunch',
              started_at: activeBreakStartedAt,
              scheduled_end_at: activeBreakScheduledEndAt
            }
          }
        });
      }

      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Clock In')).toBeTruthy();
    });

    const clockInButton = screen.getByText('Clock In');
    fireEvent.press(clockInButton);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/timecards/clock-in', {
        route_id: 'route-1'
      });
    });

    expect(saveClockInTime).toHaveBeenCalledWith('2026-04-15T15:00:00.000Z');
    expect(await screen.findByText('Clock Out')).toBeTruthy();

    const breakButton = await screen.findByText('Break');
    fireEvent.press(breakButton);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Start break',
        'Choose the type of break you are taking.',
        expect.any(Array)
      );
    });

    const breakOptions = alertSpy.mock.calls.at(-1)[2];
    const lunchOption = breakOptions.find((option) => option.text === 'Lunch');

    await act(async () => {
      await lunchOption.onPress();
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/timecards/breaks/start', {
        break_type: 'lunch'
      });
    });

    expect(await screen.findByText('End Lunch')).toBeTruthy();

    alertSpy.mockRestore();
  });

  it('ends an active break and clocks out cleanly', async () => {
    getClockInTime.mockResolvedValue('2026-04-15T15:00:00.000Z');

    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              status: 'in_progress',
              stops: [{ id: 'stop-1' }]
            }
          }
        });
      }

      if (url === '/timecards/status') {
        return Promise.resolve({
          data: {
            active_timecard: {
              clock_in: '2026-04-15T15:00:00.000Z'
            },
            active_break: {
              break_type: 'lunch',
              started_at: activeBreakStartedAt,
              scheduled_end_at: activeBreakScheduledEndAt
            }
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    api.post.mockImplementation((url) => {
      if (url === '/timecards/breaks/end') {
        return Promise.resolve({ data: {} });
      }

      if (url === '/timecards/clock-out') {
        return Promise.resolve({ data: {} });
      }

      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('End Lunch')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('End Lunch'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/timecards/breaks/end');
    });

    await waitFor(() => {
      expect(screen.getByText('Break')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Clock Out'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/timecards/clock-out');
    });

    expect(removeClockInTime).toHaveBeenCalled();
  });

  it('clears stale local clock-in state when the backend reports no active timecard', async () => {
    getClockInTime.mockResolvedValue('2026-04-15T15:00:00.000Z');

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Clock In')).toBeTruthy();
    });

    expect(screen.queryByText('Clock Out')).toBeNull();
    expect(removeClockInTime).toHaveBeenCalled();
    expect(saveClockInTime).not.toHaveBeenCalledWith('2026-04-15T15:00:00.000Z');
  });

  it('shows the rotating safety briefing on the morning screen', async () => {
    const screen = await renderAndFlush();
    const reminder = getDailySafetyReminder(new Date());

    await waitFor(() => {
      expect(screen.getByText("Today's safety focus")).toBeTruthy();
    });
    expect(screen.getByText(reminder.source)).toBeTruthy();
  });

  it('shows a retry state when home data fails to load, then recovers', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    api.get
      .mockRejectedValueOnce({
        response: {
          data: {
            error: 'Backend unavailable'
          }
        }
      })
      .mockImplementation((url) => {
        if (url === '/routes/today') {
          return Promise.resolve({
            data: {
              route: {
                id: 'route-1',
                status: 'pending',
                stops: [{ id: 'stop-1' }]
              }
            }
          });
        }

        if (url === '/timecards/status') {
          return Promise.resolve({
            data: {
              active_timecard: null,
              active_break: null
            }
          });
        }

        return Promise.reject(new Error(`Unexpected GET ${url}`));
      });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Home screen unavailable')).toBeTruthy();
    });

    expect(screen.getByText('Backend unavailable')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('Could not load home screen', 'Backend unavailable');

    fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText("Today's safety focus")).toBeTruthy();
    });

    alertSpy.mockRestore();
  });

  it('silently logs out when the saved token is invalid or expired', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    api.get.mockRejectedValue({
      response: {
        status: 401,
        data: {
          error: 'Invalid or expired token'
        }
      }
    });

    await renderAndFlush();

    await waitFor(() => {
      expect(removeClockInTime).toHaveBeenCalled();
      expect(removeToken).toHaveBeenCalled();
      expect(onLogout).toHaveBeenCalled();
    });

    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('logs out and clears local auth state', async () => {
    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Logout')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Logout'));

    await waitFor(() => {
      expect(removeClockInTime).toHaveBeenCalled();
      expect(removeToken).toHaveBeenCalled();
    });

    expect(onLogout).toHaveBeenCalled();
  });

  it('disables clock-in when no route is assigned', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: null
          }
        });
      }

      if (url === '/timecards/status') {
        return Promise.resolve({
          data: {
            active_timecard: null,
            active_break: null
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Clock In')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Clock In'));
    expect(api.post).not.toHaveBeenCalled();
  });
});
