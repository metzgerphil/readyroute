import * as Notifications from 'expo-notifications';

import api from './api';
import {
  getExpoPushProjectId,
  getPushRegistrationEndpoint,
  isNativePushSupported,
  registerPushNotificationsForMode,
  registerPushNotificationsForSession
} from './pushNotifications';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    easConfig: {
      projectId: 'project-1'
    },
    expoConfig: {
      version: '1.0.2',
      extra: {
        eas: {
          projectId: 'project-1'
        }
      }
    },
    sessionId: 'session-1'
  }
}));

jest.mock('expo-notifications', () => ({
  AndroidImportance: {
    DEFAULT: 3
  },
  getExpoPushTokenAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationHandler: jest.fn()
}));

jest.mock('./api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
  }
}));

describe('push notification registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Notifications.getPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted'
    });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({
      data: 'ExponentPushToken[test-token]'
    });
    api.post.mockResolvedValue({
      data: {
        registered: true
      }
    });
  });

  it('maps driver and manager modes to the registration endpoints', () => {
    expect(getPushRegistrationEndpoint('driver')).toBe('/routes/notifications/device-token');
    expect(getPushRegistrationEndpoint('manager')).toBe('/manager/notifications/device-token');
    expect(getPushRegistrationEndpoint('unknown')).toBeNull();
  });

  it('reads the EAS project id from Expo constants', () => {
    expect(getExpoPushProjectId()).toBe('project-1');
  });

  it('only supports native platforms for Expo push registration', () => {
    expect(isNativePushSupported('ios')).toBe(true);
    expect(isNativePushSupported('android')).toBe(true);
    expect(isNativePushSupported('web')).toBe(false);
  });

  it('registers the current driver mode Expo push token with the backend', async () => {
    const result = await registerPushNotificationsForMode('driver');

    expect(Notifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(api.post).toHaveBeenCalledWith('/routes/notifications/device-token', expect.objectContaining({
      app_version: '1.0.2',
      device_id: 'session-1',
      expo_push_token: 'ExponentPushToken[test-token]'
    }), {
      authMode: 'driver'
    });
    expect(result).toEqual({
      status: 'registered',
      token: 'ExponentPushToken[test-token]'
    });
  });

  it('does not register a token when notification permission is denied', async () => {
    Notifications.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      status: 'denied',
      canAskAgain: false
    });

    const result = await registerPushNotificationsForMode('manager');

    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'permission_denied' });
  });

  it('skips session registration when the active mode token is missing', async () => {
    const result = await registerPushNotificationsForSession({
      activeMode: 'manager',
      sessionTokens: {
        driverToken: 'driver-token',
        managerToken: null
      }
    });

    expect(result).toEqual({
      status: 'skipped',
      reason: 'missing_manager_token'
    });
    expect(api.post).not.toHaveBeenCalled();
  });
});
