import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import ManagerSectionLayout from '../components/ManagerSectionLayout';
import AppButton from '../components/ui/AppButton';
import AppCard from '../components/ui/AppCard';
import ErrorState from '../components/ui/ErrorState';
import StatusBadge from '../components/ui/StatusBadge';
import api from '../services/api';
import {
  createEmptyVedrSettings,
  getVedrProviderUrl,
  VEDR_CONNECTION_STATUSES,
  VEDR_PROVIDER_CONFIG,
  VEDR_PROVIDER_KEYS
} from '../services/vedrProviders';
import appTheme from '../theme/appTheme';
import { getApiErrorMessage } from '../utils/apiError';

function getStatusLabel(status) {
  if (status === VEDR_CONNECTION_STATUSES.CONNECTED) {
    return 'Connected';
  }
  if (status === VEDR_CONNECTION_STATUSES.WAITING_FOR_LOGIN || status === VEDR_CONNECTION_STATUSES.PROVIDER_SELECTED) {
    return 'Login pending';
  }
  return 'Not started';
}

function getStatusTone(status) {
  if (status === VEDR_CONNECTION_STATUSES.CONNECTED) {
    return 'active';
  }
  if (status === VEDR_CONNECTION_STATUSES.WAITING_FOR_LOGIN || status === VEDR_CONNECTION_STATUSES.PROVIDER_SELECTED) {
    return 'warning';
  }
  return 'neutral';
}

