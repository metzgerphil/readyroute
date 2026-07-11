import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerRoutesScreen, {
  buildTerminalOptions,
  filterRoutes,
  formatStatusLabel,
  getSyncStatus,
  getTerminalLabel,
  getTodayDateParam,
  getSupportedRouteFileKind,
  isActiveRoute
} from './ManagerRoutesScreen';
import api from '../services/api';
import * as DocumentPicker from 'expo-document-picker';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn()
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

describe('ManagerRoutesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('formats route list values only when route data provides them', () => {
    const route = {
      status: 'in_progress',
      sync_status: 'uploaded',
      terminal_name: 'SAN'
    };

    expect(getTodayDateParam()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatStatusLabel('in_progress')).toBe('In progress');
    expect(getSyncStatus(route)).toBe('uploaded');
    expect(getSyncStatus({ sync_status: 'unknown' })).toBe('');
    expect(getTerminalLabel(route)).toBe('SAN');
    expect(getSupportedRouteFileKind('manifest.xls')).toBe('xls');
    expect(getSupportedRouteFileKind('manifest.xlsx')).toBe('xls');
    expect(getSupportedRouteFileKind('route.gpx')).toBe('gpx');
    expect(getSupportedRouteFileKind('route.pdf')).toBe('');
    expect(isActiveRoute(route)).toBe(true);
    expect(buildTerminalOptions([route, { terminal_name: 'SAN' }, { terminal_name: 'LAX' }])).toEqual(['LAX', 'SAN']);
  });

  it('loads compact route rows and opens the route map from the eye action', async () => {
    api.get.mockResolvedValue({
      data: {
        routes: [
          {
            id: 'route-1',
            work_area_name: '816',
            terminal_name: 'SAN',
            driver_name: 'Luis Perez',
            current_day: '2026-05-08',
            sync_status: 'enabled',
            status: 'in_progress',
            exception_count: 1,
            pickup_stop_count: 2,
            pickup_stops_completed: 1
          }
        ],
        sync_status: {
          routes_today: 1
        }
      }
    });

    const navigation = {
      navigate: jest.fn()
    };
    const screen = render(
      <ManagerRoutesScreen
        identity={{ companyName: 'Bridge Transportation Inc.' }}
        navigation={navigation}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('816')).toBeTruthy();
    });

    expect(api.get).toHaveBeenCalledWith('/manager/routes', {
      authMode: 'manager',
      params: {
        date: getTodayDateParam()
      }
    });
    expect(screen.getByText('ReadyRoute')).toBeTruthy();
    expect(screen.getByText('Bridge Transportation Inc.')).toBeTruthy();
    expect(screen.getByText('Stop Search')).toBeTruthy();
    expect(screen.getAllByText('Upload Manifest').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SAN').length).toBeGreaterThan(0);
    expect(screen.getByText('Luis Perez')).toBeTruthy();
    expect(screen.getByText('2026-05-08')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
    expect(screen.getByText('1 exceptions')).toBeTruthy();
    expect(screen.getByText('Pickups')).toBeTruthy();
    expect(screen.getByText('1 / 2')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('View 816 on map'));

    expect(navigation.navigate).toHaveBeenCalledWith('ManagerMap', {
      selectedRouteId: 'route-1',
      date: getTodayDateParam()
    });
  });

  it('shows a safe route options modal from the edit action', async () => {
    api.get.mockResolvedValue({
      data: {
        routes: [
          {
            id: 'route-1',
            work_area_name: '816',
            driver_name: 'Luis Perez',
            status: 'pending'
          }
        ]
      }
    });

    const screen = render(<ManagerRoutesScreen />);

    await waitFor(() => {
      expect(screen.getByText('816')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('Edit 816'));

    expect(screen.getByText('Route options')).toBeTruthy();
    expect(screen.getByText('More route tools are coming soon.')).toBeTruthy();
  });

  it('uploads selected XLS and GPX files through the manual manifest endpoint', async () => {
    api.get.mockResolvedValue({
      data: {
        routes: []
      }
    });
    api.post.mockResolvedValue({
      data: {
        route_id: 'route-1'
      }
    });
    DocumentPicker.getDocumentAsync
      .mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            name: 'manifest.xlsx',
            uri: 'file:///manifest.xlsx'
          }
        ]
      })
      .mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            mimeType: 'application/gpx+xml',
            name: 'route.gpx',
            uri: 'file:///route.gpx'
          }
        ]
      });
    const onManagerDataRefresh = jest.fn();

    const screen = render(<ManagerRoutesScreen onManagerDataRefresh={onManagerDataRefresh} />);

    await waitFor(() => {
      expect(screen.getByText('No routes available.')).toBeTruthy();
    });

    fireEvent.press(screen.getAllByText('Upload Manifest')[0]);

    expect(screen.getByText('Upload today’s manifest files. ReadyRoute will use them to build routes, stops, packages, pickups, customer contact detail, and map pins.')).toBeTruthy();
    expect(screen.getByText('For best results, attach Combined, Delivery, Pickup, and the matching GPX files together so ReadyRoute can merge route pins, package detail, service codes, and customer contact data in one pass.')).toBeTruthy();
    expect(screen.queryByText(/FCC/i)).toBeNull();

    fireEvent.press(screen.getByText('Combined XLS'));
    await waitFor(() => {
      expect(screen.getByText('manifest.xlsx')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Combined GPX'));
    await waitFor(() => {
      expect(screen.getByText('route.gpx')).toBeTruthy();
    });

    const uploadManifestLabels = screen.getAllByText('Upload Manifest');
    fireEvent.press(uploadManifestLabels[uploadManifestLabels.length - 1]);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/routes/upload-manifest', expect.any(FormData), expect.objectContaining({
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }));
      expect(screen.getByText('Manifest uploaded successfully.')).toBeTruthy();
      expect(onManagerDataRefresh).toHaveBeenCalled();
    });
  });

  it('shows clean unsupported file errors before upload', async () => {
    api.get.mockResolvedValue({
      data: {
        routes: []
      }
    });
    DocumentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          mimeType: 'application/pdf',
          name: 'route.pdf',
          uri: 'file:///route.pdf'
        }
      ]
    });

    const screen = render(<ManagerRoutesScreen />);

    await waitFor(() => {
      expect(screen.getByText('No routes available.')).toBeTruthy();
    });

    fireEvent.press(screen.getAllByText('Upload Manifest')[0]);
    fireEvent.press(screen.getByText('Combined XLS'));

    await waitFor(() => {
      expect(screen.getByText('This file type is not supported. Upload an XLS or GPX file.')).toBeTruthy();
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('filters routes by active status, terminal, and search text', () => {
    const routes = [
      {
        work_area_name: '816',
        terminal_name: 'SAN',
        driver_name: 'Luis Perez',
        status: 'in_progress'
      },
      {
        work_area_name: '912',
        terminal_name: 'LAX',
        driver_name: 'Ana Cruz',
        status: 'pending'
      }
    ];

    expect(filterRoutes(routes, { onlyActive: true })).toEqual([routes[0]]);
    expect(filterRoutes(routes, { terminal: 'LAX' })).toEqual([routes[1]]);
    expect(filterRoutes(routes, { searchTerm: 'luis' })).toEqual([routes[0]]);
  });
});
