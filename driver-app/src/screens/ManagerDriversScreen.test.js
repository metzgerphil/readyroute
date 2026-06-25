import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerDriversScreen, {
  buildRoutesByDriverId,
  filterDrivers,
  formatFedexDriverId,
  formatPhoneDisplay,
  getDriverStatus,
  getInitialDriverForm,
  getTodayDateParam
} from './ManagerDriversScreen';
import api from '../services/api';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
    put: jest.fn()
  }
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn()
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn()
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

describe('ManagerDriversScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats driver fields without exposing payroll data', () => {
    const driver = {
      fedex_driver_id: 'FX123',
      is_active: false,
      phone: '15551234567'
    };

    expect(formatPhoneDisplay(driver.phone)).toBe('+1 (555) 123-4567');
    expect(formatFedexDriverId(driver)).toBe('FX123');
    expect(getDriverStatus(driver)).toEqual({ label: 'Inactive', tone: 'neutral' });
    expect(getInitialDriverForm({ id: 'driver-1', name: 'Luis', fedex_driver_id: 'FX123' })).toMatchObject({
      id: 'driver-1',
      fedex_driver_id: 'FX123',
      pin: '',
      confirmPin: ''
    });
    expect(buildRoutesByDriverId([
      { driver_id: 'driver-1', work_area_name: '816' },
      { driver_id: 'driver-2', work_area_name: '' }
    ])).toEqual(new Map([['driver-1', '816']]));
  });

  it('loads drivers and today route data from manager backend endpoints', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX123',
              phone: '5551234567',
              hourly_rate: 30,
              is_active: true
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          routes: [
            {
              id: 'route-1',
              driver_id: 'driver-1',
              work_area_name: '816'
            }
          ]
        }
      });

    const screen = render(
      <ManagerDriversScreen identity={{ companyName: 'Bridge Transportation Inc.' }} />
    );

    await waitFor(() => {
      expect(screen.getByText('Luis Perez')).toBeTruthy();
    });

    expect(api.get).toHaveBeenCalledWith('/manager/drivers', { authMode: 'manager' });
    expect(api.get).toHaveBeenCalledWith('/manager/routes', {
      authMode: 'manager',
      params: {
        date: getTodayDateParam()
      }
    });
    expect(screen.getByText('Bridge Transportation Inc.')).toBeTruthy();
    expect(screen.getByText('FedEx ID: FX123')).toBeTruthy();
    expect(screen.getByText('(555) 123-4567')).toBeTruthy();
    expect(screen.queryByText('Active')).toBeNull();
    expect(screen.getByText('Route 816')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search drivers by name or FedEx Driver ID')).toBeTruthy();
    expect(screen.queryByText(/hourly/i)).toBeNull();
    expect(screen.queryByText(/pay/i)).toBeNull();
  });

  it('searches by driver name and FedEx Driver ID', () => {
    const drivers = [
      { name: 'Luis Perez', fedex_driver_id: 'FX123' },
      { name: 'Ana Cruz', fedex_driver_id: 'FX999' }
    ];

    expect(filterDrivers(drivers, 'luis')).toEqual([drivers[0]]);
    expect(filterDrivers(drivers, '999')).toEqual([drivers[1]]);
  });

  it('opens edit modal and saves with validated PIN fields', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX123',
              phone: '5551234567',
              is_active: true
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          routes: []
        }
      })
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX124',
              phone: '5559876543',
              is_active: true
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          routes: []
        }
      });
    api.put.mockResolvedValue({ data: { ok: true } });

    const screen = render(<ManagerDriversScreen />);

    await waitFor(() => {
      expect(screen.getByText('Luis Perez')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Edit'));

    expect(screen.getByText('Edit Driver')).toBeTruthy();
    expect(screen.getByText('Enter a 4 digit PIN. Confirm PIN must match.')).toBeTruthy();
    expect(screen.getByDisplayValue('luis@example.com')).toBeTruthy();
    expect(screen.getByText('Daily hourly rate')).toBeTruthy();

    fireEvent.changeText(screen.getByDisplayValue('FX123'), 'FX124');
    fireEvent.changeText(screen.getByDisplayValue('5551234567'), '5559876543');
    fireEvent.changeText(screen.getByPlaceholderText('4 digit PIN'), '1234');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new PIN'), '1234');
    fireEvent.press(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(api.put).toHaveBeenCalledWith('/manager/drivers/driver-1', {
        name: 'Luis Perez',
        date_of_birth: null,
        fedex_driver_id: 'FX124',
        phone: '5559876543',
        hourly_rate: 0,
        daily_flat_rate: 0,
        pin: '1234'
      }, {
        authMode: 'manager'
      });
    });
  });

  it('shows inline validation errors before creating an invalid driver', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          drivers: []
        }
      })
      .mockResolvedValueOnce({
        data: {
          routes: []
        }
      });

    const screen = render(<ManagerDriversScreen />);

    await waitFor(() => {
      expect(screen.getByText('Add Driver')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Add Driver'));
    fireEvent.press(screen.getByText('Save Changes'));

    expect(screen.getByText('Driver name is required.')).toBeTruthy();
    expect(screen.getByText('Driver email is required.')).toBeTruthy();
    expect(screen.getByText('Enter a 4-digit numeric PIN.')).toBeTruthy();
    expect(screen.getByText('Confirm the driver PIN.')).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });

  it('validates PIN reset confirmation before saving', async () => {
    api.get
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX123',
              phone: '5551234567',
              is_active: true
            }
          ]
        }
      })
      .mockResolvedValueOnce({
        data: {
          routes: []
        }
      });

    const screen = render(<ManagerDriversScreen />);

    await waitFor(() => {
      expect(screen.getByText('Luis Perez')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Edit'));
    fireEvent.changeText(screen.getByPlaceholderText('4 digit PIN'), '1234');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new PIN'), '4321');
    fireEvent.press(screen.getByText('Save Changes'));

    expect(screen.getByText('PINs must match.')).toBeTruthy();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('uploads driver documents from files as soon as a source is selected', async () => {
    const OriginalFormData = global.FormData;
    global.FormData = class TestFormData {
      constructor() {
        this._parts = [];
      }

      append(name, value) {
        this._parts.push([name, value]);
      }
    };

    api.get
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX123',
              phone: '5551234567',
              document_summary: {
                expired: 0,
                expiring_soon: 0,
                missing_required: ['driver_license'],
                required_complete: 3,
                required_total: 4
              },
              documents: []
            }
          ]
        }
      })
      .mockResolvedValueOnce({ data: { routes: [] } })
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX123',
              phone: '5551234567',
              document_summary: {
                expired: 0,
                expiring_soon: 0,
                missing_required: [],
                required_complete: 4,
                required_total: 4
              },
              documents: [
                {
                  id: 'doc-1',
                  document_type: 'driver_license',
                  file_name: 'license.pdf',
                  expires_on: null,
                  notes: null
                }
              ]
            }
          ]
        }
      })
      .mockResolvedValueOnce({ data: { routes: [] } });
    api.post.mockResolvedValue({ data: { document: { id: 'doc-1' } } });
    DocumentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///license.pdf',
          name: 'license.pdf',
          mimeType: 'application/pdf'
        }
      ]
    });

    const screen = render(<ManagerDriversScreen />);

    await waitFor(() => {
      expect(screen.getByText('Luis Perez')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Luis Perez'));
    fireEvent.press(screen.getAllByText('Upload')[0]);
    expect(screen.getByText('Files')).toBeTruthy();
    expect(screen.getByText('Camera Roll')).toBeTruthy();

    fireEvent.press(screen.getByText('Hide options'));
    expect(screen.queryByText('Files')).toBeNull();
    expect(screen.queryByText('Camera Roll')).toBeNull();

    fireEvent.press(screen.getAllByText('Upload')[0]);
    fireEvent.press(screen.getByText('Files'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/manager/drivers/driver-1/documents', expect.any(FormData), {
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    });

    expect(screen.queryByPlaceholderText('YYYY-MM-DD')).toBeNull();
    expect(screen.queryByPlaceholderText('Optional note')).toBeNull();
    expect(screen.queryByText('Upload Document')).toBeNull();

    const formData = api.post.mock.calls[0][1];
    expect(formData._parts).toEqual(expect.arrayContaining([
      ['document_type', 'driver_license'],
      ['file', {
        uri: 'file:///license.pdf',
        name: 'license.pdf',
        type: 'application/pdf'
      }]
    ]));
    expect(formData._parts).not.toEqual(expect.arrayContaining([
      ['expires_on', expect.any(String)],
      ['notes', expect.any(String)]
    ]));
    global.FormData = OriginalFormData;
  });

  it('uploads driver document photos from camera roll through the same backend endpoint', async () => {
    const OriginalFormData = global.FormData;
    global.FormData = class TestFormData {
      constructor() {
        this._parts = [];
      }

      append(name, value) {
        this._parts.push([name, value]);
      }
    };

    api.get
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX123',
              phone: '5551234567',
              document_summary: {
                expired: 0,
                expiring_soon: 0,
                missing_required: ['driver_license'],
                required_complete: 3,
                required_total: 4
              },
              documents: []
            }
          ]
        }
      })
      .mockResolvedValueOnce({ data: { routes: [] } })
      .mockResolvedValueOnce({
        data: {
          drivers: [
            {
              id: 'driver-1',
              name: 'Luis Perez',
              email: 'luis@example.com',
              fedex_driver_id: 'FX123',
              phone: '5551234567',
              document_summary: {
                expired: 0,
                expiring_soon: 0,
                missing_required: [],
                required_complete: 4,
                required_total: 4
              },
              documents: []
            }
          ]
        }
      })
      .mockResolvedValueOnce({ data: { routes: [] } });
    api.post.mockResolvedValue({ data: { document: { id: 'doc-1' } } });
    ImagePicker.requestMediaLibraryPermissionsAsync.mockResolvedValue({ granted: true });
    ImagePicker.launchImageLibraryAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          uri: 'file:///license-photo.jpg',
          fileName: 'license-photo.jpg',
          mimeType: 'image/jpeg'
        }
      ]
    });

    const screen = render(<ManagerDriversScreen />);

    await waitFor(() => {
      expect(screen.getByText('Luis Perez')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Luis Perez'));
    fireEvent.press(screen.getAllByText('Upload')[0]);
    fireEvent.press(screen.getByText('Camera Roll'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/manager/drivers/driver-1/documents', expect.any(FormData), {
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
    });

    const formData = api.post.mock.calls[0][1];
    expect(formData._parts).toEqual(expect.arrayContaining([
      ['document_type', 'driver_license'],
      ['file', {
        uri: 'file:///license-photo.jpg',
        name: 'license-photo.jpg',
        type: 'image/jpeg'
      }]
    ]));
    expect(screen.queryByText('Upload Document')).toBeNull();
    global.FormData = OriginalFormData;
  });
});
