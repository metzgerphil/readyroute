import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import {
  VEDR_CONNECTION_STATUSES,
  VEDR_PROVIDER_CONFIG,
  VEDR_PROVIDERS
} from '../config/constants';
import { PageHeader, StatusBadge } from '../components/PortalDesignSystem';
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

function ProviderRow({ isActive, isSubmitting, onConnect, onManage, providerKey }) {
  const provider = VEDR_PROVIDER_CONFIG[providerKey];

  return (
    <div className={`vedr-provider-table-row${isActive ? ' active' : ''}`}>
      <div className="vedr-provider-name-cell">
        <div>
          <strong>{provider.brandName}</strong>
          {isActive ? <span>Current provider</span> : null}
        </div>
      </div>

      <div className="vedr-provider-action-cell">
        {isActive ? (
          <button className="secondary-button vedr-provider-button" onClick={() => onManage(providerKey)} type="button">
            Manage
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
  const isAwaitingLogin = activeConnectionStatus === VEDR_CONNECTION_STATUSES.WAITING_FOR_LOGIN
    || activeConnectionStatus === VEDR_CONNECTION_STATUSES.PROVIDER_SELECTED;
  const isSubmittingProvider = saveSettingsMutation.isPending || markConnectedMutation.isPending;
  const isSetupFlow = searchParams.get('source') === 'setup';
  const setupBanner = useMemo(() => {
    if (!isSetupFlow) {
      return null;
    }

    if (activeConnectionStatus === VEDR_CONNECTION_STATUSES.CONNECTED) {
      return {
        tone: 'done',
        title: 'VEDR is connected',
        body: 'Your camera provider is in place, so you can move directly into loading drivers.',
        actionTo: '/drivers?source=setup&focus=drivers',
        actionLabel: 'Continue to Drivers'
      };
    }

    return {
      tone: 'active',
      title: 'Connect the CSA camera provider',
      body: 'Choose the provider, complete the login handoff, then mark the connection complete here to keep onboarding moving.'
    };
  }, [activeConnectionStatus, isSetupFlow]);

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
      handleOpenDashboard(providerKey);
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

        {stateOneHelper}

        <div className="vedr-provider-table">
          <div className="vedr-provider-table-header">
            <span>Company</span>
            <span>Connect</span>
          </div>
          {AVAILABLE_PROVIDER_KEYS.map((providerKey) => (
            <ProviderRow
              isActive={activeProviderKey === providerKey}
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
