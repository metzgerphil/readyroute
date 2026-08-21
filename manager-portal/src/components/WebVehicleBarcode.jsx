import { useMemo } from 'react';
import { toSVG } from '@bwip-js/browser';

import {
  buildWebVehicleBarcodeOptions,
  isRenderableVehicleBarcode
} from '../utils/vehicleBarcode';

export default function WebVehicleBarcode({ barcode }) {
  const value = String(barcode?.value || '');
  const barcodeImage = useMemo(() => {
    if (!isRenderableVehicleBarcode(barcode)) return null;
    try {
      const svg = toSVG(buildWebVehicleBarcodeOptions(value));
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [barcode, value]);

  return (
    <section aria-label={`Code 128 vehicle barcode encoding ${value}`} className="rra-web-barcode">
      <h3>Vehicle barcode</h3>
      <div className="rra-web-barcode-surface">
        {barcodeImage ? (
          <img
            alt={`Scannable Code 128 barcode for ${value}`}
            src={barcodeImage}
          />
        ) : (
          <p className="rra-web-barcode-error" role="alert">
            ReadyRoute could not display this vehicle barcode. Try generating it again.
          </p>
        )}
      </div>
      <strong aria-label={`Encoded value ${value}`} className="rra-web-barcode-value">{value}</strong>
      <span className="rra-web-barcode-type">CODE 128</span>
    </section>
  );
}
