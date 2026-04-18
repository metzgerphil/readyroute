import React from 'react';
import { Alert, Animated } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import HomeScreen, { getTodayStorageDate } from './HomeScreen';
import api from '../services/api';
import {
  getClockInTime,
  getDriverFromToken,
  getSecurityDismissedDate,
  getToken,
  removeClockInTime,
  removeToken,
  saveClockInTime,
  saveSecurityDismissedDate
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
  getSecurityDismissedDate: jest.fn(),
  getToken: jest.fn(),
  removeClockInTime: jest.fn(),
  removeToken: jest.fn(),
  saveClockInTime: jest.fn(),
  saveSecurityDismissedDate: jest.fn()
}));

jest.mock('../services/statusCodes', () => ({
  loadStatusCodes: jest.fn()
}));

describe('HomeScreen interactions', () => {
  const navigation = { navigate: jest.fn() };
  const onLogout = jest.fn();
  let animatedTimingSpy;
  let animatedParallelSpy;

  beforeEach(() => {
    jest.clearAllMocks();
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
    getSecurityDismissedDate.mockResolvedValue(getTodayStorageDate());
    getDriverFromToken.mockReturnValue({ name: 'Phil' });
    loadStatusCodes.mockResolvedValue(undefined);

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
      expect(screen.getByText('Start Route')).toBeTruthy();
    });

    const startButton = screen.getByText('Start Route');
    fireEvent.press(startButton);

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/route-1/status', {
        status: 'in_progress'
      });
    });

    expect(navigation.navigate).toHaveBeenCalledWith('MyDrive');
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
              started_at: '2026-04-15T15:30:00.000Z'
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
              started_at: '2026-04-15T15:30:00.000Z'
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

  it('dismisses the daily security banner and saves the dismissal date', async () => {
    getSecurityDismissedDate.mockResolvedValue('2026-04-14');

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Daily Security Reminder')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Got it'));

    await waitFor(() => {
      expect(saveSecurityDismissedDate).toHaveBeenCalledWith(getTodayStorageDate());
    });
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
      expect(screen.getByText("Today's Route")).toBeTruthy();
    });

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
