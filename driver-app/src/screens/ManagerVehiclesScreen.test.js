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
    jest.resetAllMocks();
  });

  it('formats vehicle fields from backend data', () => {
    const vehicle = {
      current_mileage: 12345,
      make: 'Ford',
      model: 'Transit',
      name: 'V-42',
      plate: 'ABC123',
      registration_expiration: '2026-12-31',
      truck_type: 'P1100',
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
    expect(screen.getByText('View')).toBeTruthy();
    expect(screen.queryByText('Odometer')).toBeNull();
    expect(screen.queryByText('More')).toBeNull();
    expect(screen.queryByText('Route 816')).toBeNull();
    expect(screen.getByPlaceholderText('Search vehicles by ID or description')).toBeTruthy();
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
      });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getAllByText('Maintenance')[0]);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/settings/maintenance', { authMode: 'manager' });
      expect(api.get).toHaveBeenCalledWith('/vehicles/maintenance-records', { authMode: 'manager' });
      expect(screen.getByText('Maintenance Program')).toBeTruthy();
      expect(screen.getByText('Recent Maintenance Records')).toBeTruthy();
      expect(screen.getByText('Truck V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Inspections'));

    await waitFor(() => {
      expect(screen.getByText('Vehicle Check Requirements')).toBeTruthy();
      expect(screen.getByText('Checklist Template')).toBeTruthy();
      expect(screen.getByText('Vehicle ID')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Settings'));

    await waitFor(() => {
      expect(screen.getByText('Reminder Schedule')).toBeTruthy();
      expect(screen.getByText('Checklist Template')).toBeTruthy();
      expect(screen.getByText('Save Template')).toBeTruthy();
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
      });

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
      expect(screen.getByText('Daily Odometer + Issue Note')).toBeTruthy();
      expect(screen.getByText('Date')).toBeTruthy();
      expect(screen.getByText('Vehicle ID')).toBeTruthy();
      expect(screen.getByText('Driver notes')).toBeTruthy();
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
      });

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
      expect(screen.getByText('Vehicle ID')).toBeTruthy();
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
      .mockResolvedValueOnce({ data: { template: { fields: [] } } });

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

    fireEvent.press(screen.getAllByText('Maintenance')[0]);

    await waitFor(() => {
      expect(screen.getByText('Maintenance Program')).toBeTruthy();
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
    fireEvent.changeText(screen.getByDisplayValue('P1100'), 'P1200');
    fireEvent.changeText(screen.getByDisplayValue('12345'), '13000');
    fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/vehicles/vehicle-1', expect.objectContaining({
        current_mileage: 13000,
        name: 'ABC123',
        plate: 'ABC123',
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
    api.post.mockResolvedValue({ data: { inspection: { id: 'inspection-1' } } });

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

    fireEvent.press(screen.getAllByText('Issue')[0]);
    fireEvent.changeText(screen.getByPlaceholderText('Optional notes or issue details'), 'Left rear tire needs review');
    fireEvent.press(screen.getByText('Save Inspection'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/vehicles/vehicle-1/inspections', expect.objectContaining({
        inspection_date: getTodayDateParam(),
        issue_note: 'Left rear tire needs review',
        odometer: 12345,
        items: expect.arrayContaining([
          expect.objectContaining({ checklist_item_key: 'tires', status: 'fail' })
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

    fireEvent.press(screen.getByText('View'));
    expect(screen.getByText('View Truck V-42')).toBeTruthy();
    expect(screen.getByText('Open records and history.')).toBeTruthy();
    expect(screen.getByText('Inspection History')).toBeTruthy();
    expect(screen.getByText('Odometer History')).toBeTruthy();
    expect(screen.getByText('Assignment History')).toBeTruthy();
    fireEvent.press(screen.getByText('Service History'));

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
      });

    const screen = render(<ManagerVehiclesScreen />);

    await waitFor(() => {
      expect(screen.getByText('V-42')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('View'));
    fireEvent.press(screen.getByText('Inspection History'));

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/vehicles/vehicle-1/inspection-history', { authMode: 'manager' });
      expect(screen.getByText('Light out')).toBeTruthy();
    });
  });
});
