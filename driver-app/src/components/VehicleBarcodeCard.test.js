import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import bwipjs from '@bwip-js/react-native';

import VehicleBarcodeCard, { buildVehicleBarcodeOptions } from './VehicleBarcodeCard';

jest.mock('@bwip-js/react-native', () => ({
  __esModule: true,
  default: { toDataURL: jest.fn() }
}), { virtual: true });

describe('VehicleBarcodeCard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses Code 128 with a high-contrast, screen-resolution configuration', () => {
    expect(buildVehicleBarcodeOptions('V400770', 3)).toEqual({
      bcid: 'code128',
      text: 'V400770',
      scale: 9,
      height: 18,
      includetext: false,
      paddingwidth: 4,
      paddingheight: 3,
      backgroundcolor: 'FFFFFF',
      barcolor: '000000'
    });
  });

  it('generates and displays the scannable barcode with its encoded value', async () => {
    bwipjs.toDataURL.mockResolvedValueOnce({
      uri: 'data:image/png;base64,barcode',
      width: 420,
      height: 180
    });
    const screen = render(<VehicleBarcodeCard barcode={{ symbology: 'CODE128', value: 'V400770' }} />);

    expect(screen.getByText('V400770')).toBeTruthy();
    expect(screen.getByText('CODE 128')).toBeTruthy();
    await waitFor(() => {
      expect(bwipjs.toDataURL).toHaveBeenCalledWith(expect.objectContaining({
        bcid: 'code128',
        text: 'V400770'
      }));
      expect(screen.getByTestId('vehicle-barcode-image').props.source).toEqual({
        uri: 'data:image/png;base64,barcode'
      });
    });
  });
});
