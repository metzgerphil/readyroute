import { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import VehicleBarcodeCard from '../components/VehicleBarcodeCard';
import { buildVehicleBarcodeValue } from '../utils/vehicleBarcode';

export default function RraBarcodeScreen() {
  const scrollViewRef = useRef(null);
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [barcodeValue, setBarcodeValue] = useState(null);
  const normalizedValue = buildVehicleBarcodeValue(vehicleNumber);

  function createBarcode() {
    if (!normalizedValue) return;

    Keyboard.dismiss();
    setBarcodeValue(normalizedValue);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 250);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={styles.title}>Barcode Creator</Text>
        <Text style={styles.label}>Vehicle number</Text>
        <TextInput
          autoCorrect={false}
          keyboardType="number-pad"
          onChangeText={(value) => { setVehicleNumber(value.replace(/\D/g, '')); setBarcodeValue(null); }}
          onSubmitEditing={createBarcode}
          placeholder="Example: 1234"
          style={styles.input}
          value={vehicleNumber}
        />
        <Pressable
          disabled={!normalizedValue}
          onPress={createBarcode}
          style={({ pressed }) => [styles.button, !normalizedValue ? styles.buttonDisabled : null, pressed ? styles.pressed : null]}
        >
          <Text style={styles.buttonText}>Create Barcode</Text>
        </Pressable>
        {barcodeValue ? <VehicleBarcodeCard barcode={{ symbology: 'CODE128', value: barcodeValue }} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f7f5f1', flex: 1 },
  content: { flexGrow: 1, padding: 22, paddingBottom: 40 },
  title: { color: '#173042', fontSize: 30, fontWeight: '900', marginBottom: 34, textAlign: 'center' },
  label: { color: '#173042', fontSize: 16, fontWeight: '800', marginBottom: 8 },
  input: { backgroundColor: '#ffffff', borderColor: '#d7e0e6', borderRadius: 16, borderWidth: 1, color: '#173042', fontSize: 20, minHeight: 58, paddingHorizontal: 16 },
  button: { alignItems: 'center', backgroundColor: '#ff6200', borderRadius: 16, justifyContent: 'center', marginBottom: 24, marginTop: 18, minHeight: 54 },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '900' },
  pressed: { opacity: 0.75 }
});
