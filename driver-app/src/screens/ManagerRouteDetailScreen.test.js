import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerRouteDetailScreen from './ManagerRouteDetailScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn()
  }
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  function MockMapView({ children, testID }) {
    return <View testID={testID}>{children}</View>;
  }

  function Marker({ children, testID }) {
    return <View testID={testID}>{children}</View>;
  }

  return {
    __esModule: true,
    default: MockMapView,
    Marker,
    PROVIDER_GOOGLE: 'google'
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    SafeAreaView: ({ children }) => <View>{children}</View>
  };
});

describe('ManagerRouteDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads mobile route detail with map and compact stop list', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          route: {
            id: 'route-1',
            work_area_name: '816',
            driver_name: 'Luis Perez',
            vehicle_name: 'Truck 12',
            total_stops: 14,
            completed_stops: 8,
            stops_per_hour: 11.5
          },
          stops: [
            {
              id: 'stop-1',
              sequence_order: 1,
              address: '100 Main St',
              contact_name: 'Acme Receiving',
              status: 'pending',
              has_time_commit: true,
              ready_time: '09:00',
              close_time: '10:00',
              packages: [{ id: 'pkg-1', requires_signature: true }],
              lat: 33.11,
              lng: -117.09
            },
            {
              id: 'stop-2',
              sequence_order: 2,
              address: '200 Main St',
              contact_name: 'Warehouse',
              status: 'delivered',
              exception_code: '07',
              completed_at: '2026-04-23T15:00:00.000Z',
              packages: [{ id: 'pkg-2', requires_signature: false }],
              lat: 33.12,
              lng: -117.08
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          lat: 33.125,
          lng: -117.085,
          timestamp: new Date().toISOString(),
          driver_name: 'Luis Perez'
        }
      });

    const navigation = {
      goBack: jest.fn()
    };
    const screen = render(
      <ManagerRouteDetailScreen
        navigation={navigation}
        route={{
          params: {
            routeId: 'route-1',
            date: '2026-04-23'
          }
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Route 816')).toBeTruthy();
    });

    expect(api.get).toHaveBeenNthCalledWith(1, '/manager/routes/route-1/stops', {
      authMode: 'manager',
      params: {
        date: '2026-04-23'
      }
    });
    expect(api.get).toHaveBeenNthCalledWith(2, '/manager/routes/route-1/driver-position', {
      authMode: 'manager'
    });
    expect(screen.getByTestId('manager-route-detail-map')).toBeTruthy();
    expect(screen.getByText('Stop list')).toBeTruthy();
    expect(screen.getByText('100 Main St')).toBeTruthy();
    expect(screen.getByText('Time commit')).toBeTruthy();
    expect(screen.getByText('Signature')).toBeTruthy();

    fireEvent.press(screen.getByText('Back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('retries when route detail loading fails', async () => {
    api.get.mockRejectedValue({
      response: {
        data: {
          error: 'Failed to load route detail'
        }
      }
    });

    const screen = render(
      <ManagerRouteDetailScreen
        navigation={{ goBack: jest.fn() }}
        route={{
          params: {
            routeId: 'route-1',
            date: '2026-04-23'
          }
        }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Route detail unavailable')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });

    expect(api.get).toHaveBeenCalled();
  });
});
