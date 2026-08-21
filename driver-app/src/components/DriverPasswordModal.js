import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

export default function DriverPasswordModal({ onClose, onPinChanged, visible }) {
  const insets = useSafeAreaInsets();
  const [currentCredential, setCurrentCredential] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    setCurrentCredential('');
    setNewPin('');
    setConfirmation('');
    setError('');
    onClose?.();
  }

  async function submit() {
    setError('');
    if (!/^\d{4}$/.test(newPin)) {
      setError('New PIN must be a 4-digit code.');
      return;
    }
    if (newPin !== confirmation) {
      setError('PINs do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/driver/change-pin', {
        current_credential: currentCredential,
        new_pin: newPin
      });
      setCurrentCredential('');
      setNewPin('');
      setConfirmation('');
      onPinChanged?.();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'PIN could not be updated.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Text accessibilityRole="header" style={styles.title}>Change PIN</Text>
          <Text style={styles.body}>Enter your current PIN or password, then choose a new four-digit PIN. You will sign in again after it changes.</Text>
          <TextInput autoCapitalize="none" onChangeText={setCurrentCredential} placeholder="Current PIN or password" secureTextEntry style={styles.input} value={currentCredential} />
          <TextInput keyboardType="number-pad" maxLength={4} onChangeText={(value) => setNewPin(value.replace(/\D/g, '').slice(0, 4))} placeholder="New 4-digit PIN" secureTextEntry style={styles.input} value={newPin} />
          <TextInput keyboardType="number-pad" maxLength={4} onChangeText={(value) => setConfirmation(value.replace(/\D/g, '').slice(0, 4))} placeholder="Confirm new PIN" secureTextEntry style={styles.input} value={confirmation} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={saving} onPress={submit} style={[styles.primaryButton, saving ? styles.disabled : null]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Update PIN</Text>}
          </Pressable>
          <Pressable disabled={saving} onPress={close} style={styles.closeButton}><Text style={styles.closeButtonText}>Cancel</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(7, 29, 43, 0.52)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 24 },
  title: { color: '#173042', fontSize: 27, fontWeight: '900', marginBottom: 8 },
  body: { color: '#425563', fontSize: 15, lineHeight: 22, marginBottom: 16 },
  input: { borderColor: '#cbd6de', borderRadius: 12, borderWidth: 1, color: '#173042', fontSize: 16, marginBottom: 10, minHeight: 50, paddingHorizontal: 14 },
  error: { color: '#a63b31', fontSize: 14, marginBottom: 8 },
  primaryButton: { alignItems: 'center', backgroundColor: '#ff6200', borderRadius: 14, justifyContent: 'center', minHeight: 50, padding: 12 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  closeButton: { alignItems: 'center', padding: 14 },
  closeButtonText: { color: '#5f6b76', fontWeight: '800' },
  disabled: { opacity: 0.65 }
});
