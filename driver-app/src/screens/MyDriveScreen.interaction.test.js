import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import MyDriveScreen from './MyDriveScreen';
import api from '../services/api';
import * as Location from 'expo-location';
import * as auth from '../services/auth';
import { fetchDriverDriveRoute, getCachedDriverDriveRoute } from '../services/driverRouteCache';

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

jest.mock('../services/driverRouteCache', () => ({
  fetchDriverDriveRoute: jest.fn(),
  getCachedDriverDriveRoute: jest.fn()
}));

jest.mock('expo-location', () => ({
  Accuracy: {
    BestForNavigation: 6,
    High: 4,
    Highest: 5
  },
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn()
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
    Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
    auth.getClockInTime.mockResolvedValue(null);
    auth.getPinColorMode.mockResolvedValue('sid');
    auth.removeClockInTime.mockResolvedValue();
    auth.saveClockInTime.mockResolvedValue();
    getCachedDriverDriveRoute.mockResolvedValue(null);
    fetchDriverDriveRoute.mockResolvedValue({
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
            sequence_order: 100,
            address: '200 Oak St, Escondido, CA',
            lat: 33.2,
            lng: -117.3,
            status: 'pending',
            stop_type: 'delivery',
            contact_name: 'Alex Driver',
            packages: [{ id: 'pkg-1', requires_signature: true }]
          }
        ]
      }
    });

    api.get.mockImplementation((url) => {
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
    expect(screen.getByTestId('signature-badge-stop-2')).toBeTruthy();
    expect(screen.getByText('Signature required')).toBeTruthy();

    expect(mockMapMethods.animateCamera).not.toHaveBeenCalled();
    expect(mockMapMethods.animateToRegion).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Center on my location'));

    expect(mockMapMethods.animateCamera).toHaveBeenCalledWith(
      {
        center: {
          latitude: 33.12,
          longitude: -117.21
        },
        zoom: 17
      },
      { duration: 500 }
    );

    fireEvent.press(screen.getByTestId('selected-stop-card-action'));

    expect(navigation.navigate).toHaveBeenCalledWith('StopDetail', {
      stopId: 'stop-2'
    });
    expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledTimes(initialFitCallCount);
  });

  it('shows the dispatch waiting state when the route is staged but not yet live', async () => {
    fetchDriverDriveRoute.mockResolvedValue({
      route: null,
      driver_day: {
        status: 'awaiting_dispatch'
      }
    });

    api.get.mockImplementation((url) => {
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

  it('renders a cached drive route while the fresh route is still loading', async () => {
    let resolveFreshRoute;
    getCachedDriverDriveRoute.mockResolvedValue({
      route: {
        id: 'route-cached',
        stops_per_hour: 9,
        stops: [
          {
            id: 'cached-stop-1',
            sequence_order: 1,
            address: '300 Cached Ave, Escondido, CA',
            lat: 33.4,
            lng: -117.4,
            status: 'pending',
            stop_type: 'delivery',
            packages: []
          }
        ]
      },
      driver_day: {
        status: 'dispatched'
      }
    });
    fetchDriverDriveRoute.mockReturnValue(new Promise((resolve) => {
      resolveFreshRoute = resolve;
    }));

    const screen = await renderAndFlush();

    await waitFor(() => {
      expect(screen.getByTestId('stop-marker-stop:cached-stop-1')).toBeTruthy();
    });

    await act(async () => {
      resolveFreshRoute({
        route: {
          id: 'route-cached',
          stops_per_hour: 9,
          stops: []
        }
      });
      await Promise.resolve();
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

  it('dismisses the selected stop card and keeps map actions working after another stop is selected', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue();

    api.patch.mockResolvedValue({ data: {} });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-2'));
    await screen.findByText('Alex Driver');
    const fitCallCountBeforeClose = mockMapMethods.fitToCoordinates.mock.calls.length;
    const animateCameraCallCountBeforeClose = mockMapMethods.animateCamera.mock.calls.length;
    const animateToRegionCallCountBeforeClose = mockMapMethods.animateToRegion.mock.calls.length;
    const navButtonStyle = StyleSheet.flatten(screen.getByTestId('selected-stop-nav-button').props.style);
    const closeButtonStyle = StyleSheet.flatten(screen.getByTestId('selected-stop-close-button').props.style);

    expect(navButtonStyle.minHeight).toBeGreaterThanOrEqual(44);
    expect(closeButtonStyle.height).toBeGreaterThanOrEqual(44);
    expect(closeButtonStyle.width).toBeGreaterThanOrEqual(44);

    fireEvent.press(screen.getByTestId('selected-stop-close-button'));

    await waitFor(() => {
      expect(screen.queryByText('Alex Driver')).toBeNull();
      expect(screen.queryByText('Nav')).toBeNull();
    });
    expect(openURLSpy).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(mockMapMethods.fitToCoordinates).toHaveBeenCalledTimes(fitCallCountBeforeClose);
    expect(mockMapMethods.animateCamera).toHaveBeenCalledTimes(animateCameraCallCountBeforeClose);
    expect(mockMapMethods.animateToRegion).toHaveBeenCalledTimes(animateToRegionCallCountBeforeClose);

    fireEvent.press(screen.getByTestId('stop-marker-stop:stop-1'));
    await screen.findByText('100 Main St, Escondido, CA');

    fireEvent.press(screen.getByTestId('selected-stop-nav-button'));

    await waitFor(() => {
      expect(openURLSpy).toHaveBeenCalledWith(
        'comgooglemaps://?daddr=100%20Main%20St%2C%20Escondido%2C%20CA&directionsmode=driving'
      );
    });

    fireEvent.press(screen.getByText('Complete'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/stop-1/complete', {
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
    fetchDriverDriveRoute.mockResolvedValue({
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
    });

    api.get.mockImplementation((url) => {
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

  it('opens a grouped pin as individual actionable stop cards and completes only the selected stop', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue();
    const groupedStops = [
      {
        id: 'group-stop-1',
        sequence_order: 12,
        sid: 'A12',
        address: '500 Same St, Escondido, CA',
        address_line2: 'Unit 1',
        lat: 33.3,
        lng: -117.4,
        status: 'pending',
        stop_type: 'delivery',
        contact_name: 'First Receiver',
        property_intel: {
          normalized_address: '500 same st'
        },
        packages: [{ id: 'pkg-a', requires_signature: true }]
      },
      {
        id: 'group-stop-2',
        sequence_order: 13,
        sid: 'B13',
        address: '500 Same St, Escondido, CA',
        address_line2: 'Unit 2',
        lat: 33.3001,
        lng: -117.4001,
        status: 'pending',
        stop_type: 'delivery',
        contact_name: 'Second Receiver',
        property_intel: {
          normalized_address: '500 same st'
        },
        packages: [{ id: 'pkg-b' }, { id: 'pkg-c' }]
      }
    ];

    fetchDriverDriveRoute.mockImplementation(() => Promise.resolve({
      route: {
        id: 'route-1',
        completed_stops: groupedStops.filter((stop) => stop.completed_at).length,
        total_stops: groupedStops.length,
        stops_per_hour: 12,
        stops: groupedStops.map((stop) => ({ ...stop }))
      }
    }));

    api.get.mockImplementation((url) => {
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

    api.patch.mockImplementation((url, payload) => {
      if (url === '/routes/stops/group-stop-1/complete') {
        Object.assign(groupedStops[0], {
          status: payload.status,
          completed_at: '2026-05-14T18:00:00.000Z'
        });
        return Promise.resolve({ data: {} });
      }

      return Promise.reject(new Error(`Unexpected PATCH ${url}`));
    });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-group:500 same st'));

    await screen.findByTestId('grouped-stop-card-group-stop-1');
    expect(screen.getByTestId('grouped-stop-card-group-stop-2')).toBeTruthy();
    expect(screen.getByText('Same address, separate stops')).toBeTruthy();
    expect(screen.getByText('Signature required')).toBeTruthy();
    expect(screen.getByText('2 stops at this address')).toBeTruthy();
    expect(screen.getByText('0 of 2 complete')).toBeTruthy();
    expect(screen.getByText('Total packages: 3')).toBeTruthy();
    expect(screen.getByText('Navigate')).toBeTruthy();
    expect(screen.getByText('Save pin')).toBeTruthy();
    expect(screen.getByText('Flag road')).toBeTruthy();
    expect(screen.getByText('Delivery intel')).toBeTruthy();
    expect(screen.getByText('Complete stops individually above.')).toBeTruthy();

    fireEvent.press(screen.getByText('Navigate'));
    await waitFor(() => {
      expect(openURLSpy).toHaveBeenCalledWith(
        'comgooglemaps://?daddr=500%20Same%20St%2C%20Escondido%2C%20CA&directionsmode=driving'
      );
    });

    fireEvent.press(screen.getByText('Delivery intel'));
    expect(navigation.navigate).toHaveBeenCalledWith('StopDetail', {
      stopId: 'group-stop-1'
    });

    fireEvent.press(screen.getByTestId('grouped-stop-complete-group-stop-1'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/group-stop-1/complete', {
        status: 'delivered'
      });
    });

    await waitFor(() => {
      expect(screen.getByText('1 of 2 complete')).toBeTruthy();
    });
    expect(screen.getByTestId('grouped-stop-card-group-stop-2')).toBeTruthy();
    expect(api.patch).not.toHaveBeenCalledWith('/routes/stops/group-stop-2/complete', expect.anything());

    openURLSpy.mockRestore();
    canOpenURLSpy.mockRestore();
  });

  it('adds grouped delivery and exception codes to the individual selected stop id', async () => {
    Alert.prompt = Alert.prompt || jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      if (Array.isArray(buttons)) {
        const codeButton = buttons.find((button) => button.text === 'Delivery code') || buttons.find((button) => button.text === 'Exception code');
        codeButton?.onPress?.();
      }
    });
    const promptSpy = jest.spyOn(Alert, 'prompt').mockImplementation((_title, _message, buttons) => {
      buttons[1].onPress(_title.includes('exception') ? '07' : '013');
    });

    const groupedStops = [
      {
        id: 'code-stop-1',
        sequence_order: 21,
        sid: 'C21',
        address: '600 Code St, Escondido, CA',
        address_line2: 'Unit 1',
        lat: 33.31,
        lng: -117.41,
        status: 'pending',
        stop_type: 'delivery',
        property_intel: {
          normalized_address: '600 code st'
        },
        packages: []
      },
      {
        id: 'code-stop-2',
        sequence_order: 22,
        sid: 'C22',
        address: '600 Code St, Escondido, CA',
        address_line2: 'Unit 2',
        lat: 33.3101,
        lng: -117.4101,
        status: 'pending',
        stop_type: 'delivery',
        property_intel: {
          normalized_address: '600 code st'
        },
        packages: []
      }
    ];

    fetchDriverDriveRoute.mockImplementation(() => Promise.resolve({
      route: {
        id: 'route-1',
        completed_stops: groupedStops.filter((stop) => stop.completed_at).length,
        total_stops: groupedStops.length,
        stops_per_hour: 12,
        stops: groupedStops.map((stop) => ({ ...stop }))
      }
    }));

    api.get.mockImplementation((url) => {
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

    api.patch.mockImplementation((url, payload) => {
      if (url === '/routes/stops/code-stop-1/complete') {
        Object.assign(groupedStops[0], {
          status: payload.status,
          delivery_type_code: payload.delivery_type_code,
          exception_code: payload.exception_code,
          completed_at: '2026-05-14T18:10:00.000Z'
        });
        return Promise.resolve({ data: {} });
      }

      if (url === '/routes/stops/code-stop-2/complete') {
        Object.assign(groupedStops[1], {
          status: payload.status,
          exception_code: payload.exception_code,
          completed_at: '2026-05-14T18:12:00.000Z'
        });
        return Promise.resolve({ data: {} });
      }

      return Promise.reject(new Error(`Unexpected PATCH ${url}`));
    });

    const screen = await renderAndFlush();

    fireEvent.press(screen.getByTestId('stop-marker-group:600 code st'));
    await screen.findByTestId('grouped-stop-card-code-stop-1');

    fireEvent.press(screen.getByTestId('grouped-stop-add-code-code-stop-1'));
    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/code-stop-1/complete', {
        status: 'delivered',
        delivery_type_code: '013',
        exception_code: null
      });
    });
    await waitFor(() => {
      expect(screen.getByText('1 of 2 complete')).toBeTruthy();
    });

    alertSpy.mockImplementation((_title, _message, buttons) => {
      if (Array.isArray(buttons)) {
        buttons.find((button) => button.text === 'Exception code')?.onPress?.();
      }
    });
    fireEvent.press(screen.getByTestId('grouped-stop-add-code-code-stop-2'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/code-stop-2/complete', {
        status: 'attempted',
        exception_code: '07'
      });
    });

    promptSpy.mockRestore();
    alertSpy.mockRestore();
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

    fetchDriverDriveRoute
      .mockRejectedValueOnce({
        response: {
          data: {
            error: 'Route service down'
          }
        }
      })
      .mockResolvedValue({
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
      });

    api.get.mockImplementation((url) => {
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

  it('offers break and lunch from the break button after clock-in', async () => {
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

    fireEvent.press(screen.getByText('Break'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Start break',
        'Choose the type of break you are taking.',
        expect.arrayContaining([
          expect.objectContaining({ text: 'Break' }),
          expect.objectContaining({ text: 'Lunch' }),
          expect.objectContaining({ text: 'Cancel' })
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
