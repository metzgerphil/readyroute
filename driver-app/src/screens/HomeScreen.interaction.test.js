import React from 'react';
import { Alert, Animated } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

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
import { prefetchDriverDriveRoute, prefetchDriverManifest, saveDriverRouteSummary } from '../services/driverRouteCache';
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

jest.mock('../services/driverRouteCache', () => ({
  prefetchDriverDriveRoute: jest.fn(),
  prefetchDriverManifest: jest.fn(),
  saveDriverRouteSummary: jest.fn()
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn()
}));

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: {
    Images: 'Images'
  },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn()
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
    prefetchDriverDriveRoute.mockResolvedValue(null);
    prefetchDriverManifest.mockResolvedValue(null);
    saveDriverRouteSummary.mockResolvedValue(null);
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });

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

    expect(prefetchDriverManifest).toHaveBeenCalled();
    expect(prefetchDriverDriveRoute).toHaveBeenCalled();

    const startButton = screen.getByText('Acknowledge');
    let startPressable = startButton;
    while (startPressable && !startPressable.props?.onPress) {
      startPressable = startPressable.parent;
    }
    expect(startPressable).toBeTruthy();
    await waitFor(() => {
      expect(startPressable.props.disabled).toBe(false);
    });
    fireEvent.press(startPressable);
    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/route-1/status', {
        status: 'in_progress'
      });
    });

    expect(navigation.navigate).toHaveBeenCalledWith('MyDrive');
  });

  it('requires a valid odometer reading before starting the route', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              status: 'pending',
              vehicle_id: 'vehicle-1',
              vehicle_name: 'Truck 12',
              stops: [{ id: 'stop-1' }]
            },
            driver_day: {
              status: 'dispatched',
              odometer_requirement: {
                required: true,
                submitted: false,
                vehicle_id: 'vehicle-1',
                vehicle_name: 'Truck 12',
                last_recorded_odometer: 54250,
                minimum_odometer: 54250,
                maximum_odometer: 54550
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
    api.post.mockResolvedValue({ data: { vehicle: { current_mileage: 54300 } } });
    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Enter truck odometer')).toBeTruthy();
      expect(screen.getByText('54,250 to 54,550')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByPlaceholderText('Current odometer reading'), '54600');
    fireEvent.press(screen.getByText('Continue'));

    expect(await screen.findByText('Value is outside the accepted range.')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalledWith('/routes/odometer', expect.anything());
    expect(navigation.navigate).not.toHaveBeenCalledWith('MyDrive');

    fireEvent.changeText(screen.getByPlaceholderText('Current odometer reading'), '54300');
    fireEvent.press(screen.getByText('Continue'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/routes/odometer', {
        vehicle_id: 'vehicle-1',
        route_id: 'route-1',
        odometer_reading: 54300
      });
      expect(api.patch).toHaveBeenCalledWith('/routes/route-1/status', {
        status: 'in_progress'
      });
      expect(navigation.navigate).toHaveBeenCalledWith('MyDrive');
    });
  });

  it('submits a structured vehicle inspection with issue details and a photo', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              date: '2026-06-27',
              status: 'pending',
              vehicle_id: 'vehicle-1',
              vehicle_name: 'Truck 204526',
              stops: [{ id: 'stop-1' }]
            },
            driver_day: {
              status: 'dispatched',
              inspection_requirement: {
                required: true,
                submitted: false,
                route_id: 'route-1',
                vehicle_id: 'vehicle-1',
                vehicle_name: 'Truck 204526',
                inspection_date: '2026-06-27',
                last_recorded_odometer: 12000,
                minimum_odometer: 12000,
                maximum_odometer: 12300,
                checklist_items: [
                  { checklist_item_key: 'tires', label: 'Tires' },
                  { checklist_item_key: 'lights', label: 'Lights' }
                ]
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
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          base64: 'aW1hZ2U=',
          fileName: 'tire.jpg',
          mimeType: 'image/jpeg'
        }
      ]
    });
    api.post.mockImplementation((url) => {
      if (url === '/routes/inspection-photo') {
        return Promise.resolve({
          data: {
            photo: {
              url: 'https://cdn.readyroute.test/tire.jpg',
              storage_bucket: 'vehicle-inspection-photos',
              storage_path: 'acct-1/vehicle-1/route-1/tires/tire.jpg',
              caption: null
            }
          }
        });
      }

      if (url === '/routes/inspection') {
        return Promise.resolve({
          data: {
            inspection: {
              id: 'inspection-1',
              odometer: 12025,
              status: 'safe_with_maintenance_reported',
              manager_review_required: false,
              urgent_review: false
            }
          }
        });
      }

      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });
    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Weekly vehicle inspection')).toBeTruthy();
      expect(screen.getByText('0 of 2 completed')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByPlaceholderText('Current odometer reading'), '12025');
    fireEvent.press(screen.getByLabelText('Mark Tires has an issue'));
    fireEvent.press(screen.getByText('Back Right'));
    fireEvent.press(screen.getByText('Low pressure'));
    fireEvent.press(screen.getByText('Maintenance Soon'));
    fireEvent.press(screen.getByText('Attach Photo'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/routes/inspection-photo', expect.objectContaining({
        route_id: 'route-1',
        vehicle_id: 'vehicle-1',
        checklist_item_key: 'tires',
        image_base64: 'aW1hZ2U='
      }));
      expect(screen.getByText('Photo 1 attached')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Mark Lights passed'));
    fireEvent.changeText(screen.getByPlaceholderText('Notes for any issue or inspection detail'), 'Driver noticed tire pressure before leaving.');
    fireEvent.press(screen.getByText('Complete Inspection'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/routes/inspection', expect.objectContaining({
        vehicle_id: 'vehicle-1',
        route_id: 'route-1',
        inspection_date: '2026-06-27',
        odometer: 12025,
        issue_note: 'Driver noticed tire pressure before leaving.',
        items: expect.arrayContaining([
          expect.objectContaining({
            checklist_item_key: 'tires',
            status: 'issue',
            severity: 'maintenance_soon',
            issue_details: expect.objectContaining({
              positions: ['Back Right'],
              issue_types: ['Low pressure']
            }),
            photos: [
              expect.objectContaining({
                storage_bucket: 'vehicle-inspection-photos',
                storage_path: 'acct-1/vehicle-1/route-1/tires/tire.jpg'
              })
            ]
          }),
          expect.objectContaining({
            checklist_item_key: 'lights',
            status: 'pass'
          })
        ])
      }));
      expect(api.patch).toHaveBeenCalledWith('/routes/route-1/status', {
        status: 'in_progress'
      });
      expect(navigation.navigate).toHaveBeenCalledWith('MyDrive');
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Vehicle Inspection Complete',
      'Vehicle: Truck 204526\nStatus: Safe with Maintenance Reported'
    );
    alertSpy.mockRestore();
  });

  it('submits a manual inspection assignment without borrowing the current route vehicle', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              date: '2026-06-27',
              status: 'pending',
              vehicle_id: 'route-vehicle',
              vehicle_name: 'Route Truck',
              stops: [{ id: 'stop-1' }]
            },
            driver_day: {
              status: 'dispatched',
              inspection_requirement: {
                required: true,
                submitted: false,
                reason: 'manual_assignment',
                assignment_id: 'assignment-1',
                route_id: null,
                vehicle_id: 'inspection-vehicle',
                vehicle_name: 'Assigned Truck 411987',
                inspection_date: '2026-06-27',
                last_recorded_odometer: 74000,
                minimum_odometer: 74000,
                maximum_odometer: 74300,
                blocks_route_start: false,
                checklist_items: [
                  { checklist_item_key: 'tires', label: 'Tires' }
                ]
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
    api.post.mockImplementation((url) => {
      if (url === '/routes/inspection') {
        return Promise.resolve({
          data: {
            inspection: {
              id: 'inspection-1',
              odometer: 74025,
              status: 'safe_to_operate',
              manager_review_required: false,
              urgent_review: false
            }
          }
        });
      }

      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Assigned by manager')).toBeTruthy();
      expect(screen.getByText(/Assigned Truck 411987/)).toBeTruthy();
    });

    fireEvent.changeText(screen.getByPlaceholderText('Current odometer reading'), '74025');
    fireEvent.press(screen.getByLabelText('Mark Tires passed'));
    await act(async () => {
      fireEvent.press(screen.getByText('Complete Inspection'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      const inspectionCall = api.post.mock.calls.find(([url]) => url === '/routes/inspection');
      expect(inspectionCall?.[1]).toMatchObject({
        vehicle_id: 'inspection-vehicle',
        assignment_id: 'assignment-1',
        inspection_date: '2026-06-27',
        odometer: 74025
      });
      expect(inspectionCall?.[1]).not.toHaveProperty('route_id');
      expect(api.patch).not.toHaveBeenCalledWith('/routes/route-1/status', expect.anything());
    });

    alertSpy.mockRestore();
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
      expect(screen.getByText('Enable location for route tracking')).toBeTruthy();
      expect(screen.getByText('Open Settings')).toBeTruthy();
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
