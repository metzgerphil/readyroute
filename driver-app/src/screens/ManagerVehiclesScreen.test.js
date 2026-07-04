import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';

import ManagerVehiclesScreen, {
  buildInspectionSummary,
  filterVehicles,
  formatDate,
  formatMileage,
  getAssignedDriverLabel,
  getDriverDisplayName,
  getInspectionAssignmentForm,
  getLastServiceSummary,
  getRegistrationStatus,
  getStatusMeta,
  getTodayDateParam,
  getVehicleDescription,
  getVehicleForm,
  buildVehiclePayload
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

jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: {
    Images: 'Images'
  },
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn()
}));

describe('ManagerVehiclesScreen', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: true });
  });

  it('formats vehicle fields from backend data', () => {
    const vehicle = {
      current_mileage: 12345,
      make: 'Ford',
      model: 'Transit',
      name: 'V-42',
      plate: 'ABC123',
      registration_expiration: '2026-12-31',
      insurance_expiration: '2027-01-31',
      truck_type: 'P1100',
      fuel_type: 'Gas',
      today_assignment: {
        driver_name: 'Luis Perez',
        work_area_name: '816'
      },
      year: 2022
    };

    expect(formatDate('2026-05-08')).toBe('May 8, 2026');
    expect(formatMileage(12345)).toBe('12,345 miles');
    expect(getVehicleDescription(vehicle)).toBe('Ford Transit 2022 • P1100');
    expect(getVehicleDescription({ make: 'Ford', model: 'Transit', year: 2022 })).toBe('Ford Transit 2022');
    expect(getRegistrationStatus(vehicle)).toContain('2026');
    expect(getAssignedDriverLabel(vehicle)).toBe('Luis Perez');
    expect(getStatusMeta(vehicle).label).toBe('Assigned');
    expect(getLastServiceSummary({ latest_maintenance: { service_date: '2026-04-01', service_type: 'Oil Change' } })).toEqual({
      dateLabel: 'Apr 1, 2026',
      detailLabel: 'Oil Change'
    });
    expect(getVehicleForm(vehicle)).toMatchObject({
      name: 'V-42',
      truck_type: 'P1100',
      fuel_type: 'Gas',
      insurance_expiration: '2027-01-31',
      current_mileage: '12345'
    });
    expect(getDriverDisplayName({ name: 'Alex Driver', fedex_driver_id: 'FX123' })).toBe('Alex Driver • #FX123');
    expect(getInspectionAssignmentForm({ id: 'vehicle-1' }, { id: 'driver-1' })).toMatchObject({
      vehicle_id: 'vehicle-1',
      driver_id: 'driver-1',
      priority: 'normal',
      require_before_route_start: false
    });
    expect(buildVehiclePayload({
      ...getVehicleForm(vehicle),
      truck_type: 'P700',
      fuel_type: 'Diesel',
      plate: '329310'
    })).toMatchObject({
      name: '329310',
      plate: '329310',
      truck_type: 'P700',
      fuel_type: 'Diesel'
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
            truck_type: 'P1100',
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
    expect(screen.getByText('Ford Transit 2022 • P1100')).toBeTruthy();
    expect(screen.getByText('12,345 miles')).toBeTruthy();
    expect(screen.getByText('Oil Change')).toBeTruthy();
    expect(screen.getByText('816')).toBeTruthy();
    expect(screen.getByText('Edit')).toBeTruthy();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.queryByText('Odometer')).toBeNull();
    expect(screen.queryByText('More')).toBeNull();
    expect(screen.queryByText('Route 816')).toBeNull();
    expect(screen.getByPlaceholderText('Search vehicles by ID or description')).toBeTruthy();
  });

  it('lets managers assign a vehicle inspection to a driver from the app', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/vehicles') {
        return Promise.resolve({
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
                truck_type: 'P1100',
                current_mileage: 12345
              }
            ]
          }
        });
      }

      if (url === '/manager/drivers') {
        return Promise.resolve({
          data: {
            drivers: [
              {
                id: 'driver-1',
                name: 'Alex Driver',
                email: 'alex@example.com',
                fedex_driver_id: 'FX123',
                is_active: true
              }
            ]
          }
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
    api.post.mockResolvedValue({
      data: {
        assignment: {
          id: 'assignment-1'
        }
      }
    });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Assign'));

    await waitFor(() => {
      expect(screen.getByText('Alex Driver • #FX123')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Alex Driver • #FX123'));
    fireEvent.press(screen.getByText('Urgent'));
    fireEvent.changeText(screen.getByPlaceholderText('Optional driver note'), 'Inspect before using as a spare.');
    fireEvent.press(screen.getByText('Send Assignment'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/vehicles/inspection-assignments', {
        vehicle_id: 'vehicle-1',
        driver_id: 'driver-1',
        due_date: getTodayDateParam(),
        priority: 'urgent',
        note: 'Inspect before using as a spare.',
        require_before_route_start: false
      }, {
        authMode: 'manager'
      });
    });
  });

  it('shows manager maintenance program, records, inspections, and settings in app tabs', async () => {
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
          settings: [
            {
              service_type: 'Oil Change',
              is_enabled: true,
              default_interval_miles: 10000,
              default_interval_days: 180
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          maintenance: [
            {
              id: 'maint-1',
              vehicle_name: 'V-42',
              service_date: '2026-04-01',
              service_type: 'Oil Change',
              vendor_name: 'Ready Shop',
              mileage_at_service: 12000,
              description: 'Oil and filter'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          setting: {
            maintenance_requirement_mode: 'option_1',
            weekly_inspection_day: 'Monday',
            custom_weekly_requirements: {
              require_manager_review_for_reported_issues: true
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          schedule: {
            maintenance_warning_miles: 1000,
            maintenance_warning_days: 14,
            document_warning_days: 30
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          template: {
            fields: [
              { id: 'truck_number', label: 'Vehicle ID', enabled: true },
              { id: 'driver_notes', label: 'Driver notes', enabled: true }
            ]
          }
        }
      })
      .mockResolvedValueOnce({ data: { inspections: [] } });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getAllByText('Maintenance')[0]);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/settings/maintenance', { authMode: 'manager' });
      expect(api.get).toHaveBeenCalledWith('/vehicles/maintenance-records', { authMode: 'manager' });
      expect(api.get).toHaveBeenCalledWith('/vehicles/inspections', { authMode: 'manager' });
      expect(screen.getByText('Maintenance Records')).toBeTruthy();
      expect(screen.getByText('Vehicle V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Inspections'));

    await waitFor(() => {
      expect(screen.getByText('Inspection Records')).toBeTruthy();
      expect(screen.getByText('No inspection records yet.')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Maintenance Program')).toBeTruthy();
      expect(screen.getByText('Vehicle Settings')).toBeTruthy();
      expect(screen.getByText('Vehicle Check Requirements')).toBeTruthy();
      expect(screen.getByText('Reminder Schedule')).toBeTruthy();
      expect(screen.getAllByText('Checklist Template').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('saves maintenance requirement choices from the app settings tab', async () => {
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
      .mockResolvedValueOnce({ data: { settings: [] } })
      .mockResolvedValueOnce({ data: { maintenance: [] } })
      .mockResolvedValueOnce({
        data: {
          setting: {
            maintenance_requirement_mode: 'option_1',
            weekly_inspection_day: 'Monday'
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          schedule: {
            maintenance_warning_miles: 1000,
            maintenance_warning_days: 14,
            document_warning_days: 30
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          template: {
            fields: []
          }
        }
      })
      .mockResolvedValueOnce({ data: { inspections: [] } });

    api.put.mockResolvedValue({
      data: {
        setting: {
          maintenance_requirement_mode: 'option_2',
          weekly_inspection_day: 'Wednesday',
          maintenance_warning_miles: 1000,
          maintenance_warning_days: 14,
          document_warning_days: 30
        }
      }
    });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getAllByText('Daily Odometer + Issue Note').length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.press(screen.getByText('Maintenance Requirements'));

    await waitFor(() => {
      expect(screen.getByText('Save Requirements')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Daily Odometer + Full Inspection'));
    fireEvent.press(screen.getAllByText('Wednesday')[0]);
    fireEvent.press(screen.getByText('Save Requirements'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/settings/maintenance-requirements', expect.objectContaining({
        maintenance_requirement_mode: 'option_2',
        weekly_inspection_day: 'Wednesday'
      }), {
        authMode: 'manager'
      });
    });
  });

  it('saves reminder schedule and checklist template changes from the app settings tab', async () => {
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
      .mockResolvedValueOnce({ data: { settings: [] } })
      .mockResolvedValueOnce({ data: { maintenance: [] } })
      .mockResolvedValueOnce({
        data: {
          setting: {
            maintenance_requirement_mode: 'option_1',
            weekly_inspection_day: 'Monday'
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          schedule: {
            weekly_inspection_day: 'Monday',
            maintenance_warning_miles: 1000,
            maintenance_warning_days: 14,
            document_warning_days: 30
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          template: {
            fields: [
              { id: 'truck_number', label: 'Vehicle ID', detail: 'Vehicle identifier', enabled: true },
              { id: 'driver_notes', label: 'Driver notes', detail: 'Free-text notes', enabled: true }
            ]
          }
        }
      })
      .mockResolvedValueOnce({ data: { inspections: [] } });

    api.put
      .mockResolvedValueOnce({
        data: {
          schedule: {
            weekly_inspection_day: 'Friday',
            maintenance_warning_miles: 1500,
            maintenance_warning_days: 14,
            document_warning_days: 30
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          template: {
            fields: [
              { id: 'truck_number', label: 'Vehicle ID', detail: 'Vehicle identifier', enabled: false },
              { id: 'driver_notes', label: 'Driver notes', detail: 'Free-text notes', enabled: true }
            ]
          }
        }
      });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Reminder Schedule')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Reminder Schedule'));

    await waitFor(() => {
      expect(screen.getByText('Save Schedule')).toBeTruthy();
    });

    fireEvent.press(screen.getAllByText('Friday').at(-1));
    fireEvent.changeText(screen.getByDisplayValue('1000'), '1500');
    fireEvent.press(screen.getByText('Save Schedule'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/settings/reminder-schedule', expect.objectContaining({
        weekly_inspection_day: 'Friday',
        maintenance_warning_miles: 1500
      }), {
        authMode: 'manager'
      });
    });

    fireEvent.press(screen.getByText('‹ Back to Settings'));
    fireEvent.press(screen.getAllByText('Checklist Template')[0]);

    await waitFor(() => {
      expect(screen.getByText('Save Template')).toBeTruthy();
    });

    fireEvent.press(screen.getAllByText('On')[0]);
    fireEvent.press(screen.getByText('Save Template'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/settings/checklist-template', {
        fields: expect.arrayContaining([
          expect.objectContaining({ id: 'date', enabled: false }),
          expect.objectContaining({ id: 'truck_number', enabled: true })
        ])
      }, {
        authMode: 'manager'
      });
    });
  });

  it('saves maintenance program category changes from the app maintenance tab', async () => {
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
          settings: [
            {
              service_type: 'Oil Change',
              is_enabled: true,
              default_interval_miles: 5000,
              default_interval_days: 180
            }
          ]
        }
      })
      .mockResolvedValueOnce({ data: { maintenance: [] } })
      .mockResolvedValueOnce({ data: { setting: { maintenance_requirement_mode: 'option_1', weekly_inspection_day: 'Monday' } } })
      .mockResolvedValueOnce({ data: { schedule: { weekly_inspection_day: 'Monday', maintenance_warning_miles: 1000, maintenance_warning_days: 14, document_warning_days: 30 } } })
      .mockResolvedValueOnce({ data: { template: { fields: [] } } })
      .mockResolvedValueOnce({ data: { inspections: [] } });

    api.put.mockResolvedValue({
      data: {
        settings: [
          {
            service_type: 'Oil Change',
            is_enabled: true,
            default_interval_miles: 6000,
            default_interval_days: 180
          }
        ]
      }
    });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Maintenance Program')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Maintenance Program'));

    await waitFor(() => {
      expect(screen.getByText('Save Maintenance Program')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByDisplayValue('5000'), '6000');
    fireEvent.press(screen.getByText('Save Maintenance Program'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/settings/maintenance', {
        settings: expect.arrayContaining([
          expect.objectContaining({
            service_type: 'Oil Change',
            default_interval_miles: 6000
          })
        ])
      }, {
        authMode: 'manager'
      });
    });
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
              truck_type: 'P1100',
              fuel_type: 'Gas',
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
    expect(screen.getByText('Edit Truck V-42')).toBeTruthy();
    expect(screen.getByText('Change information or add records.')).toBeTruthy();
    expect(screen.getByText('Update Odometer')).toBeTruthy();
    expect(screen.getByText('Edit Truck Info')).toBeTruthy();
    expect(screen.getByText('Log Maintenance')).toBeTruthy();
    expect(screen.getByText('Update Registration')).toBeTruthy();

    fireEvent.press(screen.getByText('Edit Truck Info'));
    expect(screen.getByText('Edit Vehicle')).toBeTruthy();
    expect(screen.getByText('Vehicle Type')).toBeTruthy();
    fireEvent.press(screen.getAllByText('P1200')[0]);
    fireEvent.press(screen.getAllByText('Diesel')[0]);
    fireEvent.changeText(screen.getByDisplayValue('12345'), '13000');
    fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/vehicle-1', expect.objectContaining({
        current_mileage: 13000,
        name: 'ABC123',
        plate: 'ABC123',
        fuel_type: 'Diesel',
        truck_type: 'P1200',
        year: 2022
      }), {
        authMode: 'manager'
      });
    });
  });

  it('opens edit actions and saves service records', async () => {
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

    fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByText('Edit Truck V-42')).toBeTruthy();
    expect(screen.getByText('Log Maintenance')).toBeTruthy();
    expect(screen.queryByText('Service History')).toBeNull();

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

    fireEvent.press(screen.getByText('Edit'));
    fireEvent.press(screen.getByText('Update Odometer'));
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

  it('lets managers run and save a vehicle inspection', async () => {
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
      .mockResolvedValueOnce({ data: { settings: [] } })
      .mockResolvedValueOnce({ data: { maintenance: [] } })
      .mockResolvedValueOnce({ data: { setting: { maintenance_requirement_mode: 'option_1', weekly_inspection_day: 'Monday' } } })
      .mockResolvedValueOnce({ data: { schedule: { weekly_inspection_day: 'Monday', maintenance_warning_miles: 1000, maintenance_warning_days: 14, document_warning_days: 30 } } })
      .mockResolvedValueOnce({
        data: {
          template: {
            fields: [
              { id: 'tires', label: 'Tires', enabled: true },
              { id: 'lights', label: 'Lights', enabled: true }
            ]
          }
        }
      })
      .mockResolvedValueOnce({ data: { vehicles: [] } })
      .mockResolvedValueOnce({ data: { settings: [] } })
      .mockResolvedValueOnce({ data: { maintenance: [] } })
      .mockResolvedValueOnce({ data: { setting: { maintenance_requirement_mode: 'option_1', weekly_inspection_day: 'Monday' } } })
      .mockResolvedValueOnce({ data: { schedule: { weekly_inspection_day: 'Monday', maintenance_warning_miles: 1000, maintenance_warning_days: 14, document_warning_days: 30 } } })
      .mockResolvedValueOnce({ data: { template: { fields: [] } } });
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
      if (url === '/vehicles/vehicle-1/inspection-photo') {
        return Promise.resolve({
          data: {
            photo: {
              url: 'https://cdn.readyroute.test/tire.jpg',
              storage_bucket: 'vehicle-inspection-photos',
              storage_path: 'acct-1/vehicle-1/manager-inspection/tires/tire.jpg',
              caption: null
            }
          }
        });
      }

      if (url === '/vehicles/vehicle-1/inspections') {
        return Promise.resolve({ data: { inspection: { id: 'inspection-1' } } });
      }

      return Promise.reject(new Error(`Unexpected POST ${url}`));
    });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Edit'));
    fireEvent.press(screen.getByText('Run Inspection'));

    await waitFor(() => {
      expect(screen.getByText('Run Inspection')).toBeTruthy();
      expect(screen.getByText('Tires')).toBeTruthy();
      expect(screen.getByText('Lights')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Mark Tires has an issue'));
    fireEvent.press(screen.getByText('Back Left'));
    fireEvent.press(screen.getByText('Low pressure'));
    fireEvent.press(screen.getByText('Maintenance Soon'));
    fireEvent.press(screen.getByText('Attach Photo'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/vehicles/vehicle-1/inspection-photo', expect.objectContaining({
        checklist_item_key: 'tires',
        image_base64: 'aW1hZ2U=',
        mime_type: 'image/jpeg',
        file_name: 'tire.jpg'
      }), {
        authMode: 'manager'
      });
      expect(screen.getByText('Photo 1 attached')).toBeTruthy();
    });

    fireEvent.changeText(screen.getByPlaceholderText('Optional notes or issue details'), 'Left rear tire needs review');
    fireEvent.press(screen.getByText('Save Inspection'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/vehicles/vehicle-1/inspections', expect.objectContaining({
        inspection_date: getTodayDateParam(),
        issue_note: 'Left rear tire needs review',
        odometer: 12345,
        items: expect.arrayContaining([
          expect.objectContaining({
            checklist_item_key: 'tires',
            status: 'issue',
            severity: 'maintenance_soon',
            issue_details: expect.objectContaining({
              positions: ['Back Left'],
              issue_types: ['Low pressure']
            }),
            photos: [
              expect.objectContaining({
                storage_bucket: 'vehicle-inspection-photos',
                storage_path: 'acct-1/vehicle-1/manager-inspection/tires/tire.jpg'
              })
            ]
          })
        ])
      }), {
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

    fireEvent.press(screen.getByText('Open'));
    expect(screen.getByText('Vehicle V-42')).toBeTruthy();
    expect(screen.getByText('Manager Actions')).toBeTruthy();
    expect(screen.getByText('Inspection History')).toBeTruthy();
    expect(screen.getByText('Odometer History')).toBeTruthy();
    expect(screen.getByText('Assignment History')).toBeTruthy();
    fireEvent.press(screen.getByText('Maintenance History'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/vehicle-1/maintenance', { authMode: 'manager' });
      expect(screen.getByText('Oil and filter')).toBeTruthy();
    });
  });

  it('loads inspection history from the vehicle history endpoint', async () => {
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
          inspections: [
            {
              id: 'inspection-1',
              inspection_date: '2026-06-02',
              inspection_type_label: 'Manager Inspection',
              status_label: 'Needs Review',
              odometer: 12345,
              failed_items_count: 1,
              issue_note: 'Light out'
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          inspection: {
            id: 'inspection-1',
            vehicle_id: 'vehicle-1',
            vehicle: {
              id: 'vehicle-1',
              name: 'V-42',
              vehicle_status: 'active'
            },
            inspection_date: '2026-06-02',
            inspection_type_label: 'Driver Inspection',
            status: 'urgent_manager_review',
            status_label: 'Urgent Manager Review',
            urgent_review: true,
            odometer: 12345,
            issue_note: 'Light out',
            driver: {
              name: 'Luis Perez'
            },
            items: [
              {
                id: 'item-1',
                checklist_item_key: 'tires',
                label: 'Tires',
                status: 'issue',
                severity: 'unsafe',
                issue_details: {
                  positions: ['Back Right'],
                  issue_types: ['Exposed cord']
                },
                photos: [
                  { url: 'https://cdn.readyroute.test/tire.jpg' }
                ]
              }
            ]
          }
        }
      });
    api.put.mockResolvedValue({
      data: {
        vehicle: {
          id: 'vehicle-1',
          vehicle_status: 'needs_repair'
        }
      }
    });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Open'));
    fireEvent.press(screen.getByText('Inspection History'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/vehicle-1/inspection-history', { authMode: 'manager' });
      expect(screen.getByText('Light out')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Open inspection'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/inspections/inspection-1', { authMode: 'manager' });
      expect(screen.queryByText('Inspection History')).toBeNull();
      expect(screen.getByText('Urgent manager review')).toBeTruthy();
      expect(screen.getByText(/Back Right/)).toBeTruthy();
      expect(screen.getByText(/Exposed cord/)).toBeTruthy();
      expect(screen.getByText(/Photo 1/)).toBeTruthy();
      expect(screen.getByText('Open photo')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Needs Repair'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/vehicle-1', {
        vehicle_status: 'needs_repair'
      }, {
        authMode: 'manager'
      });
    });
  });

  it('opens an inspection detail directly from notification navigation params', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/vehicles') {
        return Promise.resolve({
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
        });
      }

      if (url === '/vehicles/inspections/inspection-1') {
        return Promise.resolve({
          data: {
            inspection: {
              id: 'inspection-1',
              vehicle_id: 'vehicle-1',
              vehicle_name: 'V-42',
              inspection_type_label: 'Driver Inspection',
              inspection_date: '2026-06-27',
              submitted_at: '2026-06-27T16:11:00.000Z',
              submitted_by_driver: { name: 'Luis Perez' },
              odometer: 12345,
              status: 'manager_review_required',
              status_label: 'Manager Review Required',
              urgent_review: true,
              manager_review_required: true,
              items: [
                {
                  checklist_item_key: 'wipers',
                  label: 'Wipers',
                  status: 'issue',
                  severity: 'unsafe',
                  issue_details: {
                    position: 'Both',
                    issue_type: 'Not working'
                  }
                }
              ]
            }
          }
        });
      }

      return Promise.resolve({ data: {} });
    });

    const screen = render(
      <ManagerVehiclesScreen
        route={{
          params: {
            inspectionId: 'inspection-1',
            notificationId: 'notification-1',
            vehicleId: 'vehicle-1'
          }
        }}
      />
    );

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/inspections/inspection-1', { authMode: 'manager' });
      expect(screen.getByText('Urgent manager review')).toBeTruthy();
      expect(screen.getByText(/Both/)).toBeTruthy();
      expect(screen.getByText(/Not working/)).toBeTruthy();
    });
  });

  it('builds and copies an inspection summary', async () => {
    const clipboardSpy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
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
              current_mileage: 12345
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          inspections: [
            {
              id: 'inspection-1',
              inspection_date: '2026-06-02',
              inspection_type_label: 'Driver Inspection',
              odometer: 12345,
              failed_items_count: 1
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          inspection: {
            id: 'inspection-1',
            vehicle_name: 'V-42',
            inspection_date: '2026-06-02',
            inspection_type_label: 'Driver Inspection',
            status: 'manager_review_required',
            manager_review_required: true,
            odometer: 12345,
            issue_note: 'Please check before dispatch',
            submitted_by_driver: {
              name: 'Luis Perez'
            },
            items: [
              {
                id: 'item-1',
                checklist_item_key: 'coolant',
                label: 'Coolant',
                status: 'issue',
                severity: 'needs_maintenance_soon',
                issue_details: {
                  issue_type: 'Low'
                }
              }
            ]
          }
        }
      });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Open'));
    fireEvent.press(screen.getByText('Inspection History'));

    await waitFor(() => {
      expect(screen.getByText('Open inspection')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Open inspection'));

    await waitFor(() => {
      expect(screen.getByText('Copy Inspection Summary')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Copy Inspection Summary'));

    await waitFor(() => {
      expect(clipboardSpy).toHaveBeenCalledWith(expect.stringContaining('Inspection Summary'));
      expect(clipboardSpy.mock.calls[0][0]).toContain('Vehicle: V-42');
      expect(clipboardSpy.mock.calls[0][0]).toContain('1. Coolant');
      expect(clipboardSpy.mock.calls[0][0]).toContain('   Issue Type: Low');
      expect(screen.getByText('Inspection summary copied')).toBeTruthy();
    });

    expect(buildInspectionSummary({
      vehicle_name: 'V-42',
      inspection_date: '2026-06-02',
      submitted_by_driver: { name: 'Luis Perez' },
      odometer: 12345,
      status: 'manager_review_required',
      items: [
        {
          checklist_item_key: 'coolant',
          label: 'Coolant',
          status: 'issue',
          issue_details: { issue_type: 'Low' }
        }
      ]
    })).toContain('Submitted by: Luis Perez');

    clipboardSpy.mockRestore();
  });
});
