import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerDashboardScreen, { buildDashboardStats, formatDashboardDate, getWorkspaceDisplayName } from './ManagerDashboardScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn()
  }
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    SafeAreaView: ({ children }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
  };
});

describe('ManagerDashboardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats dashboard dates with ordinal days', () => {
    expect(formatDashboardDate('2026-05-08')).toBe('May 8th, 2026');
  });

  it('summarizes dashboard route data with operations-only metrics', () => {
    expect(buildDashboardStats([
      {
        driver_name: 'Luis',
        completed_stops: 4,
        total_stops: 10,
        delivery_stops: 9,
        delivery_stops_completed: 3,
        delivered_packages: 7,
        total_packages: 12,
        pickup_stop_count: 2,
        pickup_stops_completed: 1,
        exception_count: 1
      }
    ], { routes_today: 1 }).exceptions).toBe(1);
  });

  it('uses the active CSA name instead of a placeholder workspace label', () => {
    expect(getWorkspaceDisplayName('Current CSA', 'North Valley CSA')).toBe('North Valley CSA');
    expect(getWorkspaceDisplayName(null, '')).toBe('CSA workspace');
  });

  it('renders the current CSA name from the CSA workspace endpoint', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/manager/csas') {
        return Promise.resolve({
          data: {
            current_csa: {
              id: 'acct-1',
              company_name: 'North Valley CSA',
              is_current: true
            },
            csas: []
          }
        });
      }

      return Promise.resolve({
        data: {
          account: {
            company_name: null
          },
          sync_status: {
            routes_today: 0,
            drivers_on_road: 0
          },
          routes: []
        }
      });
    });

    const screen = render(
      <ManagerDashboardScreen
        identity={{ companyName: 'Current CSA' }}
        navigation={{ navigate: jest.fn() }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('North Valley CSA')).toBeTruthy();
    });

    expect(screen.queryByText('Current CSA')).toBeNull();
  });

  it('renders operational dashboard cards and navigates to map and routes', async () => {
    api.get.mockResolvedValue({
      data: {
        sync_status: {
          routes_today: 2,
          drivers_on_road: 2
        },
        routes: [
          {
            id: 'route-1',
            work_area_name: '816',
            driver_name: 'Luis Perez',
            vehicle_name: 'Truck 12',
            completed_stops: 8,
            total_stops: 14,
            delivery_stops: 12,
            delivery_stops_completed: 7,
            delivered_packages: 23,
            total_packages: 31,
            pickup_stop_count: 2,
            pickup_stops_completed: 1,
            stops_per_hour: 11.5,
            exception_count: 1,
            status: 'in_progress'
          },
          {
            id: 'route-2',
            work_area_name: '901',
            driver_name: 'Ava Lee',
            vehicle_name: 'Truck 8',
            completed_stops: 3,
            total_stops: 10,
            delivery_stops: 10,
            delivery_stops_completed: 3,
            delivered_packages: 12,
            total_packages: 18,
            stops_per_hour: 9,
            exception_count: 0,
            status: 'pending'
          }
        ]
      }
    });
    const navigation = { navigate: jest.fn() };
    const screen = render(
      <ManagerDashboardScreen
        identity={{ companyName: 'Bridge Transportation Inc.' }}
        navigation={navigation}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('ReadyRoute')).toBeTruthy();
      expect(screen.getByText('Bridge Transportation Inc.')).toBeTruthy();
    });

    expect(screen.getByText('Routes')).toBeTruthy();
    expect(screen.getByText('Drivers')).toBeTruthy();
    expect(screen.getByText('Exceptions')).toBeTruthy();
    expect(screen.queryByText(/GPS stale/i)).toBeNull();
    expect(screen.getByText('Deliveries')).toBeTruthy();
    expect(screen.getAllByText('Packages').length).toBeGreaterThan(0);
    expect(screen.getByText('Pickups')).toBeTruthy();
    expect(screen.getByText('One or more routes have exceptions.')).toBeTruthy();
    expect(screen.getByText('Route 816')).toBeTruthy();

    fireEvent.press(screen.getByText('View Fleet Map'));
    expect(navigation.navigate).toHaveBeenCalledWith('ManagerMap', expect.objectContaining({ date: expect.any(String) }));

    fireEvent.press(screen.getByText('View All Routes'));
    expect(navigation.navigate).toHaveBeenCalledWith('ManagerRoutes');
  });

  it('renders a clean empty state without FCC copy', async () => {
    api.get.mockResolvedValue({
      data: {
        account: {
          company_name: 'Bridge Transportation Inc.'
        },
        sync_status: {
          routes_today: 0,
          drivers_on_road: 0
        },
        routes: []
      }
    });

    const screen = render(
      <ManagerDashboardScreen
        identity={{ companyName: null }}
        navigation={{ navigate: jest.fn() }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Bridge Transportation Inc.')).toBeTruthy();
      expect(screen.getByText('No active routes yet.')).toBeTruthy();
    });

    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText(/FCC connection required/i)).toBeNull();
    expect(screen.queryByText(/GPS stale/i)).toBeNull();
    expect(screen.queryByText('Add Routes')).toBeNull();
  });
});
