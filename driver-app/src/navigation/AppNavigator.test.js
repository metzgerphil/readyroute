import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import AppNavigator from './AppNavigator';
import { usePortalSession } from '../context/PortalSessionContext';

jest.setTimeout(30000);

jest.mock('../components/MobileNavigationDrawer', () => function MockMobileNavigationDrawer() {
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

jest.mock('../context/PortalSessionContext', () => ({
  usePortalSession: jest.fn()
}));

jest.mock('../screens/HomeScreen', () => function MockHomeScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>HomeScreen</MockText>;
});

jest.mock('../screens/LoginScreen', () => function MockLoginScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>LoginScreen</MockText>;
});

jest.mock('../screens/ManifestScreen', () => function MockManifestScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManifestScreen</MockText>;
});

jest.mock('../screens/ManagerOverviewScreen', () => function MockManagerOverviewScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerOverviewScreen</MockText>;
});

jest.mock('../screens/ManagerNotificationsScreen', () => function MockManagerNotificationsScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerNotificationsScreen</MockText>;
});

jest.mock('../screens/ManagerRoutesScreen', () => function MockManagerRoutesScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerRoutesScreen</MockText>;
});

jest.mock('../screens/ManagerSettingsScreen', () => function MockManagerSettingsScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>ManagerSettingsScreen</MockText>;
});

jest.mock('../screens/MyDriveScreen', () => function MockMyDriveScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>MyDriveScreen</MockText>;
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
    expect(screenLabels).toContain('HomeScreen');
    expect(screenLabels).toContain('MyDriveScreen');
    expect(screenLabels).toContain('ManifestScreen');
    expect(screenLabels).toContain('StopDetailScreen');
    expect(screenLabels).not.toContain('PortalEntryScreen');
  });

  it('sends a manager-only user straight into the manager overview flow', async () => {
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
      selectMode
    });

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    const screenLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(screenLabels).toContain('ManagerOverviewScreen');
    expect(screenLabels).toContain('ManagerRoutesScreen');
    expect(screenLabels).toContain('ManagerNotificationsScreen');
    expect(screenLabels).toContain('ManagerSettingsScreen');
    expect(screenLabels).not.toContain('HomeScreen');
    expect(screenLabels).not.toContain('PortalEntryScreen');
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
});
