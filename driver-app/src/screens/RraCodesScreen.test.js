import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import RraCodesScreen from './RraCodesScreen';
import { getRraReferenceCodes } from '../services/rraQuickActions';

jest.mock('../services/rraQuickActions', () => ({ getRraReferenceCodes: jest.fn() }));

test('shows compact verified labels with scroll-only navigation', async () => {
  getRraReferenceCodes.mockResolvedValue({
    delivery: [
      { code: '02', label: 'Incorrect recipient address' },
      { code: '12', label: 'Package sorted to wrong route' }
    ],
    pickup: [{ code: '24', label: 'Pickup cancelled' }]
  });
  const screen = render(<RraCodesScreen />);
  expect(await screen.findByText('Incorrect recipient address')).toBeTruthy();
  expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
  expect(screen.queryByText('Find a code and see what it means')).toBeNull();
  expect(screen.queryByText('›')).toBeNull();
  fireEvent.press(screen.getByText('Pickup'));
  expect(await screen.findByText('Pickup cancelled')).toBeTruthy();
});
