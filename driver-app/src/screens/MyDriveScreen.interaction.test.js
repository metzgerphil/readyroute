import React from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import MyDriveScreen from './MyDriveScreen';
import api from '../services/api';
import * as Location from 'expo-location';

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

jest.mock('expo-location', () => ({
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

    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 33.12,
        longitude: -117.21
      }
    });

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

  it('keeps zoom but recenters on the newly selected stop and opens details', async () => {
    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(mockMapMethods.animateCamera).toHaveBeenCalledWith(
        {
          center: {
            latitude: 33.1,
            longitude: -117.2
          }
        },
        { duration: 500 }
      );
    });

    fireEvent.press(screen.getByTestId('stop-marker-stop-2'));

    await screen.findByText(/Alex Driver/);

    await waitFor(() => {
      expect(mockMapMethods.animateCamera).toHaveBeenLastCalledWith(
        {
          center: {
            latitude: 33.2,
            longitude: -117.3
          }
        },
        { duration: 500 }
      );
    });

    fireEvent.press(screen.getByText('Open details'));

    expect(navigation.navigate).toHaveBeenCalledWith('StopDetail', {
      stopId: 'stop-2'
    });
    expect(mockMapMethods.fitToCoordinates).not.toHaveBeenCalled();
  });

  it('hands off navigation to Google Maps and completes the selected stop', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue();

    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-stop-2'));

    await waitFor(() => {
      expect(mockMapMethods.animateCamera).toHaveBeenLastCalledWith(
        {
          center: {
            latitude: 33.2,
            longitude: -117.3
          }
        },
        { duration: 500 }
      );
    });

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

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

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
});
