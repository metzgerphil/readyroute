import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  PixelRatio,
  StyleSheet,
  Text,
  View
} from 'react-native';
import bwipjs from '@bwip-js/react-native';

import appTheme from '../theme/appTheme';

const BRAND_NAVY = '#173042';
const BRAND_ORANGE = '#ff6200';

export function buildVehicleBarcodeOptions(value, pixelRatio = PixelRatio.get()) {
  return {
    bcid: 'code128',
    text: String(value || ''),
    scale: Math.max(6, Math.min(12, Math.ceil((Number(pixelRatio) || 1) * 3))),
    height: 18,
    includetext: false,
    paddingwidth: 4,
    paddingheight: 3,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000'
  };
}

export default function VehicleBarcodeCard({ barcode }) {
  const value = String(barcode?.value || '');
  const [source, setSource] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setSource(null);
    setError('');

    if (barcode?.symbology !== 'CODE128' || !value) {
      setError('ReadyRoute could not prepare this vehicle barcode.');
      return () => { active = false; };
    }

    bwipjs.toDataURL(buildVehicleBarcodeOptions(value))
      .then((generated) => {
        if (active) setSource(generated);
      })
      .catch(() => {
        if (active) setError('ReadyRoute could not display this vehicle barcode. Try generating it again.');
      });

    return () => { active = false; };
  }, [barcode?.symbology, value]);

  return (
    <View accessibilityLabel={`Code 128 vehicle barcode encoding ${value}`} style={styles.card}>
      <Text style={styles.heading}>Vehicle barcode</Text>
      <View style={styles.barcodeSurface}>
        {source?.uri ? (
          <Image
            accessibilityLabel={`Scannable Code 128 barcode for ${value}`}
            resizeMode="contain"
            source={{ uri: source.uri }}
            style={styles.barcodeImage}
            testID="vehicle-barcode-image"
          />
        ) : error ? (
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
        ) : (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={BRAND_ORANGE} />
            <Text style={styles.loadingText}>Generating barcode…</Text>
          </View>
        )}
      </View>
      <Text accessibilityLabel={`Encoded value ${value}`} selectable style={styles.value}>{value}</Text>
      <Text style={styles.symbology}>CODE 128</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    padding: 14,
    width: '100%'
  },
  heading: {
    color: BRAND_NAVY,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginBottom: 10,
    textTransform: 'uppercase'
  },
  barcodeSurface: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 174,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%'
  },
  barcodeImage: {
    backgroundColor: '#ffffff',
    height: 146,
    width: '100%'
  },
  loadingRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  loadingText: { color: appTheme.colors.textSecondary, fontSize: 14, fontWeight: '700' },
  errorText: { color: appTheme.colors.dangerText, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  value: {
    color: BRAND_NAVY,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.4,
    marginTop: 12,
    textAlign: 'center'
  },
  symbology: {
    color: appTheme.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
    textAlign: 'center'
  }
});
