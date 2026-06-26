import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import {
  VEDR_CONNECTION_STATUSES,
  VEDR_PROVIDER_CONFIG,
  VEDR_PROVIDERS
} from '../config/constants';
import { ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import api from '../services/api';

function createEmptySettings() {
  return {
    provider: null,
    provider_login_url: null,
    provider_username_hint: null,
    connection_status: VEDR_CONNECTION_STATUSES.NOT_STARTED,
    provider_selected_at: null,
    connection_started_at: null,
    connection_verified_at: null,
    setup_completed_at: null
  };
}

function openInNewTab(url) {
  if (!url) {
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

function getProviderLaunchUrl(settings, providerKey) {
  if (settings?.provider_login_url) {
    return settings.provider_login_url;
  }

  const provider = VEDR_PROVIDER_CONFIG[providerKey];
  return provider?.dashboardUrl || provider?.loginUrlWithRedirect || '';
}

const AVAILABLE_PROVIDER_KEYS = Object.values(VEDR_PROVIDERS);

const PROVIDER_CONNECTION_STATES = Object.freeze({
  NONE: 'none',
  IN_PROGRESS: 'in_progress',
  CURRENT: 'current'
});

function getProviderConnectionState(providerKey, connectionStatus) {
  if (!providerKey) {
    return PROVIDER_CONNECTION_STATES.NONE;
  }

  if (connectionStatus === VEDR_CONNECTION_STATUSES.CONNECTED) {
    return PROVIDER_CONNECTION_STATES.CURRENT;
  }

  return PROVIDER_CONNECTION_STATES.IN_PROGRESS;
}

function ProviderRow({ connectionState, isSelected, isSubmitting, onConnect, onManage, providerKey }) {
  const provider = VEDR_PROVIDER_CONFIG[providerKey];
  const isCurrent = connectionState === PROVIDER_CONNECTION_STATES.CURRENT;
  const isInProgress = connectionState === PROVIDER_CONNECTION_STATES.IN_PROGRESS;
  const providerStatusLabel = isCurrent
    ? 'Current provider'
    : isInProgress
      ? 'Connection in progress'
      : '';

  return (
    <div className={`vedr-provider-table-row${isSelected ? ' active' : ''}`}>
      <div className="vedr-provider-name-cell">
        <div>
          <strong>{provider.brandName}</strong>
          {providerStatusLabel ? <span>{providerStatusLabel}</span> : null}
        </div>
      </div>

      <div className="vedr-provider-action-cell">
        {isSelected ? (
          <button className="secondary-button vedr-provider-button" onClick={() => onManage(providerKey)} type="button">
            {isCurrent ? 'Manage' : 'Continue setup'}
          </button>
        ) : (
          <button
            className="primary-cta vedr-provider-button"
            disabled={isSubmitting}
            onClick={() => onConnect(providerKey)}
            type="button"
          >
            {isSubmitting ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function VedrPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState(null);
  const [helperMessage, setHelperMessage] = useState('');
  const [isSwitchConfirming, setIsSwitchConfirming] = useState(false);
  const [switchingPreviousSettings, setSwitchingPreviousSettings] = useState(null);
  const [comingSoonProviderKey, setComingSoonProviderKey] = useState(null);
  const { selectedCsaId } = useSelectedCsa();

  const settingsQuery = useQuery({
    queryKey: ['vedr-settings', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/api/vedr/settings');
      return response.data || createEmptySettings();
    }
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async ({ provider, provider_login_url, provider_username_hint }) => {
      const response = await api.put('/api/vedr/settings', { provider, provider_login_url, provider_username_hint });
      return response.data || createEmptySettings();
    },
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(['vedr-settings', selectedCsaId], updatedSettings);
    }
  });

  const markConnectedMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/vedr/settings/mark-connected');
      return response.data || createEmptySettings();
    },
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(['vedr-settings', selectedCsaId], updatedSettings);
    }
  });

  const effectiveSettings = localSettings || settingsQuery.data || createEmptySettings();
  const activeProviderKey = effectiveSettings.provider;
  const activeConnectionStatus = effectiveSettings.connection_status || VEDR_CONNECTION_STATUSES.NOT_STARTED;
  const activeProviderConnectionState = getProviderConnectionState(activeProviderKey, activeConnectionStatus);
  const isConnectionInProgress = activeProviderConnectionState === PROVIDER_CONNECTION_STATES.IN_PROGRESS;
  const isCurrentProvider = activeProviderConnectionState === PROVIDER_CONNECTION_STATES.CURRENT;
  const isSubmittingProvider = saveSettingsMutation.isPending || markConnectedMutation.isPending;
  const isSetupFlow = searchParams.get('source') === 'setup';
  const setupBanner = useMemo(() => {
    if (!isSetupFlow) {
      return null;
    }

    if (isCurrentProvider) {
      return {
        tone: 'done',
        title: 'VEDR is connected',
        body: 'Your camera provider is in place, so you can move directly into loading drivers.',
        actionTo: '/drivers?source=setup&focus=drivers',
        actionLabel: 'Continue to Drivers'
      };
    }

    if (isConnectionInProgress) {
      return {
        tone: 'active',
        title: 'Finish the VEDR connection',
        body: 'Complete the provider login handoff, then mark the connection complete here to keep onboarding moving.'
      };
    }

    return {
      tone: 'active',
      title: 'Connect the CSA camera provider',
      body: 'Choose the provider your CSA uses, complete the login handoff, then mark the connection complete here.'
    };
  }, [isConnectionInProgress, isCurrentProvider, isSetupFlow]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'VEDR | ReadyRoute';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  function handleConnectProvider(providerKey) {
    const provider = VEDR_PROVIDER_CONFIG[providerKey];
    const launchUrl = getProviderLaunchUrl(null, providerKey);

    if (!launchUrl) {
      setComingSoonProviderKey(providerKey);
      return;
    }

    saveSettingsMutation.mutate({
      provider: providerKey,
      provider_login_url: null,
      provider_username_hint: null
    }, {
      onSuccess: (updatedSettings) => {
        setLocalSettings(updatedSettings);
        setIsSwitchConfirming(false);
        setSwitchingPreviousSettings(null);
        setHelperMessage(`We've opened ${provider.shortName} in a new tab. Log in there once — your session will be remembered for future visits. Come back here when you're done.`);
        openInNewTab(getProviderLaunchUrl(updatedSettings, providerKey));
      }
    });
  }

  function handleFinishConnection() {
    const provider = activeProviderKey ? VEDR_PROVIDER_CONFIG[activeProviderKey] : null;
    if (!provider) {
      return;
    }

    markConnectedMutation.mutate(undefined, {
      onSuccess: (updatedSettings) => {
        setLocalSettings(updatedSettings);
        setHelperMessage('');
        openInNewTab(getProviderLaunchUrl(updatedSettings, activeProviderKey));
      }
    });
  }

  function handleOpenLogin(providerKey) {
    openInNewTab(getProviderLaunchUrl(effectiveSettings, providerKey));
  }

  function handleOpenDashboard(providerKey) {
    openInNewTab(getProviderLaunchUrl(effectiveSettings, providerKey));
  }

  function handleManageProvider(providerKey) {
    if (providerKey === activeProviderKey) {
      if (isCurrentProvider) {
        handleOpenDashboard(providerKey);
        return;
      }

      handleOpenLogin(providerKey);
      return;
    }

    handleConnectProvider(providerKey);
  }

  function handleSwitchProvider() {
    setSwitchingPreviousSettings(effectiveSettings);
    setLocalSettings(createEmptySettings());
    setHelperMessage('');
    setIsSwitchConfirming(true);
  }

  function cancelSwitchProvider() {
    if (!switchingPreviousSettings) {
      setIsSwitchConfirming(false);
      return;
    }

    setLocalSettings(switchingPreviousSettings);
    setIsSwitchConfirming(false);
    setSwitchingPreviousSettings(null);
  }

  function confirmSwitchProvider() {
    saveSettingsMutation.mutate({ provider: null }, {
      onSuccess: (updatedSettings) => {
        setLocalSettings(updatedSettings);
        setIsSwitchConfirming(false);
        setSwitchingPreviousSettings(null);
        setHelperMessage('');
      }
    });
  }

  if (settingsQuery.isLoading) {
    return (
      <section className="page-section">
        <LoadingState title="Loading VEDR settings" variant="card" />
      </section>
    );
  }

  if (settingsQuery.isError) {
    return (
      <section className="page-section">
        <ErrorState
          title="Unable to load VEDR settings"
          description="We couldn't load your VEDR settings right now."
          onRetry={() => settingsQuery.refetch()}
        />
      </section>
    );
  }

  return (
    <section className="page-section vedr-page">
      <PageHeader
        description="Connect video safety, telematics, and fleet risk providers."
        title="VEDR Providers"
      />

      <div className="card vedr-explainer-card">
        <div>
          <div className="card-title">Video and telematics integrations</div>
          <p>
            Connect your video event data recorder or telematics provider to support safety review, coaching, and fleet visibility.
          </p>
        </div>
        <StatusBadge tone="integration">Integrations</StatusBadge>
      </div>

      {setupBanner ? (
        <div className={`card setup-continue-banner ${setupBanner.tone}`}>
          <div>
            <div className="setup-next-eyebrow">Onboarding</div>
            <h2>{setupBanner.title}</h2>
            <p>{setupBanner.body}</p>
          </div>
          {setupBanner.actionTo ? (
            <Link className="primary-cta setup-next-action" to={setupBanner.actionTo}>
              {setupBanner.actionLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      {activeProviderKey ? (
        <div className="card vedr-returning-card">
          <div className="vedr-provider-eyebrow">{isConnectionInProgress ? 'Connection in progress' : 'Current provider'}</div>
          <h2>{VEDR_PROVIDER_CONFIG[activeProviderKey].brandName}</h2>
          <p>{VEDR_PROVIDER_CONFIG[activeProviderKey].description}</p>

          {isConnectionInProgress && helperMessage ? (
            <div className="vedr-helper-banner">
              {helperMessage}
            </div>
          ) : null}

          {isConnectionInProgress ? (
            <div className="vedr-returning-actions">
              <button className="secondary-button" onClick={() => handleOpenLogin(activeProviderKey)} type="button">
                {`Open ${VEDR_PROVIDER_CONFIG[activeProviderKey].shortName} Login →`}
              </button>
              <button className="primary-cta vedr-dashboard-button" disabled={isSubmittingProvider} onClick={handleFinishConnection} type="button">
                {isSubmittingProvider ? 'Saving...' : `I'm connected — go to my dashboard →`}
              </button>
            </div>
          ) : (
            <>
              <button className="primary-cta vedr-dashboard-button" onClick={() => handleOpenDashboard(activeProviderKey)} type="button">
                {`Open ${VEDR_PROVIDER_CONFIG[activeProviderKey].shortName} Dashboard →`}
              </button>

              <div className="vedr-muted-note">
                If prompted to log in when you open the dashboard, just sign in once and your session will persist for future visits.
              </div>

              <button
                className="vedr-switch-link"
                disabled={isSubmittingProvider}
                onClick={handleSwitchProvider}
                type="button"
              >
                Switch provider
              </button>
            </>
          )}

          {isConnectionInProgress ? (
            <>
              <div className="vedr-muted-note">
                We&apos;ll treat this as fully connected once you confirm your provider session from this page.
              </div>
              <button
                className="vedr-switch-link"
                disabled={isSubmittingProvider}
                onClick={handleSwitchProvider}
                type="button"
              >
                Switch provider
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="card vedr-setup-shell">
        <div className="vedr-setup-header">
          <div>
            <div className="vedr-provider-eyebrow">Provider marketplace</div>
            <h2>{activeProviderKey ? 'Available providers' : 'Choose your VEDR provider'}</h2>
            <p>Select the camera, video safety, or telematics platform your CSA uses.</p>
          </div>
        </div>

        {isSwitchConfirming ? (
          <div className="vedr-confirm-banner">
            <strong>Are you sure you want to switch providers?</strong>
            <span>Your current selection will be removed.</span>
            <div className="vedr-confirm-actions">
              <button className="secondary-button" disabled={isSubmittingProvider} onClick={cancelSwitchProvider} type="button">
                Keep current provider
              </button>
              <button className="primary-cta" disabled={isSubmittingProvider} onClick={confirmSwitchProvider} type="button">
                {isSubmittingProvider ? 'Removing...' : 'Remove provider'}
              </button>
            </div>
          </div>
        ) : null}

        <div className="vedr-provider-table">
          <div className="vedr-provider-table-header">
            <span>Company</span>
            <span>Connect</span>
          </div>
          {AVAILABLE_PROVIDER_KEYS.map((providerKey) => (
            <ProviderRow
              connectionState={activeProviderKey === providerKey ? activeProviderConnectionState : PROVIDER_CONNECTION_STATES.NONE}
              isSelected={activeProviderKey === providerKey}
              isSubmitting={isSubmittingProvider}
              key={providerKey}
              onConnect={activeProviderKey ? handleSwitchProvider : handleConnectProvider}
              onManage={handleManageProvider}
              providerKey={providerKey}
            />
          ))}
        </div>

        <div className="vedr-muted-note">
          Not sure which one you use? Check with your DSP operations team and choose the same camera or telematics platform they already use today.
        </div>
      </div>

      {isSwitchConfirming && switchingPreviousSettings?.provider ? (
        <div className="modal-backdrop">
          <div className="modal-card vedr-switch-modal">
            <div className="modal-header">
              <div className="card-title">Switch VEDR Provider?</div>
              <button className="icon-button" onClick={cancelSwitchProvider} type="button">×</button>
            </div>

            <div className="vedr-switch-modal-copy">
              {`This will disconnect your current ${VEDR_PROVIDER_CONFIG[switchingPreviousSettings.provider]?.shortName || 'provider'} connection from ReadyRoute. You won't lose any data in ${VEDR_PROVIDER_CONFIG[switchingPreviousSettings.provider]?.shortName || 'the provider'} itself. Are you sure?`}
            </div>

            <div className="modal-actions">
              <button className="secondary-inline-button" disabled={isSubmittingProvider} onClick={cancelSwitchProvider} type="button">
                Cancel
              </button>
              <button className="primary-inline-button" disabled={isSubmittingProvider} onClick={confirmSwitchProvider} type="button">
                {isSubmittingProvider ? 'Switching...' : 'Yes, Switch Provider'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeProviderKey ? (
        null
      ) : null}

      {comingSoonProviderKey ? (
        <div className="modal-backdrop">
          <div className="modal-card vedr-coming-soon-modal">
            <div className="modal-header">
              <div className="card-title">Integration coming soon</div>
              <button className="icon-button" onClick={() => setComingSoonProviderKey(null)} type="button">×</button>
            </div>
            <div className="vedr-switch-modal-copy">
              {`${VEDR_PROVIDER_CONFIG[comingSoonProviderKey]?.brandName || 'This provider'} integration is not connected yet.`}
            </div>
            <div className="modal-actions">
              <button className="primary-inline-button" onClick={() => setComingSoonProviderKey(null)} type="button">
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