export default function ManagerVedrScreen({ csaWorkspaceVersion = 0, identity }) {
  const [settings, setSettings] = useState(createEmptyVedrSettings());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function loadSettings() {
    setIsLoading(true);
    setErrorMessage('');

    try {
      const response = await api.get('/api/vedr/settings', { authMode: 'manager' });
      setSettings(response.data || createEmptyVedrSettings());
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to load VEDR settings.'));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, [csaWorkspaceVersion]);

  const activeProvider = settings.provider ? VEDR_PROVIDER_CONFIG[settings.provider] : null;
  const activeStatus = settings.connection_status || VEDR_CONNECTION_STATUSES.NOT_STARTED;
  const isAwaitingLogin = activeStatus === VEDR_CONNECTION_STATUSES.WAITING_FOR_LOGIN ||
    activeStatus === VEDR_CONNECTION_STATUSES.PROVIDER_SELECTED;

  const availableProviders = useMemo(() => VEDR_PROVIDER_KEYS.map((key) => ({
    key,
    ...VEDR_PROVIDER_CONFIG[key]
  })), []);

  async function openProvider(providerKey) {
    const url = getVedrProviderUrl(settings, providerKey);
    if (!url) {
      Alert.alert('Provider unavailable', 'This provider does not have a dashboard link yet.');
      return;
    }

    try {
      await Linking.openURL(url);
    } catch (_error) {
      Alert.alert('Could not open provider', 'Check your connection and try again.');
    }
  }

  async function saveProvider(providerKey) {
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await api.put('/api/vedr/settings', {
        provider: providerKey,
        provider_login_url: null,
        provider_username_hint: null
      }, { authMode: 'manager' });
      setSettings(response.data || createEmptyVedrSettings());
      setSuccessMessage(`${VEDR_PROVIDER_CONFIG[providerKey]?.shortName || 'Provider'} selected.`);
      await openProvider(providerKey);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to save VEDR provider.'));
    } finally {
      setIsSaving(false);
    }
  }

  async function markConnected() {
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await api.post('/api/vedr/settings/mark-connected', null, { authMode: 'manager' });
      setSettings(response.data || createEmptyVedrSettings());
      setSuccessMessage('VEDR provider marked connected.');
      if (settings.provider) {
        await openProvider(settings.provider);
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to mark VEDR connected.'));
    } finally {
      setIsSaving(false);
    }
  }

  function confirmSwitchProvider(providerKey) {
    if (!settings.provider || settings.provider === providerKey) {
      saveProvider(providerKey);
      return;
    }

    Alert.alert(
      'Switch VEDR provider?',
      `This will replace ${activeProvider?.shortName || 'the current provider'} for ${identity?.companyName || 'this CSA'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Switch', style: 'destructive', onPress: () => saveProvider(providerKey) }
      ]
    );
  }

  async function removeProvider() {
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await api.put('/api/vedr/settings', { provider: null }, { authMode: 'manager' });
      setSettings(response.data || createEmptyVedrSettings());
      setSuccessMessage('VEDR provider removed.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, 'Unable to remove VEDR provider.'));
    } finally {
      setIsSaving(false);
    }
  }

  function confirmRemoveProvider() {
    Alert.alert(
      'Remove VEDR provider?',
      `This will clear the VEDR provider for ${identity?.companyName || 'this CSA'}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: removeProvider }
      ]
    );
  }

  if (isLoading) {
    return (
      <ManagerSectionLayout eyebrow="Integrations" subtitle="Loading provider settings" title="VEDR" tone="light">
        <AppCard style={styles.loadingCard}>
          <ActivityIndicator color={appTheme.colors.orange} />
          <Text style={styles.loadingText}>Loading VEDR settings</Text>
        </AppCard>
      </ManagerSectionLayout>
    );
  }

  if (errorMessage && !settings.provider) {
    return (
      <ManagerSectionLayout eyebrow="Integrations" subtitle="Video safety provider setup" title="VEDR" tone="light">
        <ErrorState body={errorMessage} onAction={loadSettings} title="Couldn’t load VEDR" />
      </ManagerSectionLayout>
    );
  }

  return (
    <ManagerSectionLayout
      eyebrow="Integrations"
      subtitle={`${identity?.companyName || 'Current CSA'} video safety and telematics provider`}
      title="VEDR"
      tone="light"
    >
      {successMessage ? <Text style={styles.successText}>{successMessage}</Text> : null}
      {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

      <AppCard style={styles.currentCard}>
        <View style={styles.currentHeader}>
          <View style={styles.currentCopy}>
            <Text style={styles.cardTitle}>Current provider</Text>
            <Text style={styles.providerTitle}>{activeProvider?.brandName || 'No provider selected'}</Text>
            <Text style={styles.providerDescription}>
              {activeProvider?.description || 'Choose the VEDR or telematics platform this CSA uses.'}
            </Text>
          </View>
          <StatusBadge label={getStatusLabel(activeStatus)} tone={getStatusTone(activeStatus)} />
        </View>

        {activeProvider ? (
          <View style={styles.actionRow}>
            <AppButton disabled={isSaving} label={`Open ${activeProvider.shortName}`} onPress={() => openProvider(settings.provider)} variant="outline" />
            {isAwaitingLogin ? <AppButton disabled={isSaving} label="Mark connected" onPress={markConnected} /> : null}
            <AppButton disabled={isSaving} label="Remove" onPress={confirmRemoveProvider} variant="danger" />
          </View>
        ) : null}
      </AppCard>

      <AppCard style={styles.providerListCard}>
        <Text style={styles.cardTitle}>Available providers</Text>
        <View style={styles.providerList}>
          {availableProviders.map((provider) => {
            const isActive = settings.provider === provider.key;
            return (
              <Pressable
                disabled={isSaving}
                key={provider.key}
                onPress={() => confirmSwitchProvider(provider.key)}
                style={({ pressed }) => [
                  styles.providerRow,
                  isActive ? styles.providerRowActive : null,
                  pressed && !isSaving ? styles.pressed : null
                ]}
              >
                <View style={styles.providerRowCopy}>
                  <Text style={styles.providerName}>{provider.brandName}</Text>
                  <Text style={styles.providerDetail}>{provider.description}</Text>
                </View>
                <Text style={[styles.providerAction, isActive ? styles.providerActionActive : null]}>
                  {isActive ? 'Current' : 'Select'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </AppCard>
    </ManagerSectionLayout>
  );
}

const styles = StyleSheet.create({
  loadingCard: {
    alignItems: 'center',
    gap: appTheme.spacing.sm,
    padding: appTheme.spacing.lg
  },
  loadingText: {
    color: appTheme.colors.textSecondary,
    fontWeight: appTheme.typography.weights.heavy
  },
  successText: {
    color: appTheme.colors.greenText,
    fontWeight: appTheme.typography.weights.heavy
  },
  errorText: {
    color: appTheme.colors.dangerText,
    fontWeight: appTheme.typography.weights.heavy
  },
  currentCard: {
    gap: appTheme.spacing.md,
    padding: appTheme.spacing.lg
  },
  currentHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: appTheme.spacing.md
  },
  currentCopy: {
    flex: 1
  },
  cardTitle: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.caption,
    fontWeight: appTheme.typography.weights.heavy,
    textTransform: 'uppercase'
  },
  providerTitle: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.titleMedium,
    fontWeight: appTheme.typography.weights.heavy,
    lineHeight: appTheme.typography.lineHeights.titleMedium,
    marginTop: appTheme.spacing.xs
  },
  providerDescription: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.body,
    lineHeight: appTheme.typography.lineHeights.body,
    marginTop: appTheme.spacing.xs
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: appTheme.spacing.sm
  },
  providerListCard: {
    gap: appTheme.spacing.md,
    padding: appTheme.spacing.md
  },
  providerList: {
    gap: appTheme.spacing.sm
  },
  providerRow: {
    backgroundColor: appTheme.colors.surfaceMuted,
    borderColor: appTheme.colors.border,
    borderRadius: appTheme.radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: appTheme.spacing.md,
    padding: appTheme.spacing.md
  },
  providerRowActive: {
    backgroundColor: appTheme.colors.greenSoft,
    borderColor: '#a8e4c0'
  },
  providerRowCopy: {
    flex: 1
  },
  providerName: {
    color: appTheme.colors.textPrimary,
    fontSize: appTheme.typography.body,
    fontWeight: appTheme.typography.weights.heavy
  },
  providerDetail: {
    color: appTheme.colors.textSecondary,
    fontSize: appTheme.typography.bodySmall,
    lineHeight: appTheme.typography.lineHeights.bodySmall,
    marginTop: 2
  },
  providerAction: {
    color: appTheme.colors.orangeDeep,
    fontSize: appTheme.typography.bodySmall,
    fontWeight: appTheme.typography.weights.heavy
  },
  providerActionActive: {
    color: appTheme.colors.greenText
  },
  pressed: {
    opacity: 0.86
  }
});
