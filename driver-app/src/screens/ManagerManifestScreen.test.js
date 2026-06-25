import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';

import ManagerManifestScreen, { buildRecentManifestUploads, getTodayDateParam } from './ManagerManifestScreen';
import api from '../services/api';

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

describe('ManagerManifestScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds recent upload history only when backend fields exist', () => {
    expect(buildRecentManifestUploads({
      routes: [
        { id: 'route-1', source: 'manifest_upload', updated_at: '2026-05-08T12:00:00Z', work_area_name: '816' },
        { id: 'route-2', work_area_name: '912' }
      ]
    })).toEqual([
      {
        id: 'route-1',
        label: '816',
        mode: 'manifest_upload',
        timestamp: '2026-05-08T12:00:00Z'
      }
    ]);
  });

  it('renders a real manager manifest upload page and empty state', async () => {
    api.get.mockResolvedValue({
      data: {
        routes: []
      }
    });

    const screen = render(
      <ManagerManifestScreen identity={{ companyName: 'Bridge Transportation Inc.' }} />
    );

    await waitFor(() => {
      expect(screen.getByText('Manifest')).toBeTruthy();
    });

    expect(api.get).toHaveBeenCalledWith('/manager/routes', {
      authMode: 'manager',
      params: {
        date: getTodayDateParam()
      }
    });
    expect(screen.getByText('Bridge Transportation Inc.')).toBeTruthy();
    expect(screen.getByText('Combined XLS')).toBeTruthy();
    expect(screen.getByText('Combined GPX')).toBeTruthy();
    expect(screen.getByText('Delivery XLS')).toBeTruthy();
    expect(screen.getByText('Pickup XLS')).toBeTruthy();
    expect(screen.getByText('Upload Manifest Files')).toBeTruthy();
    expect(screen.getByText('Upload Manifest')).toBeTruthy();
    expect(screen.getByText('No manifest uploaded for this day.')).toBeTruthy();
    expect(screen.queryByText(/FCC/i)).toBeNull();
  });

  it('uploads selected files through the existing manifest endpoint and refreshes manager data', async () => {
    api.get.mockResolvedValue({
      data: {
        routes: []
      }
    });
    api.post.mockResolvedValue({
      data: {
        route: {
          work_area_name: '816'
        }
      }
    });
    DocumentPicker.getDocumentAsync
      .mockResolvedValueOnce({
        canceled: false,
        assets: [
          {
            mimeType: 'application/vnd.ms-excel',
            name: 'manifest.xls',
            uri: 'file:///manifest.xls'
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

    const screen = render(<ManagerManifestScreen onManagerDataRefresh={onManagerDataRefresh} />);

    await waitFor(() => {
      expect(screen.getByText('No manifest uploaded for this day.')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Combined XLS'));
    await waitFor(() => {
      expect(screen.getByText('manifest.xls')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Combined GPX'));
    await waitFor(() => {
      expect(screen.getByText('route.gpx')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Upload Manifest'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/routes/upload-manifest', expect.any(FormData), expect.objectContaining({
        authMode: 'manager',
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      }));
      expect(screen.getByText('Manifest uploaded successfully.')).toBeTruthy();
      expect(screen.getByText('Route generation result')).toBeTruthy();
      expect(onManagerDataRefresh).toHaveBeenCalled();
    });
  });

  it('shows a clean error when the upload fails', async () => {
    api.get.mockResolvedValue({
      data: {
        routes: []
      }
    });
    api.post.mockRejectedValue(new Error('bad manifest'));
    DocumentPicker.getDocumentAsync.mockResolvedValue({
      canceled: false,
      assets: [
        {
          mimeType: 'application/vnd.ms-excel',
          name: 'manifest.xls',
          uri: 'file:///manifest.xls'
        }
      ]
    });

    const screen = render(<ManagerManifestScreen />);

    await waitFor(() => {
      expect(screen.getByText('No manifest uploaded for this day.')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Combined XLS'));
    await waitFor(() => {
      expect(screen.getByText('manifest.xls')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('Upload Manifest'));

    await waitFor(() => {
      expect(screen.getByText('Could not process manifest.')).toBeTruthy();
    });
  });
});
