import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import AppNavigator from './AppNavigator';
import { usePortalSession } from '../context/PortalSessionContext';
import api from '../services/api';
import { saveLastPortalMode, saveSessionTokens } from '../services/auth';

jest.setTimeout(30000);

const mockDrawerProps = { current: null };

jest.mock('../components/MobileNavigationDrawer', () => function MockMobileNavigationDrawer(props) {
  mockDrawerProps.current = props;
  return null;
});

jest.mock('@react-navigation/stack', () => ({
  createStackNavigator: () => ({
    Navigator: ({ children }) => <>{children}</>,
    Screen: ({ children, component: Component, ...props }) => {
      if (typeof children === 'function') {
        return children(props);
      }

      if (Component) {
        return <Component {...props} />;
      }

      return null;
    }
  })
}));

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
    SafeAreaView: ({ children }) => <View>{children}</View>,
    useSafeAreaInsets: () => ({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0
    })
  };
});

jest.mock('../context/PortalSessionContext', () => ({
  usePortalSession: jest.fn()
}));

jest.mock('../services/auth', () => ({
  saveLastPortalMode: jest.fn(),
  saveSessionTokens: jest.fn()
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn()
  }
}));

jest.mock('../screens/HomeScreen', () => function MockHomeScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>HomeScreen</MockText>;
});

jest.mock('../screens/DriverHelpScreen', () => function MockDriverHelpScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>DriverHelpScreen</MockText>;
});

jest.mock('../screens/RraCodesScreen', () => function MockRraCodesScreen() { return null; });
jest.mock('../screens/RraBarcodeScreen', () => function MockRraBarcodeScreen() { return null; });

jest.mock('../screens/LoginScreen', () => function MockLoginScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>LoginScreen</MockText>;
});

jest.mock('../screens/ManagerDashboardScreen', () => function MockManagerDashboardScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerDashboardScreen</MockText>;
});

jest.mock('../screens/ManagerAccessCodesScreen', () => function MockManagerAccessCodesScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerAccessCodesScreen</MockText>;
});

jest.mock('../screens/ManagerDriversScreen', () => function MockManagerDriversScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerDriversScreen</MockText>;
});

jest.mock('../screens/ManagerManifestScreen', () => function MockManagerManifestScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerManifestScreen</MockText>;
});

jest.mock('../screens/ManifestScreen', () => function MockManifestScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManifestScreen</MockText>;
});

jest.mock('../screens/ManagerMapScreen', () => function MockManagerMapScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerMapScreen</MockText>;
});

jest.mock('../screens/ManagerRoutesScreen', () => function MockManagerRoutesScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerRoutesScreen</MockText>;
});

jest.mock('../screens/ManagerVehiclesScreen', () => function MockManagerVehiclesScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerVehiclesScreen</MockText>;
});

jest.mock('../screens/ManagerSettingsScreen', () => function MockManagerSettingsScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerSettingsScreen</MockText>;
});

jest.mock('../screens/ManagerVedrScreen', () => function MockManagerVedrScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerVedrScreen</MockText>;
});

jest.mock('../screens/MyDriveScreen', () => function MockMyDriveScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>MyDriveScreen</MockText>;
});

jest.mock('../screens/NotificationsScreen', () => function MockNotificationsScreen({ mode }) {
  const { Text: MockText } = require('react-native');
  return <MockText>{mode === 'manager' ? 'ManagerNotificationsScreen' : 'NotificationsScreen'}</MockText>;
});

jest.mock('../screens/PortalEntryScreen', () => function MockPortalEntryScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>PortalEntryScreen</MockText>;
});

jest.mock('../screens/StopDetailScreen', () => function MockStopDetailScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>StopDetailScreen</MockText>;
});

