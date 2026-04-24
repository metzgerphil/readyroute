import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import AppNavigator from './AppNavigator';
import { getToken, removeClockInTime, removeToken } from '../services/auth';
import { setUnauthorizedHandler } from '../services/api';

jest.setTimeout(30000);

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

jest.mock('../services/auth', () => ({
  getToken: jest.fn(),
  removeClockInTime: jest.fn(),
  removeToken: jest.fn()
}));

jest.mock('../services/api', () => ({
  setUnauthorizedHandler: jest.fn()
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

jest.mock('../screens/MyDriveScreen', () => function MockMyDriveScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>MyDriveScreen</MockText>;
});

jest.mock('../screens/StopDetailScreen', () => function MockStopDetailScreen() {
  const { Text: MockText } = require('react-native');
  return <MockText>StopDetailScreen</MockText>;
});

async function flushBootstrap() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('AppNavigator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the login flow when there is no saved token', async () => {
    getToken.mockResolvedValue(null);

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    await flushBootstrap();

    const loginLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(loginLabels).toContain('LoginScreen');
    expect(loginLabels).not.toContain('HomeScreen');
    expect(setUnauthorizedHandler).toHaveBeenCalled();
  });

  it('shows the authenticated stack when a saved token exists', async () => {
    getToken.mockResolvedValue('driver-token');

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    await flushBootstrap();

    const screenLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(screenLabels).toContain('HomeScreen');
    expect(screenLabels).toContain('MyDriveScreen');
    expect(screenLabels).toContain('ManifestScreen');
    expect(screenLabels).toContain('StopDetailScreen');
    expect(screenLabels).not.toContain('LoginScreen');
  });

  it('fails safe to the login flow when bootstrap token lookup errors', async () => {
    getToken.mockRejectedValue(new Error('storage unavailable'));

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    await flushBootstrap();

    const screenLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(screenLabels).toContain('LoginScreen');
    expect(screenLabels).not.toContain('HomeScreen');
  });

  it('registers an unauthorized handler that clears auth state', async () => {
    getToken.mockResolvedValue('driver-token');

    let tree;
    await act(async () => {
      tree = renderer.create(<AppNavigator />);
    });

    await flushBootstrap();

    const unauthorizedCallback = setUnauthorizedHandler.mock.calls[0][0];

    await act(async () => {
      await unauthorizedCallback();
    });

    expect(removeClockInTime).toHaveBeenCalled();
    expect(removeToken).toHaveBeenCalled();
    const screenLabels = tree.root.findAllByType(Text).map((node) => node.props.children);
    expect(screenLabels).toContain('LoginScreen');
  });
});
