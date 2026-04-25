import React from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import MyDriveScreen from './MyDriveScreen';
import api from '../services/api';
import * as Location from 'expo-location';
import * as auth from '../services/auth';

const mockMapMethods = {
  animateCamera: jest.fn(),
  fitToCoordinates: jest.fn(),
  animateToRegion: jest.fn()
};

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  }
}));

jest.mock('../services/auth', () => ({
  getPinColorMode: jest.fn(),
  getClockInTime: jest.fn(),
  removeClockInTime: jest.fn(),
  saveClockInTime: jest.fn(),
  subscribePinColorMode: jest.fn(() => jest.fn())
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn()
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');

  const MockMapView = React.forwardRef(({ children }, ref) => {
    React.useImperativeHandle(ref, () => mockMapMethods);
    return <View testID="map-view">{children}</View>;
  });

  function Marker({ children, onPress, testID }) {
    return (
      <Pressable onPress={onPress} testID={testID}>
        {children}
      </Pressable>
    );
  }

  function Callout({ children, onPress }) {
    return <Pressable onPress={onPress}>{children}</Pressable>;
  }

  return {
    __esModule: true,
    default: MockMapView,
    Marker,
    Callout,
    PROVIDER_GOOGLE: 'google'
  };
});

describe('MyDriveScreen interactions', () => {
  const navigation = {
    navigate: jest.fn(),
    setOptions: jest.fn(),
    setParams: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockMapMethods.animateCamera.mockClear();
    mockMapMethods.fitToCoordinates.mockClear();
    mockMapMethods.animateToRegion.mockClear();

    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted', granted: true });
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 33.12,
        longitude: -117.21
      }
    });
    auth.getClockInTime.mockResolvedValue(null);
    auth.getPinColorMode.mockResolvedValue('sid');
    auth.removeClockInTime.mockResolvedValue();
    auth.saveClockInTime.mockResolvedValue();

    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              stops_per_hour: 12,
              stops: [
                {
                  id: 'stop-1',
                  sequence_order: 1,
                  address: '100 Main St, Escondido, CA',
                  lat: 33.1,
                  lng: -117.2,
                  status: 'pending',
                  stop_type: 'delivery',
                  packages: []
                },
                {
                  id: 'stop-2',
                  sequence_order: 2,
                  address: '200 Oak St, Escondido, CA',
                  lat: 33.2,
                  lng: -117.3,
                  status: 'pending',
                  stop_type: 'delivery',
                  contact_name: 'Alex Driver',
                  packages: [{ id: 'pkg-1' }]
                }
              ]
            }
          }
        });
      }

      if (url === '/timecards/status') {
        return Promise.resolve({
          data: {
            clock_in_at: null,
            active_break: null
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    api.post.mockResolvedValue({ data: {} });
  });

  async function renderAndFlush() {
    const screen = render(<MyDriveScreen navigation={navigation} route={{ params: {} }} />);
    await act(async () => {
      await Promise.resolve();
    });
    return screen;
  }

  it('keeps zoom steady when selecting a stop and opens details', async () => {
    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledWith(
        [
          { latitude: 33.1, longitude: -117.2 },
          { latitude: 33.2, longitude: -117.3 }
        ],
        expect.objectContaining({
          animated: false
        })
      );
    });
    const initialFitCallCount = mockMapMethods.fitToCoordinates.mock.calls.length;

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-2'));

    await screen.findByText(/Alex Driver/);

    expect(mockMapMethods.animateCamera).not.toHaveBeenCalled();
    expect(mockMapMethods.animateToRegion).not.toHaveBeenCalled();

    fireEvent.press(screen.getByText('Tap to open stop details'));

    expect(navigation.navigate).toHaveBeenCalledWith('StopDetail', {
      stopId: 'stop-2'
    });
    expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledTimes(initialFitCallCount);
  });

  it('shows the dispatch waiting state when the route is staged but not yet live', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: null,
            driver_day: {
              status: 'awaiting_dispatch'
            }
          }
        });
      }

      if (url === '/timecards/status') {
        return Promise.resolve({
          data: {
            clock_in_at: null,
            active_break: null
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Route staged for dispatch')).toBeTruthy();
      expect(screen.getByText(/will appear here as soon as your lead manager dispatches the day/)).toBeTruthy();
    });
  });

  it('hands off navigation to Google Maps and completes the selected stop', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue();

    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-2'));
    await screen.findByText('Nav');

    fireEvent.press(screen.getByText('Nav'));

    await waitFor(() => {
      expect(canOpenURLSpy).toHaveBeenCalledWith(
        'comgooglemaps://?daddr=200%20Oak%20St%2C%20Escondido%2C%20CA&directionsmode=driving'
      );
    });

    expect(openURLSpy).toHaveBeenCalledWith(
      'comgooglemaps://?daddr=200%20Oak%20St%2C%20Escondido%2C%20CA&directionsmode=driving'
    );

    fireEvent.press(screen.getByText('Complete'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/stop-2/complete', {
        status: 'delivered'
      });
    });

    openURLSpy.mockRestore();
    canOpenURLSpy.mockRestore();
  });

  it('recenters using fitToCoordinates when the driver is near the selected stop', async () => {
    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-1'));
    await screen.findByText('Nav');

    fireEvent.press(screen.getByText('Center'));

    await waitFor(() => {
      expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledWith(
        [
          { latitude: 33.12, longitude: -117.21 },
          { latitude: 33.1, longitude: -117.2 }
        ],
        expect.objectContaining({
          animated: true
        })
      );
    });
  });

  it('uses pickup_complete when completing a pickup stop', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/routes/today') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              stops_per_hour: 12,
              stops: [
                {
                  id: 'stop-1',
                  sequence_order: 1,
                  address: '100 Main St, Escondido, CA',
                  lat: 33.1,
                  lng: -117.2,
                  status: 'pending',
                  stop_type: 'pickup',
                  packages: []
                }
              ]
            }
          }
        });
      }

      if (url === '/timecards/status') {
        return Promise.resolve({
          data: {
            clock_in_at: null,
            active_break: null
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-1'));
    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Complete'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/stop-1/complete', {
        status: 'pickup_complete'
      });
    });
  });

  it('falls back to web Google Maps when native app is unavailable', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue();

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-1'));
    await screen.findByText('Nav');
    fireEvent.press(screen.getByText('Nav'));

    await waitFor(() => {
      expect(openURLSpy).toHaveBeenCalledWith(
        'https://www.google.com/maps/dir/?api=1&destination=100%20Main%20St%2C%20Escondido%2C%20CA&travelmode=driving'
      );
    });

    openURLSpy.mockRestore();
    canOpenURLSpy.mockRestore();
  });

  it('shows an alert when completing a stop fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    api.patch.mockRejectedValue({
      response: {
        data: {
          error: 'Stop could not be completed'
        }
      }
    });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-1'));
    await screen.findByText('Complete');
    fireEvent.press(screen.getByText('Complete'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Stop update failed', 'Stop could not be completed');
    });

    alertSpy.mockRestore();
  });

  it('shows a retry state when the route fails to load, then recovers', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    api.get
      .mockRejectedValueOnce({
        response: {
          data: {
            error: 'Route service down'
          }
        }
      })
      .mockImplementation((url) => {
        if (url === '/routes/today') {
          return Promise.resolve({
            data: {
              route: {
                id: 'route-1',
                stops_per_hour: 12,
                stops: [
                  {
                    id: 'stop-1',
                    sequence_order: 1,
                    address: '100 Main St, Escondido, CA',
                    lat: 33.1,
                    lng: -117.2,
                    status: 'pending',
                    stop_type: 'delivery',
                    packages: []
                  }
                ]
              }
            }
          });
        }

        if (url === '/timecards/status') {
          return Promise.resolve({
            data: {
              clock_in_at: null,
              active_break: null
            }
          });
        }

        return Promise.reject(new Error(`Unexpected GET ${url}`));
      });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Route unavailable')).toBeTruthy();
    });

    expect(screen.getByText('Route service down')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('Route unavailable', 'Route service down');

    fireEvent.press(screen.getByText('Retry'));

    await waitFor(() => {
      expect(screen.getByText('Complete')).toBeTruthy();
    });

    alertSpy.mockRestore();
  });

  it('shows clock and break controls on My Drive and clocks in', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/timecards/clock-in') {
        return Promise.resolve({
          data: {
            clock_in_at: '2026-04-23T15:58:00.000Z'
          }
        });
      }

      if (url === '/routes/position') {
        return Promise.resolve({ data: {} });
      }

      return Promise.resolve({ data: {} });
    });

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Clock In')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Clock In'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/timecards/clock-in', {
        route_id: 'route-1'
      });
    });

    expect(await screen.findByText('Clock Out')).toBeTruthy();
  });

  it('offers break, lunch, or clock out from the single labor button after clock-in', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    api.post.mockImplementation((url) => {
      if (url === '/timecards/clock-in') {
        return Promise.resolve({
          data: {
            clock_in_at: '2026-04-23T15:58:00.000Z'
          }
        });
      }

      if (url === '/timecards/breaks/start') {
        return Promise.resolve({
          data: {
            active_break: {
              id: 'break-1',
              break_type: 'rest',
              started_at: '2026-04-23T16:10:00.000Z'
            }
          }
        });
      }

      return Promise.resolve({ data: {} });
    });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByText('Clock In'));
    await screen.findByText('Clock Out');

    fireEvent.press(screen.getByText('Clock Out'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Manage labor',
        'Choose what you want to do next.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Break' }),
          expect.objectContaining({ text: 'Lunch' }),
          expect.objectContaining({ text: 'Clock Out' })
        ])
      );
    });

    const options = alertSpy.mock.calls.at(-1)[2];
    const breakOption = options.find((option) => option.text === 'Break');
    await act(async () => {
      breakOption.onPress();
    });

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/timecards/breaks/start', {
        break_type: 'rest'
      });
    });

    alertSpy.mockRestore();
  });

  it('clears stale local clock-in state when My Drive reloads without an active timecard', async () => {
    auth.getClockInTime.mockResolvedValue('2026-04-23T15:58:00.000Z');

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByText('Clock In')).toBeTruthy();
    });

    expect(screen.queryByText('Clock Out')).toBeNull();
    expect(auth.removeClockInTime).toHaveBeenCalled();
    expect(auth.saveClockInTime).not.toHaveBeenCalledWith('2026-04-23T15:58:00.000Z');
  });

});