describe('AppNavigator', () => {
  const authenticate = jest.fn();
  const logout = jest.fn();
  const selectMode = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockDrawerProps.current = null;
    api.get.mockResolvedValue({ data: { current_csa: null, csas: [] } });
    usePortalSession.mockReturnValue({
      activeMode: null,
      authenticate,
      availableModes: [],
      hasAnyAccess: false,
      identity: {
        fullName: 'ReadyRoute User',
        companyName: 'ReadyRoute',
        primaryRole: 'Driver'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode
    });
  });

  it('shows the login flow when there is no saved token', async () => {
    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    const loginLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(loginLabels).toContain('LoginScreen');
    expect(loginLabels).not.toContain('HomeScreen');
  });

  it('shows the portal selector for a dual-access user with no saved mode', async () => {
    usePortalSession.mockReturnValue({
      activeMode: null,
      authenticate,
      availableModes: ['driver', 'manager'],
      hasAnyAccess: true,
      identity: {
        fullName: 'Luis Perez',
        companyName: 'Bridge Transportation',
        primaryRole: 'Driver'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: true,
      selectMode
    });

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    const screenLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(screenLabels).toContain('PortalEntryScreen');
    expect(screenLabels).not.toContain('HomeScreen');
  });

  it('sends a driver-only user straight into the driver flow', async () => {
    usePortalSession.mockReturnValue({
      activeMode: 'driver',
      authenticate,
      availableModes: ['driver'],
      hasAnyAccess: true,
      identity: {
        fullName: 'Luis Perez',
        companyName: 'Bridge Transportation',
        primaryRole: 'Driver'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode
    });

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    const screenLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(screenLabels).toContain('DriverHelpScreen');
    expect(screenLabels).toContain('HomeScreen');
    expect(screenLabels).toContain('NotificationsScreen');
    expect(screenLabels).toContain('MyDriveScreen');
    expect(screenLabels).toContain('ManifestScreen');
    expect(screenLabels).toContain('StopDetailScreen');
    expect(screenLabels).not.toContain('PortalEntryScreen');
  });

  it('sends a manager-only user straight into the manager dashboard flow', async () => {
    usePortalSession.mockReturnValue({
      activeMode: 'manager',
      authenticate,
      availableModes: ['manager'],
      hasAnyAccess: true,
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'Bridge Transportation',
        primaryRole: 'Manager'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode,
      sessionTokens: {
        driverToken: null,
        managerToken: 'manager-token'
      }
    });

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    const screenLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(screenLabels).toContain('ManagerDashboardScreen');
    expect(screenLabels).toContain('ManagerAccessCodesScreen');
    expect(screenLabels).toContain('ManagerDriversScreen');
    expect(screenLabels).toContain('ManagerManifestScreen');
    expect(screenLabels).toContain('ManagerMapScreen');
    expect(screenLabels).toContain('ManagerNotificationsScreen');
    expect(screenLabels).toContain('ManagerRoutesScreen');
    expect(screenLabels).toContain('ManagerVedrScreen');
    expect(screenLabels).toContain('ManagerVehiclesScreen');
    expect(screenLabels).toContain('ManagerSettingsScreen');
    expect(screenLabels).not.toContain('Routes');
    expect(screenLabels).not.toContain('HomeScreen');
    expect(screenLabels).not.toContain('PortalEntryScreen');
    expect(mockDrawerProps.current.showModeSwitch).toBe(true);
  });

  it('creates a driver session when a manager switches to the driver question view', async () => {
    api.post.mockResolvedValueOnce({ data: { driver_token: 'new-driver-token' } });
    usePortalSession.mockReturnValue({
      activeMode: 'manager',
      authenticate,
      availableModes: ['manager'],
      hasAnyAccess: true,
      identity: {
        fullName: 'ReadyRoute Manager',
        companyName: 'ReadyRoute',
        primaryRole: 'Manager'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode,
      sessionTokens: {
        driverToken: null,
        managerToken: 'manager-token'
      }
    });

    await act(async () => {
      renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await mockDrawerProps.current.onSwitchMode();
    });

    expect(api.post).toHaveBeenCalledWith('/auth/mobile/manager-driver-session', {}, {
      authMode: 'manager'
    });
    expect(saveSessionTokens).toHaveBeenCalledWith({
      driverToken: 'new-driver-token',
      managerToken: 'manager-token'
    });
    expect(saveLastPortalMode).toHaveBeenCalledWith('driver', {
      driverToken: 'new-driver-token',
      managerToken: 'manager-token'
    });
    expect(authenticate).toHaveBeenCalledWith({
      driverToken: 'new-driver-token',
      managerToken: 'manager-token'
    });
  });

  it('passes manager notification attention into the mobile drawer', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/manager/notifications') {
        return Promise.resolve({
          data: {
            notifications: [
              {
                id: 'notification-1',
                severity: 'urgent',
                status: 'unread'
              }
            ]
          }
        });
      }

      return Promise.resolve({ data: { current_csa: null, csas: [] } });
    });
    usePortalSession.mockReturnValue({
      activeMode: 'manager',
      authenticate,
      availableModes: ['manager'],
      hasAnyAccess: true,
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'Bridge Transportation',
        primaryRole: 'Manager'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode,
      sessionTokens: {
        managerToken: 'manager-token'
      }
    });

    await act(async () => {
      renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(api.get).toHaveBeenCalledWith('/manager/notifications', {
      authMode: 'manager'
    });
    expect(mockDrawerProps.current.hasNotificationAttention).toBe(true);
  });

  it('does not keep notification attention after urgent notifications are read', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/manager/notifications') {
        return Promise.resolve({
          data: {
            notifications: [
              {
                id: 'notification-1',
                severity: 'urgent',
                status: 'read'
              }
            ]
          }
        });
      }

      return Promise.resolve({ data: { current_csa: null, csas: [] } });
    });
    usePortalSession.mockReturnValue({
      activeMode: 'manager',
      authenticate,
      availableModes: ['manager'],
      hasAnyAccess: true,
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'Bridge Transportation',
        primaryRole: 'Manager'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode,
      sessionTokens: {
        managerToken: 'manager-token'
      }
    });

    await act(async () => {
      renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDrawerProps.current.hasNotificationAttention).toBe(false);
  });

  it('shows the loading screen while the portal session bootstraps', async () => {
    usePortalSession.mockReturnValue({
      activeMode: null,
      authenticate,
      availableModes: [],
      hasAnyAccess: false,
      identity: {
        fullName: 'ReadyRoute User',
        companyName: 'ReadyRoute',
        primaryRole: 'Driver'
      },
      isBootstrapping: true,
      logout,
      needsModeSelection: false,
      selectMode
    });

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    expect(tree.root.findAllByType(Text)).toHaveLength(0);
  });

  it('refreshes driver mode for the selected CSA when a manager switches workspaces', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        driver_token: 'driver-token-for-account-2'
      }
    });
    usePortalSession.mockReturnValue({
      activeMode: 'manager',
      authenticate,
      availableModes: ['driver', 'manager'],
      hasAnyAccess: true,
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'Bridge Transportation',
        primaryRole: 'Manager'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode,
      sessionTokens: {
        driverToken: 'old-driver-token-for-account-1',
        managerToken: 'old-manager-token-for-account-1'
      }
    });

    await act(async () => {
      renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await mockDrawerProps.current.onManagerWorkspaceSwitch('new-manager-token-for-account-2');
    });

    expect(api.post).toHaveBeenCalledWith('/auth/mobile/manager-driver-session', {}, {
      authMode: 'manager',
      authToken: 'new-manager-token-for-account-2'
    });
    expect(saveSessionTokens).toHaveBeenCalledWith({
      driverToken: 'driver-token-for-account-2',
      managerToken: 'new-manager-token-for-account-2'
    });
    expect(saveLastPortalMode).toHaveBeenCalledWith('manager', {
      driverToken: 'driver-token-for-account-2',
      managerToken: 'new-manager-token-for-account-2'
    });
    expect(authenticate).toHaveBeenCalledWith({
      driverToken: 'driver-token-for-account-2',
      managerToken: 'new-manager-token-for-account-2'
    });
  });

  it('clears the old driver token if driver mode cannot be refreshed after a CSA switch', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    api.post.mockRejectedValueOnce(new Error('network unavailable'));
    usePortalSession.mockReturnValue({
      activeMode: 'manager',
      authenticate,
      availableModes: ['driver', 'manager'],
      hasAnyAccess: true,
      identity: {
        fullName: 'Vlad Fedoryshyn',
        companyName: 'Bridge Transportation',
        primaryRole: 'Manager'
      },
      isBootstrapping: false,
      logout,
      needsModeSelection: false,
      selectMode,
      sessionTokens: {
        driverToken: 'old-driver-token-for-account-1',
        managerToken: 'old-manager-token-for-account-1'
      }
    });

    await act(async () => {
      renderer.create(<AppNavigator />);
    });

    await act(async () => {
      await mockDrawerProps.current.onManagerWorkspaceSwitch('new-manager-token-for-account-2');
    });

    expect(saveSessionTokens).toHaveBeenCalledWith({
      driverToken: null,
      managerToken: 'new-manager-token-for-account-2'
    });
    expect(saveLastPortalMode).toHaveBeenCalledWith('manager', {
      driverToken: null,
      managerToken: 'new-manager-token-for-account-2'
    });
    expect(authenticate).toHaveBeenCalledWith({
      driverToken: null,
      managerToken: 'new-manager-token-for-account-2'
    });

    warnSpy.mockRestore();
  });
});
