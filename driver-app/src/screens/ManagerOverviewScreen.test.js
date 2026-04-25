import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerOverviewScreen, {
  formatOperationsDate,
  formatSyncLabel,
  getTodayOperationsDate,
  shiftOperationsDate
} from './ManagerOverviewScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn()
  }
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { Pressable, View } = require('react-native');

  function MockMapView({ children, testID }) {
    return <View testID={testID}>{children}</View>;
  }

  function Marker({ children, onPress, testID }) {
    return (
      <Pressable onPress={onPress} testID={testID}>
        {children}
      </Pressable>
    );
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
    SafeAreaView: ({ children }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    })
  };
});

describe('ManagerOverviewScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats the last sync label safely', () => {
    expect(formatSyncLabel(null)).toBe('Waiting for route sync');
    expect(formatSyncLabel('invalid')).toBe('Waiting for route sync');
    expect(formatSyncLabel('2026-04-23T15:30:00.000Z')).toMatch(/Last sync/);
  });

  it('formats and shifts the selected operations date safely', () => {
    expect(getTodayOperationsDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatOperationsDate('2026-04-23')).toMatch(/Apr|Thu|23/);
    expect(shiftOperationsDate('2026-04-23', 1)).toBe('2026-04-24');
  });

  it('loads the manager routes map with manager auth mode and opens a route from the map marker', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/manager/routes') {
        return Promise.resolve({
          data: {
            sync_status: {
              routes_today: 4,
              routes_assigned: 2,
              last_sync_at: '2026-04-23T15:30:00.000Z'
            },
            routes: [
              {
                id: 'route-1',
                driver_name: 'Luis',
                work_area_name: '816',
                vehicle_name: 'Van 4',
                total_stops: 14,
                completed_stops: 9,
                delivered_packages: 55,
                total_packages: 71,
                status: 'in_progress',
                stops_per_hour: 14,
                is_online: true,
                last_position: {
                  lat: 33.12,
                  lng: -117.08,
                  timestamp: '2026-04-23T15:25:00.000Z'
                },
                stops: [
                  {
                    id: 'stop-1',
                    sequence_order: 1,
                    address: '100 Main St',
                    lat: 33.11,
                    lng: -117.09,
                    status: 'delivered'
                  },
                  {
                    id: 'stop-2',
                    sequence_order: 2,
                    address: '200 Main St',
                    lat: 33.13,
                    lng: -117.07,
                    status: 'pending'
                  }
                ]
              },
              {
                id: 'route-2',
                driver_name: 'Ava',
                work_area_name: '901',
                vehicle_name: 'Van 8',
                total_stops: 10,
                completed_stops: 3,
                delivered_packages: 18,
                total_packages: 31,
                status: 'in_progress',
                stops_per_hour: 9,
                is_online: false,
                last_position: {
                  lat: 33.32,
                  lng: -117.28,
                  timestamp: '2026-04-23T15:00:00.000Z'
                },
                stops: [
                  {
                    id: 'stop-3',
                    sequence_order: 1,
                    address: '300 Oak Ave',
                    lat: 33.31,
                    lng: -117.27,
                    status: 'pending'
                  }
                ]
              }
            ]
          }
        });
      }

      if (url === '/manager/routes/route-1/stops') {
        return Promise.resolve({
          data: {
            route: {
              id: 'route-1',
              work_area_name: '816',
              driver_name: 'Luis',
              vehicle_name: 'Van 4',
              total_stops: 14,
              completed_stops: 9,
              stops_per_hour: 14
            },
            stops: [
              {
                id: 'stop-1',
                sequence_order: 1,
                address: '100 Main St',
                contact_name: 'Acme Receiving',
                status: 'delivered',
                packages: [{ id: 'pkg-1', requires_signature: true }]
              },
              {
                id: 'stop-2',
                sequence_order: 2,
                address: '200 Main St',
                contact_name: 'Warehouse',
                status: 'pending',
                has_time_commit: true,
                packages: [{ id: 'pkg-2', requires_signature: false }]
              }
            ]
          }
        });
      }

      if (url === '/manager/routes/route-1/driver-position') {
        return Promise.resolve({
          data: {
            lat: 33.125,
            lng: -117.085,
            timestamp: new Date().toISOString(),
            driver_name: 'Luis'
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    const screen = render(
      <ManagerOverviewScreen
        navigation={{ navigate: jest.fn() }}
        onLogout={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Total routes')).toBeTruthy();
    });

    expect(api.get).toHaveBeenCalledWith('/manager/routes', {
      authMode: 'manager',
      params: {
        date: getTodayOperationsDate()
      }
    });
    expect(screen.getByTestId('manager-operations-map')).toBeTruthy();
    expect(screen.getByTestId('route-marker-route-1')).toBeTruthy();
    expect(screen.getByTestId('driver-marker-route-1')).toBeTruthy();
    expect(screen.queryByTestId('stop-marker-stop-1')).toBeNull();
    expect(screen.getByText('Total routes')).toBeTruthy();
    expect(screen.getByText('Package status')).toBeTruthy();

    fireEvent.press(screen.getByTestId('route-marker-route-1'));

    await waitFor(() => {
      expect(screen.getByTestId('stop-marker-stop-1')).toBeTruthy();
    });

    expect(api.get).toHaveBeenCalledWith('/manager/routes/route-1/stops', {
      authMode: 'manager',
      params: {
        date: getTodayOperationsDate()
      }
    });
    expect(screen.getByText('Stops on route')).toBeTruthy();
    expect(screen.getByText('100 Main St')).toBeTruthy();
    expect(screen.getByText(/GPS live now|Driver seen/)).toBeTruthy();
    expect(screen.getByText(/Exceptions 0/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('stop-marker-stop-2'));

    await waitFor(() => {
      expect(screen.getByTestId('selected-stop-card-stop-2')).toBeTruthy();
    });
  });

  it('ignores a stale route date when entering manager overview without a selected route', async () => {
    api.get.mockResolvedValue({
      data: {
        sync_status: {
          routes_today: 0,
          routes_assigned: 0,
          last_sync_at: '2026-04-24T13:30:00.000Z'
        },
        routes: []
      }
    });

    render(
      <ManagerOverviewScreen
        navigation={{ navigate: jest.fn() }}
        onLogout={jest.fn()}
        route={{
          params: {
            date: '2026-04-23'
          }
        }}
      />
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/manager/routes', {
        authMode: 'manager',
        params: {
          date: getTodayOperationsDate()
        }
      });
    });
  });

  it('shows a retry state when the route request fails', async () => {
    api.get.mockRejectedValue({
      response: {
        data: {
          error: 'Failed to load manager routes'
        }
      }
    });

    const screen = render(
      <ManagerOverviewScreen
        navigation={{ navigate: jest.fn() }}
        onLogout={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Operations unavailable')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
