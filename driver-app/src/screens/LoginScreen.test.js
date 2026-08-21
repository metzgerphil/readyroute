import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import LoginScreen from './LoginScreen';
import api from '../services/api';
import { saveSessionTokens } from '../services/auth';
import { getOrCreateDeviceIdentity } from '../services/deviceIdentity';

jest.mock('../services/api', () => ({
  __esModule: true,
  API_URL: 'https://readyroute-api-staging.example.com',
  default: {
    post: jest.fn()
  }
}));

jest.mock('../services/auth', () => ({
  saveSessionTokens: jest.fn()
}));

jest.mock('../services/deviceIdentity', () => ({
  getOrCreateDeviceIdentity: jest.fn()
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    nativeBuildVersion: '85',
    expoConfig: {}
  }
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    __esModule: true,
    SafeAreaView: ({ children }) => <View>{children}</View>
  };
});

function completeLoginForm(screen) {
  fireEvent.changeText(screen.getByPlaceholderText('Email'), ' vlad@example.com ');
  fireEvent.changeText(screen.getByPlaceholderText('4-digit PIN or password'), ' ReadyRoute!4826 ');
  fireEvent.press(screen.getByText('Sign In'));
}

describe('LoginScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOrCreateDeviceIdentity.mockResolvedValue({
      device_id: '12345678-1234-1234-1234-123456789012',
      device_name: 'ios ReadyRoute device'
    });
    saveSessionTokens.mockResolvedValue(undefined);
  });

  it('signs a driver in through the unified mobile endpoint', async () => {
    api.post.mockResolvedValue({
      data: {
        driver_token: 'driver-token',
        manager_token: null
      }
    });
    const onAuthenticated = jest.fn();
    const screen = render(<LoginScreen onAuthenticated={onAuthenticated} />);

    completeLoginForm(screen);

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith({
        driverToken: 'driver-token',
        managerToken: null
      });
    });
    expect(api.post).toHaveBeenCalledWith('/auth/mobile/login', {
      email: 'vlad@example.com',
      secret: 'ReadyRoute!4826',
      device_id: '12345678-1234-1234-1234-123456789012',
      device_name: 'ios ReadyRoute device'
    }, { skipAuth: true });
    expect(saveSessionTokens).toHaveBeenCalledWith({
      driverToken: 'driver-token',
      managerToken: null
    });
    expect(screen.getByText('TestFlight staging • Build 85')).toBeTruthy();
  });

  it('reports an actual credential rejection without calling the legacy endpoint', async () => {
    api.post.mockRejectedValue({
      response: {
        status: 401,
        data: { error: 'Invalid credentials' }
      }
    });
    const screen = render(<LoginScreen onAuthenticated={jest.fn()} />);

    completeLoginForm(screen);

    expect(await screen.findByText('Incorrect email or PIN/password. Try again.')).toBeTruthy();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(saveSessionTokens).not.toHaveBeenCalled();
  });

  it('uses the legacy driver endpoint only when the mobile endpoint is unavailable', async () => {
    api.post
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: { token: 'legacy-driver-token' } });
    const onAuthenticated = jest.fn();
    const screen = render(<LoginScreen onAuthenticated={onAuthenticated} />);

    completeLoginForm(screen);

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith({
        driverToken: 'legacy-driver-token',
        managerToken: null
      });
    });
    expect(api.post).toHaveBeenNthCalledWith(2, '/auth/driver/login', {
      email: 'vlad@example.com',
      password: 'ReadyRoute!4826',
      device_id: '12345678-1234-1234-1234-123456789012',
      device_name: 'ios ReadyRoute device'
    }, { skipAuth: true });
  });

  it('distinguishes a successful login that cannot be saved on the phone', async () => {
    api.post.mockResolvedValue({
      data: {
        driver_token: 'driver-token',
        manager_token: null
      }
    });
    saveSessionTokens.mockRejectedValue(new Error('Keychain unavailable'));
    const onAuthenticated = jest.fn();
    const screen = render(<LoginScreen onAuthenticated={onAuthenticated} />);

    completeLoginForm(screen);

    expect(await screen.findByText(
      'Your login was accepted, but ReadyRoute could not save it on this phone. Restart the phone and try again.'
    )).toBeTruthy();
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it('reports device identity setup failures before sending credentials', async () => {
    getOrCreateDeviceIdentity.mockRejectedValue(new Error('Secure store unavailable'));
    const screen = render(<LoginScreen onAuthenticated={jest.fn()} />);

    completeLoginForm(screen);

    expect(await screen.findByText(
      'ReadyRoute could not identify this phone. Close and reopen the app, then try again.'
    )).toBeTruthy();
    expect(api.post).not.toHaveBeenCalled();
  });
});
