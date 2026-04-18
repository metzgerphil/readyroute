import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { SafeAreaView } from 'react-native-safe-area-context';

import api from '../services/api';

function buildPath(points) {
  if (!points.length) {
    return '';
  }

  return points.reduce((path, point, index) => {
    const command = index === 0 ? 'M' : 'L';
    return `${path}${index ? ' ' : ''}${command}${point.x},${point.y}`;
  }, '');
}

export default function SignatureCaptureModal({
  visible,
  currentStop,
  deliveryCode,
  onComplete,
  onClose,
  requiresAgeConfirm
}) {
  const captureViewRef = useRef(null);
  const [paths, setPaths] = useState([]);
  const [currentPath, setCurrentPath] = useState([]);
  const [signerName, setSignerName] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const allPaths = useMemo(() => {
    if (!currentPath.length) {
      return paths;
    }

    return [...paths, currentPath];
  }, [currentPath, paths]);

  const hasSignature = allPaths.length > 0;
  const isConfirmDisabled = !hasSignature || signerName.trim().length < 2 || (requiresAgeConfirm && !ageConfirmed) || isSubmitting;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrentPath([{ x: locationX, y: locationY }]);
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          setCurrentPath((previous) => [...previous, { x: locationX, y: locationY }]);
        },
        onPanResponderRelease: () => {
          setPaths((previous) => (currentPath.length ? [...previous, currentPath] : previous));
          setCurrentPath([]);
        },
        onPanResponderTerminate: () => {
          setPaths((previous) => (currentPath.length ? [...previous, currentPath] : previous));
          setCurrentPath([]);
        }
      }),
    [currentPath]
  );

  function handleClear() {
    setPaths([]);
    setCurrentPath([]);
  }

  async function handleConfirm() {
    if (!currentStop?.id || isConfirmDisabled) {
      return;
    }

    setIsSubmitting(true);

    try {
      const uri = await captureRef(captureViewRef, {
        format: 'jpg',
        quality: 0.9,
        result: 'base64'
      });

      const response = await api.post(`/routes/stops/${currentStop.id}/signature`, {
        image_base64: uri,
        signer_name: signerName.trim(),
        age_confirmed: requiresAgeConfirm ? ageConfirmed : false
      });

      setPaths([]);
      setCurrentPath([]);
      setSignerName('');
      setAgeConfirmed(false);

      onComplete?.({
        deliveryCode,
        signature_url: response.data?.signature_url || null,
        signer_name: signerName.trim(),
        age_confirmed: requiresAgeConfirm ? ageConfirmed : false
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleClose() {
    setPaths([]);
    setCurrentPath([]);
    setSignerName('');
    setAgeConfirmed(false);
    onClose?.();
  }

  return (
    <Modal animationType="slide" onRequestClose={handleClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          <Text style={styles.title}>Capture Signature</Text>
          <Text numberOfLines={1} style={styles.subtitle}>
            {currentStop?.address || 'Capture the recipient signature for this stop.'}
          </Text>

          <TextInput
            autoCapitalize="words"
            onChangeText={setSignerName}
            placeholder="Full name of recipient"
            placeholderTextColor="#8b8b8b"
            style={styles.nameInput}
            value={signerName}
          />

          {requiresAgeConfirm ? (
            <Pressable onPress={() => setAgeConfirmed((current) => !current)} style={styles.checkboxRow}>
              <View style={[styles.checkbox, ageConfirmed && styles.checkboxChecked]}>
                {ageConfirmed ? <Text style={styles.checkboxCheck}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                I confirm recipient is 21 or older and provided valid ID
              </Text>
            </Pressable>
          ) : null}

          <View ref={captureViewRef} collapsable={false} style={styles.signatureCaptureShell}>
            <View {...panResponder.panHandlers} style={styles.signaturePad}>
              {!hasSignature ? <Text style={styles.placeholderText}>Sign here</Text> : null}
              <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
                {allPaths.map((points, index) => (
                  <Path
                    d={buildPath(points)}
                    fill="none"
                    key={`${index}-${points.length}`}
                    stroke="#173042"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                  />
                ))}
              </Svg>
            </View>
          </View>

          <View style={styles.buttonRow}>
            <Pressable onPress={handleClear} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Clear</Text>
            </Pressable>
            <Pressable disabled={isConfirmDisabled} onPress={handleConfirm} style={[styles.primaryButton, isConfirmDisabled && styles.buttonDisabled]}>
              {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Confirm</Text>}
            </Pressable>
          </View>

          <Pressable onPress={handleClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff'
  },
  container: {
    flex: 1,
    padding: 20
  },
  title: {
    color: '#173042',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8
  },
  subtitle: {
    color: '#65727d',
    fontSize: 16,
    marginBottom: 16
  },
  nameInput: {
    backgroundColor: '#f7f7f8',
    borderColor: '#d9dde1',
    borderRadius: 16,
    borderWidth: 1,
    color: '#173042',
    fontSize: 18,
    minHeight: 56,
    paddingHorizontal: 16
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
    marginBottom: 14
  },
  checkbox: {
    alignItems: 'center',
    borderColor: '#c5cdd3',
    borderRadius: 8,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24
  },
  checkboxChecked: {
    backgroundColor: '#FF6200',
    borderColor: '#FF6200'
  },
  checkboxCheck: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800'
  },
  checkboxLabel: {
    color: '#173042',
    flex: 1,
    fontSize: 16,
    lineHeight: 22
  },
  signatureCaptureShell: {
    marginTop: 8
  },
  signaturePad: {
    alignItems: 'center',
    backgroundColor: '#f4f5f7',
    borderColor: '#d9dde1',
    borderRadius: 18,
    borderWidth: 1,
    height: 320,
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative'
  },
  placeholderText: {
    color: '#98a2ad',
    fontSize: 20,
    fontWeight: '600'
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56
  },
  secondaryButtonText: {
    color: '#173042',
    fontSize: 18,
    fontWeight: '700'
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#FF6200',
    borderRadius: 16,
    flex: 1,
    justifyContent: 'center',
    minHeight: 56
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700'
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: '#d9dde1',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 56
  },
  cancelButtonText: {
    color: '#173042',
    fontSize: 18,
    fontWeight: '700'
  },
  buttonDisabled: {
    opacity: 0.6
  }
});
