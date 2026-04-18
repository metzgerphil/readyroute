import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  VEDR_CONNECTION_STATUSES,
  VEDR_PROVIDER_CONFIG,
  VEDR_PROVIDERS
} from '../config/constants';
import api from '../services/api';

function createEmptySettings() {
  return {
    provider: null,
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

function ProviderCard({ providerKey, isSubmitting, onConnect }) {
  const provider = VEDR_PROVIDER_CONFIG[providerKey];

  return (
    <article className="card vedr-provider-card">
      <div className="vedr-provider-card-content">
        <div className="vedr-provider-eyebrow">VEDR Provider</div>
        <h2>{provider.brandName}</h2>
        <p>{provider.description}</p>
      </div>

      <button
        className="primary-cta vedr-provider-button"
        disabled={isSubmitting}
        onClick={() => onConnect(providerKey)}
        type="button"
      >
        {isSubmitting ? 'Connecting...' : provider.connectLabel}
      </button>
    </article>
  );
}

function ReturningProviderCard({
  providerKey,
  helperMessage,
  isMutating,
  onOpenDashboard,
  onSwitchProvider
}) {
  const provider = VEDR_PROVIDER_CONFIG[providerKey];
  const primaryLabel = helperMessage
    ? `I'm connected — go to my dashboard →`
    : `Open ${provider.shortName} Dashboard →`;

  return (
    <>
      <div className="vedr-provider-eyebrow">Connected Provider</div>
      <h2>{provider.brandName}</h2>
      <p>{provider.description}</p>

      {helperMessage ? (
        <div className="vedr-helper-banner">
          {helperMessage}
        </div>
      ) : null}

      <button className="primary-cta vedr-dashboard-button" onClick={onOpenDashboard} type="button">
        {primaryLabel}
      </button>

      <div className="vedr-muted-note">
        If prompted to log in when you open the dashboard, just sign in once and your session will persist for future visits.
      </div>

      <button
        className="vedr-switch-link"
        disabled={isMutating}
        onClick={onSwitchProvider}
        type="button"
      >
        Switch provider
      </button>
    </>
  );
}

export default function VedrPage() {
  const queryClient = useQueryClient();
  const [localSettings, setLocalSettings] = useState(null);
  const [helperMessage, setHelperMessage] = useState('');
  const [isSwitchConfirming, setIsSwitchConfirming] = useState(false);
  const [switchingPreviousSettings, setSwitchingPreviousSettings] = useState(null);

  const settingsQuery = useQuery({
    queryKey: ['vedr-settings'],
    queryFn: async () => {
      const response = await api.get('/api/vedr/settings');
      return response.data || createEmptySettings();
    }
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async (provider) => {
      const response = await api.put('/api/vedr/settings', { provider });
      return response.data || createEmptySettings();
    },
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(['vedr-settings'], updatedSettings);
    }
  });

  const markConnectedMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/vedr/settings/mark-connected');
      return response.data || createEmptySettings();
    },
    onSuccess: (updatedSettings) => {
      queryClient.setQueryData(['vedr-settings'], updatedSettings);
    }
  });

  const effectiveSettings = localSettings || settingsQuery.data || createEmptySettings();
  const activeProviderKey = effectiveSettings.provider;
  const activeConnectionStatus = effectiveSettings.connection_status || VEDR_CONNECTION_STATUSES.NOT_STARTED;
  const isAwaitingLogin = activeConnectionStatus === VEDR_CONNECTION_STATUSES.WAITING_FOR_LOGIN
    || activeConnectionStatus === VEDR_CONNECTION_STATUSES.PROVIDER_SELECTED;
  const isSubmittingProvider = saveSettingsMutation.isPending || markConnectedMutation.isPending;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'VEDR | ReadyRoute';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  const stateOneHelper = useMemo(() => {
    if (!helperMessage) {
      return null;
    }

    return (
      <div className="vedr-helper-banner">
        {helperMessage}
      </div>
    );
  }, [helperMessage]);

  function handleConnectProvider(providerKey) {
    const provider = VEDR_PROVIDER_CONFIG[providerKey];

    saveSettingsMutation.mutate(providerKey, {
      onSuccess: (updatedSettings) => {
        setLocalSettings(updatedSettings);
        setIsSwitchConfirming(false);
        setSwitchingPreviousSettings(null);
        setHelperMessage(`We've opened ${provider.shortName} in a new tab. Log in there once — your session will be remembered for future visits. Come back here when you're done.`);
        openInNewTab(provider.loginUrlWithRedirect);
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
        openInNewTab(provider.dashboardUrl || provider.loginUrlWithRedirect);
      }
    });
  }

  function handleOpenLogin(providerKey) {
    const provider = VEDR_PROVIDER_CONFIG[providerKey];
    openInNewTab(provider.loginUrlWithRedirect);
  }

  function handleOpenDashboard(providerKey) {
    const provider = VEDR_PROVIDER_CONFIG[providerKey];
    openInNewTab(provider.dashboardUrl || provider.loginUrlWithRedirect);
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
    saveSettingsMutation.mutate(null, {
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
        <div className="card page-loading-card">Loading VEDR settings...</div>
      </section>
    );
  }

  if (settingsQuery.isError) {
    return (
      <section className="page-section">
        <div className="card">
          <div className="card-title">VEDR Setup</div>
          <div className="error-banner">We couldn&apos;t load your VEDR settings right now.</div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-section vedr-page">
      <div className="page-header">
        <div>
          <div className="vedr-provider-eyebrow">Operations / VEDR</div>
          <h1>VEDR</h1>
          <p>Connect your company&apos;s camera provider once, then jump back into their safety tools any time.</p>
        </div>
      </div>

      {activeProvider ? (
        <div className="card vedr-returning-card">
          <div className="vedr-provider-eyebrow">{isAwaitingLogin ? 'Connection in progress' : 'Connected Provider'}</div>
          <h2>{VEDR_PROVIDER_CONFIG[activeProviderKey].brandName}</h2>
          <p>{VEDR_PROVIDER_CONFIG[activeProviderKey].description}</p>

          {helperMessage ? (
            <div className="vedr-helper-banner">
              {helperMessage}
            </div>
          ) : null}

          {isAwaitingLogin ? (
            <div className="vedr-returning-actions">
              <button className="secondary-button" onClick={() => handleOpenLogin(activeProviderKey)} type="button">
                {`Open ${VEDR_PROVIDER_CONFIG[activeProviderKey].shortName} Login →`}
              </button>
              <button className="primary-cta vedr-dashboard-button" disabled={isSubmittingProvider} onClick={handleFinishConnection} type="button">
                {isSubmittingProvider ? 'Saving...' : `I'm connected — go to my dashboard →`}
              </button>
            </div>
          ) : (
            <ReturningProviderCard
              helperMessage={helperMessage}
              isMutating={isSubmittingProvider}
              onOpenDashboard={() => handleOpenDashboard(activeProviderKey)}
              onSwitchProvider={handleSwitchProvider}
              providerKey={activeProviderKey}
            />
          )}

          {isAwaitingLogin ? (
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
      ) : (
        <div className="card vedr-setup-shell">
          <div className="vedr-setup-header">
            <div className="vedr-provider-eyebrow">First-time setup</div>
            <h2>Choose Your VEDR Provider</h2>
            <p>Select the camera system your company uses. You only need to do this once.</p>
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

          {stateOneHelper}

          <div className="vedr-provider-grid">
            <ProviderCard
              isSubmitting={isSubmittingProvider}
              onConnect={handleConnectProvider}
              providerKey={VEDR_PROVIDERS.GROUNDCLOUD}
            />
            <ProviderCard
              isSubmitting={isSubmittingProvider}
              onConnect={handleConnectProvider}
              providerKey={VEDR_PROVIDERS.VELOCITOR}
            />
          </div>

          <div className="vedr-muted-note">
            Not sure which one you use? Check with your DSP operations team. GroundCloud is provided by Descartes and Velocitor runs the V-Track platform.
          </div>
        </div>
      )}

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
    </section>
  );
}
