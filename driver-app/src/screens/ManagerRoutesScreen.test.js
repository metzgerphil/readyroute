import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerRoutesScreen, { formatGpsFreshness, formatStopsPerHour, getTodayDateParam } from './ManagerRoutesScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn()
  }
}));

describe('ManagerRoutesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats the current date for the routes query', () => {
    expect(getTodayDateParam()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatStopsPerHour(null)).toBe('-- stops/hr');
    expect(formatStopsPerHour(12)).toBe('12 stops/hr');
    expect(
      formatGpsFreshness({
        is_online: false,
        last_position: null
      })
    ).toBe('GPS unavailable');
  });

  it('loads route cards with manager auth mode', async () => {
    api.get.mockResolvedValue({
      data: {
        sync_status: {
          routes_today: 3,
          routes_assigned: 2
        },
        routes: [
          {
            id: 'route-1',
            work_area_name: '816',
            driver_name: 'Luis Perez',
            vehicle_name: 'Truck 12',
            completed_stops: 8,
            total_stops: 14,
            delivered_packages: 23,
            total_packages: 31,
            stops_per_hour: 11.5,
            time_commits_completed: 2,
            time_commits_total: 3,
            status: 'in_progress',
            is_online: true,
            last_position: {
              timestamp: new Date().toISOString()
            }
          }
        ]
      }
    });

    const navigation = {
      navigate: jest.fn()
    };
    const screen = render(<ManagerRoutesScreen navigation={navigation} />);

    await waitFor(() => {
      expect(screen.getByText('Route 816')).toBeTruthy();
    });

    expect(api.get).toHaveBeenCalledWith('/manager/routes', {
      authMode: 'manager',
      params: {
        date: getTodayDateParam()
      }
    });
    expect(screen.getByText('Refresh Routes')).toBeTruthy();
    expect(screen.getByText('23/31')).toBeTruthy();
    expect(screen.getByText('11.5 stops/hr')).toBeTruthy();
    expect(screen.getByText(/GPS live/)).toBeTruthy();
    expect(screen.getByLabelText('Route 816 actions')).toBeTruthy();

    fireEvent.press(screen.getByText('Route 816'));
    expect(navigation.navigate).toHaveBeenCalledWith('ManagerOverview', {
      selectedRouteId: 'route-1',
      date: getTodayDateParam()
    });
  });

  it('retries when the routes request fails', async () => {
    api.get.mockRejectedValue({
      response: {
        data: {
          error: 'Failed to load routes'
        }
      }
    });

    const screen = render(<ManagerRoutesScreen />);

    await waitFor(() => {
      expect(screen.getByText('Routes unavailable')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Retry'));
    });

    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
