import { useEffect, useMemo, useState } from 'react';
import Constants from 'expo-constants';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../services/api';
import appTheme from '../theme/appTheme';

const SUPPORT_CATEGORIES = [
  { value: 'login', label: 'Login' },
  { value: 'routes', label: 'Routes' },
  { value: 'manifest', label: 'Manifest' },
  { value: 'driver_app', label: 'Driver app' },
  { value: 'manager_portal', label: 'Manager tools' },
  { value: 'vehicle_inspection', label: 'Vehicle inspection' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'maps_location', label: 'Maps/location' },
  { value: 'billing', label: 'Billing' },
  { value: 'other', label: 'Other' }
];

const SUPPORT_URGENCIES = [
  { value: 'blocking_today', label: 'Blocking today' },
  { value: 'needs_help_soon', label: 'Need help soon' },
  { value: 'question', label: 'Question' }
];

function getDefaultCategory(screenName, activeMode) {
  if (String(screenName || '').toLowerCase().includes('vehicle') || screenName === 'Home') {
    return 'vehicle_inspection';
  }

  if (String(screenName || '').toLowerCase().includes('manifest')) {
    return 'manifest';
  }

  if (String(screenName || '').toLowerCase().includes('route') || screenName === 'MyDrive' || screenName === 'StopDetail') {
    return 'routes';
  }

  return activeMode === 'manager' ? 'manager_portal' : 'driver_app';
}

