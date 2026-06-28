import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import NotificationsScreen, {
  formatNotificationTime,
  getNotificationConfig,
  getNotificationDestination,
  getNotificationNavigationParams
} from './NotificationsScreen';
import api from '../services/api';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback) => {
    const React = require('react');

    React.useEffect(() => {
      callback();
    }, [callback]);
  }
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    SafeAreaView: ({ children, style }) => <View style={style}>{children}</View>
  };
});

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    patch: jest.fn()
  }
}));

describe('NotificationsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.get.mockResolvedValue({ data: { notifications: [] } });
    api.patch.mockResolvedValue({ data: {} });
  });

  it('uses the correct notification endpoints for each mode', () => {
    expect(getNotificationConfig('driver')).toMatchObject({
      authMode: 'driver',
      endpoint: '/routes/notifications'
    });
    expect(getNotificationConfig('manager')).toMatchObject({
      authMode: 'manager',
      endpoint: '/manager/notifications'
    });
  });

  it('formats invalid notification timestamps defensively', () => {
    expect(formatNotificationTime(null)).toBe('Time unavailable');
    expect(formatNotificationTime('not-a-date')).toBe('Time unavailable');
  });

  it('loads manager notifications and marks them read', async () => {
    const notification = {
      id: 'notification-1',
      title: 'Urgent vehicle inspection review',
      body: 'Luis marked 204526 unsafe.',
      severity: 'urgent',
      status: 'unread',
      link_type: 'vehicle_inspection',
      created_at: '2026-06-27T14:12:00.000Z'
    };
    api.get.mockResolvedValueOnce({ data: { notifications: [notification] } });
    api.patch.mockResolvedValueOnce({
      data: {
        notification: {
          ...notification,
          status: 'read',
          read_at: '2026-06-27T14:20:00.000Z'
        }
      }
    });

    const screen = render(<NotificationsScreen mode="manager" navigation={{ navigate: jest.fn() }} />);

    expect(await screen.findByText('Urgent vehicle inspection review')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/manager/notifications', {
      authMode: 'manager'
    });

    fireEvent.press(screen.getByText('Mark read'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/manager/notifications/notification-1/read', {}, {
        authMode: 'manager'
      });
    });
    expect(await screen.findByText('Read')).toBeTruthy();
  });

  it('opens the driver route workflow from a route inspection notification', async () => {
    const navigation = { navigate: jest.fn() };
    const notification = {
      id: 'notification-2',
      title: 'Vehicle inspection upcoming',
      body: 'Route 811 is assigned. Complete the inspection for 204526 before starting.',
      severity: 'info',
      status: 'unread',
      link_type: 'route_inspection',
      created_at: '2026-06-27T13:30:00.000Z'
    };
    api.get.mockResolvedValueOnce({ data: { notifications: [notification] } });
    api.patch.mockResolvedValueOnce({
      data: {
        notification: {
          ...notification,
          status: 'read',
          read_at: '2026-06-27T13:35:00.000Z'
        }
      }
    });

    const screen = render(<NotificationsScreen mode="driver" navigation={navigation} />);

    expect(await screen.findByText('Vehicle inspection upcoming')).toBeTruthy();
    expect(api.get).toHaveBeenCalledWith('/routes/notifications', {
      authMode: 'driver'
    });

    fireEvent.press(screen.getByText('Open route'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/notifications/notification-2/read', {}, {
        authMode: 'driver'
      });
      expect(navigation.navigate).toHaveBeenCalledWith('Home');
    });
  });

  it('opens a manager vehicle inspection notification directly to the inspection detail', async () => {
    const navigation = { navigate: jest.fn() };
    const notification = {
      id: 'notification-1',
      title: 'Urgent vehicle inspection review',
      body: 'Luis marked 204526 unsafe.',
      severity: 'urgent',
      status: 'read',
      link_type: 'vehicle_inspection',
      link_ref: {
        inspection_id: 'inspection-1',
        vehicle_id: 'vehicle-1'
      },
      created_at: '2026-06-27T14:12:00.000Z'
    };
    api.get.mockResolvedValueOnce({ data: { notifications: [notification] } });

    const screen = render(<NotificationsScreen mode="manager" navigation={navigation} />);

    expect(await screen.findByText('Urgent vehicle inspection review')).toBeTruthy();
    fireEvent.press(screen.getByText('Open inspection'));

    expect(navigation.navigate).toHaveBeenCalledWith('ManagerVehicles', {
      inspectionId: 'inspection-1',
      notificationId: 'notification-1',
      source: 'notification',
      vehicleId: 'vehicle-1'
    });
  });

  it('maps manager inspection notifications to the vehicle workflow', () => {
    expect(getNotificationDestination({ link_type: 'vehicle_inspection' }, 'manager')).toBe('ManagerVehicles');
    expect(getNotificationNavigationParams({
      id: 'notification-1',
      link_type: 'vehicle_inspection',
      link_ref: {
        inspection_id: 'inspection-1',
        vehicle_id: 'vehicle-1'
      }
    }, 'manager')).toEqual({
      inspectionId: 'inspection-1',
      notificationId: 'notification-1',
      source: 'notification',
      vehicleId: 'vehicle-1'
    });
    expect(getNotificationDestination({ link_type: 'route_inspection' }, 'driver')).toBe('Home');
    expect(getNotificationDestination({ link_type: 'vehicle_inspection' }, 'driver')).toBeNull();
  });
});
