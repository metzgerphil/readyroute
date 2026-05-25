import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import AppCard from '../components/ui/AppCard';
import { getApiErrorMessage } from '../utils/apiError';
import api from '../services/api';
import appTheme from '../theme/appTheme';

export default function ManagerSettingsScreen({ availableModes = [], identity }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');

  async function handleChangePassword() {
    setPasswordMessage('');
    setPasswordError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Enter your current password and the new password.');
      return;
    }

    if (newPassword.length < 10) {
      setPasswordError('New password must be at least 10 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation must match.');
      return;
    }

    setIsSavingPassword(true);

    try {
      const response = await api.post(
        '/auth/manager/change-password',
        {
          current_password: currentPassword,
          new_password: newPassword
        },
        { authMode: 'manager' }
      );

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(response.data?.message || 'Password updated.');
    } catch (error) {
      setPasswordError(getApiErrorMessage(error, 'Unable to update password.'));
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <ManagerSectionLayout
      eyebrow="Manager Settings"
      subtitle="Workspace access and mobile shell details"
      title="Settings"
    >
      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Current workspace</Text>
        <Text style={styles.primaryValue}>{identity?.companyName || 'Current CSA'}</Text>
        <Text style={styles.secondaryValue}>{identity?.fullName || 'ReadyRoute User'}</Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Active mobile roles</Text>
        <Text style={styles.secondaryValue}>
          {availableModes.includes('manager') ? 'Manager enabled' : 'Manager unavailable'}
        </Text>
        <Text style={styles.secondaryValue}>
          {availableModes.includes('driver') ? 'Driver mode available from this session' : 'Driver mode unavailable'}
        </Text>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Email</Text>
          <Text style={styles.accountValue}>{identity?.managerEmail || 'Manager email unavailable'}</Text>
        </View>
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>Mode</Text>
          <Text style={styles.accountValue}>Manager</Text>
        </View>
      </AppCard>

      <AppCard style={styles.card}>
        <Text style={styles.cardTitle}>Security</Text>
        <Text style={styles.secondaryValue}>Update your manager password.</Text>
        <TextInput
          autoCapitalize="none"
          onChangeText={(value) => {
            setCurrentPassword(value);
            if (passwordError) {
              setPasswordError('');
            }
          }}
          placeholder="Current password"
          placeholderTextColor={appTheme.colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={currentPassword}
        />
        <TextInput
          autoCapitalize="none"
          onChangeText={(value) => {
            setNewPassword(value);
            if (passwordError) {
              setPasswordError('');
            }
          }}
          placeholder="New password"
          placeholderTextColor={appTheme.colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={newPassword}
        />
        <TextInput
          autoCapitalize="none"
          onChangeText={(value) => {
            setConfirmPassword(value);
            if (passwordError) {
              setPasswordError('');
            }
          }}
          placeholder="Confirm new password"
          placeholderTextColor={appTheme.colors.textMuted}
          secureTextEntry
          style={styles.input}
          value={confirmPassword}
        />
        <Pressable
          disabled={isSavingPassword}
          onPress={handleChangePassword}
          style={({ pressed }) => [
            styles.passwordButton,
            isSavingPassword ? styles.passwordButtonDisabled : null,
            pressed && !isSavingPassword ? styles.passwordButtonPressed : null
          ]}
        >
          {isSavingPassword ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.passwordButtonText}>Update password</Text>
          )}
        </Pressable>
        {passwordMessage ? <Text style={styles.successText}>{passwordMessage}</Text> : null}
        {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
      </AppCard>
    </ManagerSectionLayout>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: appTheme.spacing.xs,
    padding: appTheme.spacing.lg
  },
  cardTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.label,
    fontWeight: appTheme.typography.weights.heavy,
    marginBottom: appTheme.spacing.sm
  },
  primaryValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleMedium,
    marginBottom: appTheme.spacing.xs
  },
  secondaryValue: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body
  },
  accountRow: {
    borderTopColor: appTheme.colors.border,
    borderTopWidth: 1,
    gap: 2,
    paddingTop: appTheme.spacing.md
  },
  accountLabel: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    letterSpacing: 0.4,
    textTransform: 'uppercase'
  },
  accountValue: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.body
  },
  input: {
    backgroundColor: appTheme.colors.surface,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    minHeight: 48,
    paddingHorizontal: appTheme.spacing.md,
    paddingVertical: appTheme.spacing.sm
  },
  passwordButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: appTheme.colors.orange,
    borderRadius: appTheme.radius.md,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 170,
    paddingHorizontal: appTheme.spacing.lg
  },
  passwordButtonDisabled: {
    opacity: 0.78
  },
  passwordButtonPressed: {
    opacity: 0.9
  },
  passwordButtonText: {
    color: '#ffffff',
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  successText: {
    color: '#166534',
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.caption
  },
  errorText: {
    color: '#b42318',
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.caption
  }
});
