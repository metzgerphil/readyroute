import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../services/api';
import { getApiErrorMessage } from '../utils/apiError';

export default function DriverPasswordModal({ onClose, onPasswordChanged, visible }) {
  const insets = useSafeAreaInsets();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function close() {
    if (saving) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmation('');
    setError('');
    onClose?.();
  }

  async function submit() {
    setError('');
    if (newPassword.length < 10) {
      setError('New password must be at least 10 characters.');
      return;
    }
    if (newPassword !== confirmation) {
      setError('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/driver/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      onPasswordChanged?.();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Password could not be updated.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <Text accessibilityRole="header" style={styles.title}>Change password</Text>
          <Text style={styles.body}>After your password changes, sign in again with the new password.</Text>
          <TextInput onChangeText={setCurrentPassword} placeholder="Current password" secureTextEntry style={styles.input} value={currentPassword} />
          <TextInput onChangeText={setNewPassword} placeholder="New password" secureTextEntry style={styles.input} value={newPassword} />
          <TextInput onChangeText={setConfirmation} placeholder="Confirm new password" secureTextEntry style={styles.input} value={confirmation} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable disabled={saving} onPress={submit} style={[styles.primaryButton, saving ? styles.disabled : null]}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Update password</Text>}
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
