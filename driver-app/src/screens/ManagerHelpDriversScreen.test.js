import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerHelpDriversScreen from './ManagerHelpDriversScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }) => <View>{children}</View> };
});

test('shows secure lifecycle actions for invited, expired, active, and deactivated drivers', async () => {
  api.get.mockResolvedValue({ data: { drivers: [
    { id: '1', name: 'Invited Driver', email: 'invited@example.com', is_active: true, access_status: 'invited' },
    { id: '2', name: 'Expired Driver', email: 'expired@example.com', is_active: true, access_status: 'invite_expired' },
    { id: '3', name: 'Active Driver', email: 'active@example.com', is_active: true, access_status: 'active' },
    { id: '4', name: 'Inactive Driver', email: 'inactive@example.com', is_active: false, access_status: 'deactivated' }
  ] } });
  api.post.mockResolvedValue({ data: {} });
  api.patch.mockResolvedValue({ data: {} });

  const screen = render(<ManagerHelpDriversScreen identity={{ companyName: 'Example Company' }} />);
  await waitFor(() => expect(screen.getByText('Drivers & Invites')).toBeTruthy());
  expect(screen.getAllByText('Resend invite')).toHaveLength(2);
  expect(screen.getByText('Reset access')).toBeTruthy();
  expect(screen.getByText('Reactivate')).toBeTruthy();

  fireEvent.press(screen.getByText('Reset access'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/manager/drivers/3/password-reset', {}, { authMode: 'manager' }));
});
