import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';

import RraBarcodeScreen from './RraBarcodeScreen';
import { buildVehicleBarcodeValue } from '../utils/vehicleBarcode';

jest.mock('../components/VehicleBarcodeCard', () => {
  const { Text } = require('react-native');
  return function MockVehicleBarcodeCard({ barcode }) {
    return <Text>{barcode.value}</Text>;
  };
});

describe('buildVehicleBarcodeValue', () => {
  it('adds exactly one uppercase V prefix', () => {
    expect(buildVehicleBarcodeValue('1234')).toBe('V1234');
    expect(buildVehicleBarcodeValue('v1234')).toBe('V1234');
    expect(buildVehicleBarcodeValue('vv1234')).toBe('V1234');
    expect(buildVehicleBarcodeValue('876400\u2019')).toBe('V876400');
    expect(buildVehicleBarcodeValue('')).toBeNull();
  });
});

describe('RraBarcodeScreen', () => {
  it('dismisses the keyboard and shows a clean barcode value', () => {
    jest.useFakeTimers();
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    render(<RraBarcodeScreen />);

    expect(screen.queryByText('ReadyRoute will automatically put V in front.')).toBeNull();

    const input = screen.getByPlaceholderText('Example: 1234');
    fireEvent.changeText(input, '876400\u2019');
    expect(input.props.value).toBe('876400');

    fireEvent.press(screen.getByText('Create Barcode'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('V876400')).toBeTruthy();

    jest.runOnlyPendingTimers();
    dismissSpy.mockRestore();
    jest.useRealTimers();
  });
});
