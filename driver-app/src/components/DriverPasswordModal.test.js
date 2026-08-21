import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import DriverPasswordModal from './DriverPasswordModal';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { post: jest.fn() }
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 })
}));

describe('DriverPasswordModal PIN workflow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('changes to a personal four-digit PIN and requires a new sign-in', async () => {
    api.post.mockResolvedValue({ data: { message: 'PIN updated.' } });
    const onPinChanged = jest.fn();
    const screen = render(
      <DriverPasswordModal onClose={jest.fn()} onPinChanged={onPinChanged} visible />
    );

    fireEvent.changeText(screen.getByPlaceholderText('Current PIN or password'), '2468');
    fireEvent.changeText(screen.getByPlaceholderText('New 4-digit PIN'), '8642');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new PIN'), '8642');
    fireEvent.press(screen.getByText('Update PIN'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/auth/driver/change-pin', {
        current_credential: '2468',
        new_pin: '8642'
      });
    });
    expect(onPinChanged).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-four-digit PIN before calling the backend', () => {
    const screen = render(
      <DriverPasswordModal onClose={jest.fn()} onPinChanged={jest.fn()} visible />
    );

    fireEvent.changeText(screen.getByPlaceholderText('Current PIN or password'), '2468');
    fireEvent.changeText(screen.getByPlaceholderText('New 4-digit PIN'), '12');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm new PIN'), '12');
    fireEvent.press(screen.getByText('Update PIN'));

    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText('New PIN must be a 4-digit code.')).toBeTruthy();
  });
});
