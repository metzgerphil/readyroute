import React from 'react';
import { Alert, Linking } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import StopDetailScreen from './StopDetailScreen';
import api from '../services/api';
import * as Location from 'expo-location';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn()
  }
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn()
}));

jest.setTimeout(30000);

describe('StopDetailScreen interactions', () => {
  const navigation = { setOptions: jest.fn() };
  const route = { params: { stopId: 'stop-1' } };

  const stopPayload = {
    id: 'stop-1',
    sequence_order: 12,
    status: 'pending',
    stop_type: 'delivery',
    address: '123 Main St, Apt 5, Escondido, CA',
    address_line2: 'Apt 5',
    note_text: '',
    has_note: false,
    is_business: false,
    is_apartment_unit: true,
    secondary_address_type: 'unit',
    unit_label: '5',
    packages: [],
    property_intel: null,
    apartment_intelligence: {
      floor: 2,
      verified: false,
      confidence: 'high',
      source: 'manifest',
      unit_number: '5'
    },
    lat: 33.12,
    lng: -117.21
  };

  beforeEach(() => {
    jest.clearAllMocks();

    api.get.mockResolvedValue({ data: { stop: stopPayload } });
    api.patch.mockResolvedValue({ data: {} });
    api.post.mockResolvedValue({ data: {} });

    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });
    Location.getCurrentPositionAsync.mockResolvedValue({
      coords: {
        latitude: 33.125,
        longitude: -117.215
      }
    });
  });

  async function renderAndFlush() {
    const screen = render(<StopDetailScreen navigation={navigation} route={route} />);
    await act(async () => {
      await Promise.resolve();
    });
    return screen;
  }

  it('saves a new note and refreshes the stop', async () => {
    const screen = await renderAndFlush();

    await screen.findByText('Add note');

    fireEvent.press(screen.getByText('Add note'));
    fireEvent.changeText(screen.getByPlaceholderText('Add a delivery note'), 'Leave at side gate');
    fireEvent.press(screen.getByText('Save'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/stop-1/note', {
        note_text: 'Leave at side gate'
      });
    });

    expect(api.get).toHaveBeenCalledWith('/routes/stops/stop-1');
  });

  it('lets a driver add building access info for future stops', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderAndFlush();

    await screen.findByText('Add access info');

    fireEvent.press(screen.getByText('Add access info'));
    fireEvent.changeText(screen.getByPlaceholderText('Example: #4455'), '#4455');
    fireEvent.changeText(screen.getByPlaceholderText('Example: Use left call box or side gate'), 'Use the south gate call box');
    fireEvent.press(screen.getByText('Save access info'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/stop-1/property-intel', {
        access_code: '#4455',
        access_note: 'Use the south gate call box',
        entry_note: 'Use the south gate call box',
        warning_flags: ['gate']
      });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Access info saved',
      'This access info will show for future deliveries to this building.'
    );

    alertSpy.mockRestore();
  });

  it('lets a driver turn manifest instructions into reusable access info', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        stop: {
          ...stopPayload,
          customer_instructions: ':ROLL UP DOOR::',
          property_intel: {
            location_type: 'house'
          }
        }
      }
    });

    const screen = await renderAndFlush();

    await screen.findByText('Save as access info');

    fireEvent.press(screen.getByText('Save as access info'));

    expect(screen.getByDisplayValue(':ROLL UP DOOR::')).toBeTruthy();
    expect(screen.getByText('Save access info')).toBeTruthy();
  });

  it('saves the current location as the corrected pin', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderAndFlush();

    await screen.findByText('Save current location as correct pin');
    fireEvent.press(screen.getByText('Save current location as correct pin'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/stop-1/correct-location', {
        lat: 33.125,
        lng: -117.215,
        label: 'Driver verified pin'
      });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Location saved',
      'This corrected pin will be reused for future deliveries to this address.'
    );

    alertSpy.mockRestore();
  });

  it('confirms the apartment floor and refreshes the stop', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderAndFlush();

    await screen.findByText('Confirm floor');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm actual floor'), '4');
    fireEvent.press(screen.getByText('Confirm floor'));

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/routes/stops/stop-1/confirm-floor', {
        actual_floor: 4
      });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Floor saved',
      'Thanks. Future deliveries to this unit will use the verified floor.'
    );

    alertSpy.mockRestore();
  });

  it('flags a road issue from the stop detail sheet', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = await renderAndFlush();

    await screen.findByText('Flag this road as problematic');
    fireEvent.press(screen.getByText('Flag this road as problematic'));

    await screen.findByText('Impassable');
    fireEvent.press(screen.getByText('Impassable'));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/routes/stops/stop-1/flag-road', {
        lat_start: 33.125,
        lng_start: -117.215,
        lat_end: 33.12,
        lng_end: -117.21,
        flag_type: 'impassable',
        notes: 'Impassable flagged from stop detail'
      });
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Road flagged',
      'Thanks. Your route team will see this update.'
    );

    alertSpy.mockRestore();
  });

  it('shows an alert if external navigation cannot be opened', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('open failed'));
    const screen = await renderAndFlush();

    await screen.findByText('Navigate');
    fireEvent.press(screen.getByText('Navigate'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Navigation unavailable',
        'Unable to open Google Maps right now.'
      );
    });

    canOpenURLSpy.mockRestore();
    openURLSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('shows manifest contact details with call and email actions', async () => {
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    api.get.mockResolvedValueOnce({
      data: {
        stop: {
          ...stopPayload,
          contact_name: 'Acme Receiving',
          business_name: 'Acme Warehouse',
          company_name: 'Acme Logistics',
          primary_phone: '(555) 111-2222 ext. 9',
          alternate_phone: '555-333-4444',
          email: 'dock@example.com',
          customer_instructions: 'Call before arrival',
          delivery_instructions: 'Use rear dock'
        }
      }
    });

    const screen = await renderAndFlush();

    await screen.findByText('CUSTOMER CONTACT');
    expect(screen.getByText('Acme Receiving')).toBeTruthy();
    expect(screen.getByText('Acme Warehouse')).toBeTruthy();
    expect(screen.getByText('(555) 111-2222 ext. 9')).toBeTruthy();
    expect(screen.getByText('555-333-4444')).toBeTruthy();
    expect(screen.getByText('dock@example.com')).toBeTruthy();
    expect(screen.getAllByText('Call before arrival').length).toBeGreaterThanOrEqual(1);

    fireEvent.press(screen.getAllByText('Call')[0]);
    expect(openURLSpy).toHaveBeenCalledWith('tel:5551112222,9');

    fireEvent.press(screen.getByLabelText('Email dock@example.com'));
    expect(openURLSpy).toHaveBeenCalledWith('mailto:dock%40example.com');

    openURLSpy.mockRestore();
  });

  it('keeps contact-name-only stops clean and shows the no-phone hint', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        stop: {
          ...stopPayload,
          contact_name: 'Name Only Customer'
        }
      }
    });

    const screen = await renderAndFlush();

    await screen.findByText('CUSTOMER CONTACT');
    expect(screen.getByText('Name Only Customer')).toBeTruthy();
    expect(screen.getByText('No phone on manifest.')).toBeTruthy();
    expect(screen.queryByText('Primary phone')).toBeNull();
    expect(screen.queryByText('Alternate phone')).toBeNull();
  });

  it('prevents invalid floor values from submitting', async () => {
    const screen = await renderAndFlush();

    await screen.findByText('Confirm floor');
    fireEvent.changeText(screen.getByPlaceholderText('Confirm actual floor'), '0');
    fireEvent.press(screen.getByText('Confirm floor'));

    expect(api.patch).not.toHaveBeenCalledWith('/routes/stops/stop-1/confirm-floor', expect.anything());
  });

  it('prevents empty notes from submitting', async () => {
    const screen = await renderAndFlush();

    await screen.findByText('Add note');
    fireEvent.press(screen.getByText('Add note'));
    fireEvent.changeText(screen.getByPlaceholderText('Add a delivery note'), '   ');
    fireEvent.press(screen.getByText('Save'));

    expect(api.patch).not.toHaveBeenCalledWith('/routes/stops/stop-1/note', expect.anything());
  });

  it('shows a permission alert when corrected pin save cannot access location', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    const screen = await renderAndFlush();

    await screen.findByText('Save current location as correct pin');
    fireEvent.press(screen.getByText('Save current location as correct pin'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Location needed',
        'Allow location access so ReadyRoute can save the corrected stop pin.'
      );
    });

    expect(api.patch).not.toHaveBeenCalledWith('/routes/stops/stop-1/correct-location', expect.anything());
    alertSpy.mockRestore();
  });

  it('shows a permission alert when road flagging cannot access location', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    const screen = await renderAndFlush();

    await screen.findByText('Flag this road as problematic');
    fireEvent.press(screen.getByText('Flag this road as problematic'));
    await screen.findByText('Impassable');
    fireEvent.press(screen.getByText('Impassable'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Location needed',
        'Allow location access to flag this road from your current position.'
      );
    });

    expect(api.post).not.toHaveBeenCalledWith('/routes/stops/stop-1/flag-road', expect.anything());
    alertSpy.mockRestore();
  });

  it('blocks road flagging when the stop has no usable pin', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    api.get.mockResolvedValue({
      data: {
        stop: {
          ...stopPayload,
          lat: null,
          lng: null
        }
      }
    });

    const screen = await renderAndFlush();

    await screen.findByText('Flag this road as problematic');
    fireEvent.press(screen.getByText('Flag this road as problematic'));
    await screen.findByText('Impassable');
    fireEvent.press(screen.getByText('Impassable'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Stop pin unavailable',
      'This stop does not have a usable pin yet, so the road cannot be flagged from here.'
    );
    expect(api.post).not.toHaveBeenCalledWith('/routes/stops/stop-1/flag-road', expect.anything());

    alertSpy.mockRestore();
  });
});
