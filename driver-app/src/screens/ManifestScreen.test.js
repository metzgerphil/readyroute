jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn()
}));

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn()
  }
}));

jest.mock('../services/auth', () => ({
  getPinColorMode: jest.fn(),
  savePinColorMode: jest.fn(),
  subscribePinColorMode: jest.fn(() => jest.fn())
}));

import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import api from '../services/api';
import * as auth from '../services/auth';
import {
  getPinColorModeLabel,
  getStatusConfig,
  isPriorityStop,
  isPickupStop,
  isHazmatStop
} from './ManifestScreen';
import ManifestScreen from './ManifestScreen';

describe('ManifestScreen helpers', () => {
  it('returns the right status presentation for known stop states', () => {
    expect(getStatusConfig('delivered').label).toBe('Delivered');
    expect(getStatusConfig('attempted').label).toBe('Attempted');
    expect(getStatusConfig('incomplete').label).toBe('Incomplete');
    expect(getStatusConfig('pending').label).toBe('Pending');
  });

  it('detects priority and pickup stops from route data', () => {
    expect(isPriorityStop({ priority: true })).toBe(true);
    expect(isPriorityStop({ notes: 'Priority customer drop' })).toBe(true);
    expect(isPriorityStop({ notes: 'standard stop' })).toBe(false);

    expect(isPickupStop({ stop_type: 'pickup' })).toBe(true);
    expect(isPickupStop({ is_pickup: true })).toBe(true);
    expect(isPickupStop({ stop_type: 'delivery' })).toBe(false);
  });

  it('detects hazmat stops from package payloads', () => {
    expect(isHazmatStop({ packages: [{ id: 'pkg-1', hazmat: true }] })).toBe(true);
    expect(isHazmatStop({ packages: [{ id: 'pkg-2', hazmat: false }] })).toBe(false);
    expect(isHazmatStop({ packages: [] })).toBe(false);
  });

  it('exposes plain-language pin color mode labels', () => {
    expect(getPinColorModeLabel('sid')).toBe('SID Colors');
    expect(getPinColorModeLabel('black')).toBe('Black');
  });

  it('lets the driver switch pin color mode from the route list', async () => {
    auth.getPinColorMode.mockResolvedValue('sid');
    auth.savePinColorMode.mockResolvedValue();
    api.get.mockResolvedValue({
      data: {
        route: {
          id: 'route-1',
          stops: [
            {
              id: 'stop-1',
              sequence_order: 1,
              sid: '3061',
              address: '100 Main St, Escondido, CA',
              status: 'pending',
              stop_type: 'delivery',
              packages: []
            }
          ]
        }
      }
    });

    const navigation = {
      navigate: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn())
    };

    const screen = render(<ManifestScreen navigation={navigation} route={{ params: {} }} />);

    await waitFor(() => {
      expect(screen.getByTestId('pin-color-mode-sid')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('pin-color-mode-black'));

    await waitFor(() => {
      expect(auth.savePinColorMode).toHaveBeenCalledWith('black');
    });
  });

  it('opens the detailed stop view when a route row is tapped', async () => {
    auth.getPinColorMode.mockResolvedValue('sid');
    api.get.mockResolvedValue({
      data: {
        route: {
          id: 'route-1',
          stops: [
            {
              id: 'stop-1',
              sequence_order: 1,
              sid: '1061',
              address: '508 E Mission Ave, Escondido, CA',
              status: 'pending',
              stop_type: 'delivery',
              packages: [{ id: 'pkg-1' }]
            }
          ]
        }
      }
    });

    const navigation = {
      navigate: jest.fn(),
      setOptions: jest.fn(),
      addListener: jest.fn(() => jest.fn())
    };

    const screen = render(<ManifestScreen navigation={navigation} route={{ params: {} }} />);

    await waitFor(() => {
      expect(screen.getByText('508 E Mission Ave, Escondido, CA')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('508 E Mission Ave, Escondido, CA'));

    expect(navigation.navigate).toHaveBeenCalledWith('StopDetail', { stopId: 'stop-1' });
  });
});