export default function SupportRequestModal({
  activeMode,
  currentRouteName,
  identity,
  onClose,
  visible
}) {
  const insets = useSafeAreaInsets();
  const initialCategory = useMemo(
    () => getDefaultCategory(currentRouteName, activeMode),
    [activeMode, currentRouteName]
  );
  const [category, setCategory] = useState(initialCategory);
  const [urgency, setUrgency] = useState('question');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [requestCall, setRequestCall] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      setCategory(initialCategory);
      setUrgency('question');
      setSubject('');
      setDescription('');
      setPhone('');
      setRequestCall(false);
      setIsSubmitting(false);
    }
  }, [initialCategory, visible]);

  async function handleSubmit() {
    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 10) {
      Alert.alert('More detail needed', 'Add a short description of what happened.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post('/support/tickets', {
        name: identity?.fullName,
        phone,
        company: identity?.companyName,
        role: activeMode === 'manager' ? 'manager' : 'driver',
        category,
        urgency,
        subject,
        description: trimmedDescription,
        request_call: requestCall,
        source: 'mobile_support_modal',
        app_surface: activeMode === 'manager' ? 'mobile_manager' : 'driver_app',
        app_version: Constants.expoConfig?.version || Constants.manifest?.version || null,
        page_url: currentRouteName,
        context: {
          surface: 'mobile_app',
          mode: activeMode,
          screen: currentRouteName,
          companyName: identity?.companyName || null
        }
      });

      const reference = response.data?.ticket?.ticket_reference;
      Alert.alert('Support request sent', reference ? `We received it as ${reference}.` : 'We received your request.');
      onClose?.();
    } catch (error) {
      Alert.alert('Could not send request', error.response?.data?.error || 'Try again in a moment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <Pressable accessibilityLabel="Close support request" onPress={onClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>ReadyRoute Support</Text>
              <Text style={styles.title}>What is happening?</Text>
              <Text style={styles.subtitle}>We will include your current mode and screen.</Text>
            </View>
            <Pressable accessibilityLabel="Close support request" onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.optionGroup}>
              <Text style={styles.label}>Area</Text>
              <View style={styles.chipGrid}>
                {SUPPORT_CATEGORIES.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => setCategory(item.value)}
                    style={({ pressed }) => [
                      styles.chip,
                      category === item.value ? styles.chipSelected : null,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <Text style={[styles.chipText, category === item.value ? styles.chipTextSelected : null]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.optionGroup}>
              <Text style={styles.label}>Urgency</Text>
              <View style={styles.chipGrid}>
                {SUPPORT_URGENCIES.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => setUrgency(item.value)}
                    style={({ pressed }) => [
                      styles.chip,
                      urgency === item.value ? styles.chipSelected : null,
                      pressed ? styles.pressed : null
                    ]}
                  >
                    <Text style={[styles.chipText, urgency === item.value ? styles.chipTextSelected : null]}>
                      {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Subject</Text>
              <TextInput
                onChangeText={setSubject}
                placeholder="Short summary"
                placeholderTextColor={appTheme.colors.textTertiary}
                style={styles.input}
                value={subject}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Description</Text>
              <TextInput
                multiline
                onChangeText={setDescription}
                placeholder="What were you trying to do, and what went wrong?"
                placeholderTextColor={appTheme.colors.textTertiary}
                style={[styles.input, styles.textArea]}
                textAlignVertical="top"
                value={description}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Phone</Text>
              <TextInput
                keyboardType="phone-pad"
                onChangeText={setPhone}
                placeholder="Optional"
                placeholderTextColor={appTheme.colors.textTertiary}
                style={styles.input}
                value={phone}
              />
            </View>

            <View style={styles.callRow}>
              <View>
                <Text style={styles.callTitle}>Request a call</Text>
                <Text style={styles.callSubtitle}>Use the phone number above.</Text>
              </View>
              <Switch
                onValueChange={setRequestCall}
                thumbColor={requestCall ? '#ffffff' : '#f5f7f9'}
                trackColor={{ false: '#d7e0e8', true: appTheme.colors.orange }}
                value={requestCall}
              />
            </View>

            <View style={styles.contextBox}>
              <Text style={styles.contextLabel}>Attached context</Text>
              <Text style={styles.contextValue}>{activeMode === 'manager' ? 'Manager mode' : 'Driver mode'} · {currentRouteName || 'Current screen'}</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable disabled={isSubmitting} onPress={onClose} style={({ pressed }) => [styles.secondaryButton, pressed ? styles.pressed : null]}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable disabled={isSubmitting} onPress={handleSubmit} style={({ pressed }) => [styles.primaryButton, pressed ? styles.pressed : null, isSubmitting ? styles.buttonDisabled : null]}>
              {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Send</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: 'rgba(10, 22, 32, 0.42)',
    flex: 1,
    justifyContent: 'flex-end'
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingHorizontal: 18,
    paddingTop: 18
  },
  header: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 14,
    paddingBottom: 14
  },
  headerCopy: {
    flex: 1
  },
  eyebrow: {
    color: appTheme.colors.orange,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  title: {
    color: appTheme.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
    marginTop: 4
  },
  subtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginTop: 4
  },
  closeButton: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40
  },
  closeButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900'
  },
  content: {
    gap: 16,
    paddingBottom: 18
  },
  optionGroup: {
    gap: 9
  },
  label: {
    color: appTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    borderColor: appTheme.colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipSelected: {
    backgroundColor: appTheme.colors.orangeSoft,
    borderColor: appTheme.colors.orange
  },
  chipText: {
    color: appTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17
  },
  chipTextSelected: {
    color: appTheme.colors.orangeDeep
  },
  fieldGroup: {
    gap: 8
  },
  input: {
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 11
  },
  textArea: {
    minHeight: 118
  },
  callRow: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12
  },
  callTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20
  },
  callSubtitle: {
    color: appTheme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 2
  },
  contextBox: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12
  },
  contextLabel: {
    color: appTheme.colors.textTertiary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
    lineHeight: 14,
    textTransform: 'uppercase'
  },
  contextValue: {
    color: appTheme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
    marginTop: 4
  },
  actions: {
    borderTopColor: appTheme.colors.divider,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingTop: 12
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: appTheme.colors.orange,
    borderRadius: 14,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900'
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: appTheme.colors.border,
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50
  },
  secondaryButtonText: {
    color: appTheme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900'
  },
  buttonDisabled: {
    opacity: 0.72
  },
  pressed: {
    opacity: 0.88
  }
});
