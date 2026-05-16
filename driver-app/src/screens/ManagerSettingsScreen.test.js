import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerSettingsScreen from './ManagerSettingsScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn()
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

describe('ManagerSettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates the manager password through the authenticated backend endpoint', async () => {
    api.post.mockResolvedValue({ data: { message: 'Password updated.' } });

    const screen = render(
      <ManagerSettingsScreen
        availableModes={['manager']}
        identity={{
          companyName: 'Bridge Transportation Inc.',
          fullName: 'Phillip Metzger',
          managerEmail: 'phillip@example.com'
        }}
      />
    );

    expect(screen.getByText('phillip@example.com')).toBeTruthy();

    fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'OldPassword!123');
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'NewPassword!2026');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'NewPassword!2026');
    fireEvent.press(screen.getByText('Update password'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith(
        '/auth/manager/change-password',
        {
          current_password: 'OldPassword!123',
          new_password: 'NewPassword!2026'
        },
        { authMode: 'manager' }
      );
    });
    expect(await screen.findByText('Password updated.')).toBeTruthy();
  });

  it('validates password confirmation before saving', () => {
    const screen = render(
      <ManagerSettingsScreen availableModes={['manager']} identity={{ managerEmail: 'phillip@example.com' }} />
    );

    fireEvent.changeText(screen.getByPlaceholderText('Current password'), 'OldPassword!123');
    fireEvent.changeText(screen.getByPlaceholderText('New password'), 'NewPassword!2026');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new password'), 'DifferentPassword!2026');
    fireEvent.press(screen.getByText('Update password'));

    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText('New password and confirmation must match.')).toBeTruthy();
  });
});
