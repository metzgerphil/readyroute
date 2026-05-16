import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerVehiclesScreen, {
  filterVehicles,
  formatDate,
  formatMileage,
  getAssignedDriverLabel,
  getLastServiceSummary,
  getRegistrationStatus,
  getStatusMeta,
  getTodayDateParam,
  getVehicleDescription,
  getVehicleForm
} from './ManagerVehiclesScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn()
  }
}));

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

describe('ManagerVehiclesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats vehicle fields from backend data', () => {
    const vehicle = {
      current_mileage: 12345,
      make: 'Ford',
      model: 'Transit',
      name: 'V-42',
      plate: 'ABC123',
      registration_expiration: '2026-12-31',
      today_assignment: {
        driver_name: 'Luis Perez',
        work_area_name: '816'
      },
      year: 2022
    };

    expect(formatDate('2026-05-08')).toBe('May 8, 2026');
    expect(formatMileage(12345)).toBe('12,345 miles');
    expect(getVehicleDescription(vehicle)).toBe('Ford Transit 2022');
    expect(getRegistrationStatus(vehicle)).toContain('2026');
    expect(getAssignedDriverLabel(vehicle)).toBe('Luis Perez');
    expect(getStatusMeta(vehicle).label).toBe('Assigned');
    expect(getLastServiceSummary({ latest_maintenance: { service_date: '2026-04-01', service_type: 'Oil Change' } })).toEqual({
      dateLabel: 'Apr 1, 2026',
      detailLabel: 'Oil Change'
    });
    expect(getVehicleForm(vehicle)).toMatchObject({
      name: 'V-42',
      current_mileage: '12345'
    });
  });

  it('loads compact vehicle rows from backend', async () => {
    api.get.mockResolvedValue({
      data: {
        vehicles: [
          {
            id: 'vehicle-1',
            name: 'V-42',
            make: 'Ford',
            model: 'Transit',
            year: 2022,
            plate: 'ABC123',
            registration_expiration: '2026-12-31',
            current_mileage: 12345,
            latest_maintenance: {
              service_date: '2026-04-01',
              service_type: 'Oil Change'
            },
            today_assignment: {
              driver_name: 'Luis Perez',
              work_area_name: '816'
            }
          }
        ]
      }
    });

    const screen = render(
      <ManagerVehiclesScreen identity={{ companyName: 'Bridge Transportation Inc.' }} />
    );

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    expect(api.get).toHaveBeenCalledWith('/vehicles', { authMode: 'manager' });
    expect(screen.getByText('Bridge Transportation Inc.')).toBeTruthy();
    expect(screen.getByText('Ford Transit 2022')).toBeTruthy();
    expect(screen.getByText('12,345 miles')).toBeTruthy();
    expect(screen.queryByText('Oil Change')).toBeNull();
    expect(screen.getByText('Luis Perez')).toBeTruthy();
    expect(screen.getByText('816')).toBeTruthy();
    expect(screen.queryByText('Route 816')).toBeNull();
    expect(screen.getByPlaceholderText('Search vehicles by ID or description')).toBeTruthy();
  });

  it('filters vehicles by status and search text', () => {
    const vehicles = [
      { name: 'V-42', make: 'Ford', model: 'Transit', year: 2022, plate: 'ABC', registration_expiration: '2026-12-31' },
      { name: 'V-99', make: 'Ram', service_due: true }
    ];

    expect(filterVehicles(vehicles, 'transit', 'all')).toEqual([vehicles[0]]);
    expect(filterVehicles(vehicles, '', 'maintenance')).toEqual([vehicles[1]]);
    expect(filterVehicles(vehicles, '', 'available')).toEqual([vehicles[0]]);
  });

  it('edits a vehicle using the existing vehicle endpoint', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          vehicles: [
            {
              id: 'vehicle-1',
              name: 'V-42',
              make: 'Ford',
              model: 'Transit',
              year: 2022,
              plate: 'ABC123',
              registration_expiration: '2026-12-31',
              current_mileage: 12345,
              notes: ''
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          vehicles: []
        }
      });
    api.put.mockResolvedValue({ data: { ok: true } });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByText('Edit Vehicle')).toBeTruthy();
    fireEvent.changeText(screen.getByDisplayValue('12345'), '13000');
    fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/vehicle-1', expect.objectContaining({
        current_mileage: 13000,
        name: 'V-42',
        year: 2022
      }), {
        authMode: 'manager'
      });
    });
  });

  it('keeps service actions in overflow and saves service records', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          vehicles: [
            {
              id: 'vehicle-1',
              name: 'V-42',
              make: 'Ford',
              model: 'Transit',
              year: 2022,
              plate: 'ABC123',
              registration_expiration: '2026-12-31',
              current_mileage: 12345
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          vehicles: []
        }
      });
    api.post.mockResolvedValue({ data: { ok: true } });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('•••'));
    expect(screen.getByText('Log Maintenance')).toBeTruthy();
    expect(screen.getByText('View History')).toBeTruthy();

    fireEvent.press(screen.getByText('Log Maintenance'));
    fireEvent.changeText(screen.getByPlaceholderText('Optional notes'), 'Brake pads replaced');
    fireEvent.changeText(screen.getAllByPlaceholderText('Optional')[0], 'Ready Shop');
    fireEvent.press(screen.getAllByText('Log Maintenance').at(-1));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/vehicles/vehicle-1/maintenance', expect.objectContaining({
        description: 'Brake pads replaced',
        mileage_at_service: 12345,
        service_date: getTodayDateParam(),
        vendor_name: 'Ready Shop'
      }), {
        authMode: 'manager'
      });
    });
  });

  it('lets managers save a confirmed lower odometer override', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          vehicles: [
            {
              id: 'vehicle-1',
              name: 'V-42',
              make: 'Ford',
              model: 'Transit',
              year: 2022,
              plate: 'ABC123',
              registration_expiration: '2026-12-31',
              current_mileage: 12345
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          vehicles: []
        }
      });
    api.post.mockResolvedValue({ data: { ok: true } });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Odometer'));
    expect(screen.getByText('Edit Odometer')).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue('12345'), '12000');
    expect(screen.getByText('This is lower than the current odometer reading. Only continue if you are correcting an error.')).toBeTruthy();

    fireEvent.press(screen.getByText('I understand and want to save this correction.'));
    fireEvent.changeText(screen.getByPlaceholderText('Reason for manager override'), 'Correcting typo');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/vehicles/vehicle-1/odometer', {
        odometer_reading: 12000,
        notes: 'Correcting typo'
      }, {
        authMode: 'manager'
      });
    });
  });

  it('loads service history from the existing endpoint', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          vehicles: [
            {
              id: 'vehicle-1',
              name: 'V-42',
              make: 'Ford',
              model: 'Transit',
              year: 2022,
              plate: 'ABC123',
              registration_expiration: '2026-12-31'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          maintenance: [
            {
              id: 'maint-1',
              description: 'Oil and filter',
              mileage_at_service: 12000,
              service_date: '2026-04-01',
              service_type: 'Oil Change'
            }
          ]
        }
      });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('•••'));
    fireEvent.press(screen.getByText('View History'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/vehicle-1/maintenance', { authMode: 'manager' });
      expect(screen.getByText('Oil and filter')).toBeTruthy();
    });
  });
});
