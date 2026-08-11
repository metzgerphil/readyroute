import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import KeyboardAwareModal from '../components/ui/KeyboardAwareModal';
import api from '../services/api';
import appTheme from '../theme/appTheme';

const EMPTY_FORM = { name: '', email: '', phone: '', fedex_driver_id: '', username: '' };

function statusLabel(status) {
  return ({ active: 'Active', invited: 'Invite sent', invite_expired: 'Invite expired', deactivated: 'Deactivated', not_invited: 'Not invited' })[status] || 'Not invited';
}

export default function ManagerHelpDriversScreen({ csaWorkspaceVersion = 0, identity }) {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const response = await api.get('/manager/drivers', { authMode: 'manager' });
      setDrivers(response.data?.drivers || []);
      setError('');
    } catch (_requestError) {
      setError('Drivers could not be loaded right now.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [csaWorkspaceVersion]);

  function change(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function createAndInvite() {
    if (!form.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Enter the driver’s full name and a valid email address.');
      return;
    }
    setSaving(true);
    try {
      const response = await api.post('/manager/drivers', {
        ...form,
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        fedex_driver_id: form.fedex_driver_id.trim() || null,
        username: form.username.trim() || null,
        send_invite: true
      }, { authMode: 'manager' });
      setShowForm(false);
      setForm(EMPTY_FORM);
      setError('');
      await load();
      if (response.data?.invitation?.invite_url) {
        Alert.alert('Driver created', 'Email delivery is unavailable. Open the manager web portal to copy the secure invitation link.');
      } else {
        Alert.alert('Invitation sent', `Ready Route invited ${form.name.trim()} to establish their password.`);
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'The driver could not be created and invited.');
    } finally {
      setSaving(false);
    }
  }

  async function sendInvite(driver) {
    try {
      await api.post(`/manager/drivers/${driver.id}/invite`, {}, { authMode: 'manager' });
      await load();
      Alert.alert('Invitation sent', `A secure invitation was prepared for ${driver.name}.`);
    } catch (requestError) {
      Alert.alert('Invitation unavailable', requestError.response?.data?.error || 'Please try again.');
    }
  }

  async function changeStatus(driver) {
    const nextActive = driver.is_active === false;
    try {
      await api.patch(`/manager/drivers/${driver.id}/status`, { is_active: nextActive }, { authMode: 'manager' });
      await load();
    } catch (requestError) {
      Alert.alert('Status not changed', requestError.response?.data?.error || 'Please try again.');
    }
  }

  async function resetAccess(driver) {
    try {
      const response = await api.post(`/manager/drivers/${driver.id}/password-reset`, {}, { authMode: 'manager' });
      Alert.alert(
        'Password reset prepared',
        response.data?.reset_url
          ? 'Email delivery is unavailable. Open the manager web portal to copy the secure reset link.'
          : `A secure password reset email was sent to ${driver.name}.`
      );
    } catch (requestError) {
      Alert.alert('Reset unavailable', requestError.response?.data?.error || 'Please try again.');
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.brand}><Text style={styles.brandReady}>ready</Text>Route</Text>
        <Text style={styles.title}>Drivers & Invites</Text>
        <Text style={styles.subtitle}>{identity?.companyName || 'Your company'} · {drivers.filter((driver) => driver.is_active !== false).length} active</Text>
        <Pressable accessibilityRole="button" onPress={() => { setError(''); setShowForm(true); }} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Add and invite driver</Text>
        </Pressable>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      {loading ? <View style={styles.center}><ActivityIndicator color={appTheme.colors.orange} size="large" /></View> : (
        <FlatList
          contentContainerStyle={styles.list}
          data={drivers}
          keyExtractor={(driver) => driver.id}
          ListEmptyComponent={<Text style={styles.empty}>No drivers yet. Add the first driver to send a secure invitation.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <Text style={styles.driverName}>{item.name}</Text>
                  <Text style={styles.driverMeta}>{item.email}</Text>
                  {item.fedex_driver_id ? <Text style={styles.driverMeta}>FedEx ID: {item.fedex_driver_id}</Text> : null}
                </View>
                <View style={[styles.status, item.access_status === 'active' ? styles.statusActive : null]}>
                  <Text style={styles.statusText}>{statusLabel(item.access_status)}</Text>
                </View>
              </View>
              <View style={styles.actions}>
                {['not_invited', 'invited', 'invite_expired'].includes(item.access_status) ? (
                  <Pressable onPress={() => sendInvite(item)} style={styles.secondaryButton}><Text style={styles.secondaryText}>{item.access_status === 'not_invited' ? 'Send invite' : 'Resend invite'}</Text></Pressable>
                ) : null}
                {item.access_status === 'active' ? (
                  <Pressable onPress={() => resetAccess(item)} style={styles.secondaryButton}><Text style={styles.secondaryText}>Reset access</Text></Pressable>
                ) : null}
                <Pressable onPress={() => changeStatus(item)} style={styles.secondaryButton}><Text style={styles.secondaryText}>{item.is_active === false ? 'Reactivate' : 'Deactivate'}</Text></Pressable>
              </View>
            </View>
          )}
        />
      )}

      <KeyboardAwareModal onClose={() => setShowForm(false)} title="Add and invite driver" visible={showForm}>
        <Text style={styles.formHelp}>The driver will establish a private password from a single-use email invitation. Managers never receive the password.</Text>
        {[
          ['name', 'Full name', 'default'],
          ['email', 'Email address', 'email-address'],
          ['phone', 'Phone number', 'phone-pad'],
          ['fedex_driver_id', 'FedEx ID', 'default'],
          ['username', 'Username (optional)', 'default']
        ].map(([field, label, keyboardType]) => (
          <View key={field} style={styles.field}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput autoCapitalize={field === 'email' || field === 'username' ? 'none' : 'words'} keyboardType={keyboardType} onChangeText={(value) => change(field, value)} style={styles.input} value={form[field]} />
          </View>
        ))}
        <Pressable disabled={saving} onPress={createAndInvite} style={[styles.primaryButton, saving ? styles.disabled : null]}>
          <Text style={styles.primaryButtonText}>{saving ? 'Creating driver…' : 'Create driver and send invite'}</Text>
        </Pressable>
      </KeyboardAwareModal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f7f5f1', flex: 1 },
  header: { alignSelf: 'center', maxWidth: 720, paddingHorizontal: 20, paddingTop: 52, width: '100%' },
  brand: { color: '#ff6200', fontSize: 27, fontWeight: '500' },
  brandReady: { color: '#173042', fontWeight: '900' },
  title: { color: '#173042', fontSize: 29, fontWeight: '900', marginTop: 20 },
  subtitle: { color: '#657582', fontSize: 15, marginTop: 6 },
  primaryButton: { alignItems: 'center', backgroundColor: '#ff6200', borderRadius: 15, marginTop: 18, paddingHorizontal: 18, paddingVertical: 15 },
  primaryButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
  error: { color: '#9f2f18', fontSize: 14, fontWeight: '700', marginTop: 12 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  list: { alignSelf: 'center', gap: 12, maxWidth: 720, padding: 20, width: '100%' },
  card: { backgroundColor: '#fff', borderColor: '#dde5eb', borderRadius: 18, borderWidth: 1, padding: 17 },
  cardTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  cardCopy: { flex: 1 },
  driverName: { color: '#173042', fontSize: 18, fontWeight: '900' },
  driverMeta: { color: '#657582', fontSize: 13, marginTop: 4 },
  status: { backgroundColor: '#fff0e5', borderRadius: 99, paddingHorizontal: 10, paddingVertical: 6 },
  statusActive: { backgroundColor: '#e6f5eb' },
  statusText: { color: '#173042', fontSize: 11, fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 15 },
  secondaryButton: { borderColor: '#cbd8e1', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  secondaryText: { color: '#173042', fontSize: 13, fontWeight: '800' },
  empty: { color: '#657582', fontSize: 15, lineHeight: 22, padding: 24, textAlign: 'center' },
  formHelp: { color: '#657582', fontSize: 14, lineHeight: 20, marginBottom: 10 },
  field: { marginTop: 12 },
  fieldLabel: { color: '#173042', fontSize: 13, fontWeight: '800', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderColor: '#cbd8e1', borderRadius: 13, borderWidth: 1, color: '#173042', fontSize: 16, minHeight: 50, paddingHorizontal: 14 },
  disabled: { opacity: 0.55 }
});
