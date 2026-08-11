import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import ManagerHelpDashboardScreen from './ManagerHelpDashboardScreen';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() }
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }) => <View>{children}</View> };
});

test('renders focused driver-help value and opens mobile driver management', async () => {
  api.get.mockImplementation((url) => {
    if (url === '/manager/drivers') {
      return Promise.resolve({ data: { drivers: [{ id: 'd1', is_active: true }, { id: 'd2', is_active: false }] } });
    }
    return Promise.resolve({
      data: {
        metrics: {
          total_questions: 12,
          approved_answers: 9,
          helpful_feedback: 4,
          helpful_rate: 0.8,
          escalations: 2
        },
        unanswered_questions: [{ id: 'u1', question: 'What do I do here?', status: 'open' }]
      }
    });
  });
  const navigation = { navigate: jest.fn() };
  const screen = render(<ManagerHelpDashboardScreen identity={{ companyName: 'North Valley' }} navigation={navigation} />);

  await waitFor(() => expect(screen.getByText('Driver help activity')).toBeTruthy());
  expect(screen.getByText('North Valley')).toBeTruthy();
  expect(screen.getByText('80%')).toBeTruthy();
  expect(screen.getByText('potential routine interruptions handled')).toBeTruthy();
  expect(screen.queryByText('Routes')).toBeNull();
  expect(screen.queryByText('Fleet Map')).toBeNull();

  fireEvent.press(screen.getByText('Manage'));
  expect(navigation.navigate).toHaveBeenCalledWith('ManagerDrivers');
});
