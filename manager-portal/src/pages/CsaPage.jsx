import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { PageHeader, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';

const DEFAULT_FEDEX_FORM = {
  nickname: 'FCC Portal Access',
  account_number: '',
  billing_contact_name: '',
  billing_company_name: '',
  billing_address_line1: '',
  billing_address_line2: '',
  billing_city: '',
  billing_state_or_province: '',
  billing_postal_code: '',
  billing_country_code: 'US',
  connection_status: 'connected',
  connection_reference: ''
};

const FCC_AUTOMATION_PAUSED = true;
const FCC_PORTAL_URL = 'https://customerconnection.fedex.com/';
const FCC_TABLE_COLUMNS = ['Portal name', 'Portal URL', 'Last updated', 'Status', 'Actions'];

const FEDEX_STATUS_LABELS = {
  not_started: 'Not started',
  pending_mfa: 'Pending MFA',
  connected: 'Connected',
  failed: 'Needs attention',
  disconnected: 'Disconnected'
};

function buildFccPortalPayload(form) {
  return {
    nickname: String(form.nickname || '').trim() || 'FCC Portal Access',
    account_number: String(form.account_number || '').trim(),
    billing_contact_name: form.billing_contact_name || 'FCC Portal',
    billing_company_name: form.billing_company_name || 'ReadyRoute FCC Access',
    billing_address_line1: form.billing_address_line1 || 'FedEx Customer Connection',
    billing_address_line2: form.billing_address_line2 || '',
    billing_city: form.billing_city || 'FCC Portal',
    billing_state_or_province: form.billing_state_or_province || 'NA',
    billing_postal_code: form.billing_postal_code || '00000',
    billing_country_code: form.billing_country_code || 'US',
    connection_status: form.connection_status || 'connected',
    connection_reference: form.connection_reference || ''
  };
}

function formatDateTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function getFedexStatusTone(status) {
  if (status === 'connected') {
    return 'active';
  }
  if (status === 'pending_mfa') {
    return 'warning';
  }
  if (status === 'failed') {
    return 'urgent';
  }
  return 'neutral';
}

function getFedexLastUpdated(account) {
  return formatDateTime(account.updated_at || account.last_verified_at || account.created_at) || 'Not recorded';
}

function getFedexPortalName(account, currentCsa) {
  if (account.nickname && account.nickname !== 'FCC Portal Access') {
    return account.nickname;
  }

  return currentCsa?.company_name ? `${currentCsa.company_name} FCC` : 'FCC Portal Access';
}

export default function CsaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fccSectionRef = useRef(null);
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [linkCodeResponse, setLinkCodeResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState(null);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState(null);
  const [fedexForm, setFedexForm] = useState(DEFAULT_FEDEX_FORM);
  const [editingFedexAccountId, setEditingFedexAccountId] = useState(null);
  const [isSavingFedexAccount, setIsSavingFedexAccount] = useState(false);
  const [fedexFormMessage, setFedexFormMessage] = useState({ type: '', text: '' });
  const [fedexActionAccountId, setFedexActionAccountId] = useState(null);
  const {
    linkedCsas: csas,
    csaQuery,
    selectedCsa: currentCsa,
    selectedCsaId,
    setSelectedCsaId
  } = useSelectedCsa();

  useEffect(() => {
    document.title = 'CSA Access | ReadyRoute';
  }, []);

  const fedexAccountsQuery = useQuery({
    queryKey: ['manager-fedex-accounts', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/fedex-accounts');
      return response.data || { migration_required: false, accounts: [], default_account_id: null, connected_accounts_count: 0 };
    }
  });

  const fedexAccounts = useMemo(() => fedexAccountsQuery.data?.accounts || [], [fedexAccountsQuery.data?.accounts]);
  const fedexConnectedCount = fedexAccountsQuery.data?.connected_accounts_count || 0;
  const isFedexSetupFocus = searchParams.get('focus') === 'fedex';
  const editingFedexAccount = fedexAccounts.find((account) => account.id === editingFedexAccountId);

  useEffect(() => {
    if (!isFedexSetupFocus) {
      return;
    }

    window.requestAnimationFrame(() => {
      fccSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [isFedexSetupFocus]);

  function resetFedexForm({ keepMessage = false } = {}) {
    setFedexForm(DEFAULT_FEDEX_FORM);
    setEditingFedexAccountId(null);
    if (!keepMessage) {
      setFedexFormMessage({ type: '', text: '' });
    }
  }

  function populateFedexForm(account) {
    setEditingFedexAccountId(account.id);
    setFedexForm({
      nickname: account.nickname || '',
      account_number: account.account_number || '',
      billing_contact_name: account.billing_contact_name || '',
      billing_company_name: account.billing_company_name || '',
      billing_address_line1: account.billing_address_line1 || '',
      billing_address_line2: account.billing_address_line2 || '',
      billing_city: account.billing_city || '',
      billing_state_or_province: account.billing_state_or_province || '',
      billing_postal_code: account.billing_postal_code || '',
      billing_country_code: account.billing_country_code || 'US',
      connection_status: account.connection_status || 'not_started',
      connection_reference: account.connection_reference || ''
    });
  }

  async function refreshFedexQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['manager-fedex-accounts', selectedCsaId] }),
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard', selectedCsaId] })
    ]);
  }

  async function handleSwitch(accountId) {
    if (!accountId || accountId === selectedCsaId) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setSwitchingAccountId(accountId);

    try {
      await setSelectedCsaId(accountId);
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not switch CSA right now.');
    } finally {
      setSwitchingAccountId(null);
    }
  }

  async function handleUnlink(csa) {
    if (!csa?.id || csa.id === selectedCsaId || unlinkingAccountId) {
      return;
    }

    const confirmed = window.confirm(
      `Unlink ${csa.company_name || 'this CSA'} from your manager login? This will not delete the CSA or its routes.`
    );

    if (!confirmed) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setUnlinkingAccountId(csa.id);

    try {
      await api.delete(`/manager/csas/${csa.id}/access`);
      setSuccessMessage(`${csa.company_name || 'CSA'} was unlinked from your manager login.`);
      await queryClient.invalidateQueries({ queryKey: ['manager-csas'] });
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not unlink CSA right now.');
    } finally {
      setUnlinkingAccountId(null);
    }
  }

  async function handleGenerateLinkCode() {
    setErrorMessage('');
    setSuccessMessage('');
    setIsGeneratingCode(true);

    try {
      const response = await api.post('/manager/csas/link-code');
      setLinkCodeResponse(response.data || null);
      setSuccessMessage('CSA link code generated. Share it securely with the other CSA workspace.');
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not generate a CSA link code.');
    } finally {
      setIsGeneratingCode(false);
    }
  }

  async function handleLinkExisting(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsLinking(true);
    const normalizedCode = linkCodeInput.trim().toUpperCase();

    try {
      await api.post('/manager/csas/link-existing', {
        code: normalizedCode
      });
      setSuccessMessage('CSA linked successfully. You can switch to it now.');
      setLinkCodeInput('');
      await queryClient.invalidateQueries({ queryKey: ['manager-csas'] });
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not link that CSA.');
    } finally {
      setIsLinking(false);
    }
  }

  function updateFedexField(field, value) {
    setFedexForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  async function handleSaveFedexAccount(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setFedexFormMessage({ type: '', text: '' });

    if (!editingFedexAccountId) {
      setFedexFormMessage({ type: 'error', text: 'FCC credential entry is disabled. Download manifests manually and upload them in ReadyRoute.' });
      return;
    }

    setIsSavingFedexAccount(true);

    try {
      const payload = buildFccPortalPayload(fedexForm);
      await api.patch(`/manager/fedex-accounts/${editingFedexAccountId}`, payload);
      setSuccessMessage('FCC portal entry updated.');
      setFedexFormMessage({ type: 'success', text: 'FCC portal entry saved.' });

      resetFedexForm({ keepMessage: true });
      await refreshFedexQueries();
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Could not save this FCC portal entry.';
      setErrorMessage(message);
      setFedexFormMessage({ type: 'error', text: message });
    } finally {
      setIsSavingFedexAccount(false);
    }
  }

  async function handleSetDefaultFedexAccount(accountId) {
    setErrorMessage('');
    setSuccessMessage('');
    setFedexActionAccountId(accountId);

    try {
      await api.post(`/manager/fedex-accounts/${accountId}/default`);
      setSuccessMessage('Default FCC portal entry updated.');
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not change the default FCC portal entry.');
    } finally {
      setFedexActionAccountId(null);
    }
  }

  async function handleSetFedexStatus(account, nextStatus) {
    setErrorMessage('');
    setSuccessMessage('');
    setFedexActionAccountId(account.id);

    try {
      await api.patch(`/manager/fedex-accounts/${account.id}`, {
        nickname: account.nickname,
        account_number: account.account_number,
        billing_contact_name: account.billing_contact_name || '',
        billing_company_name: account.billing_company_name || '',
        billing_address_line1: account.billing_address_line1,
        billing_address_line2: account.billing_address_line2 || '',
        billing_city: account.billing_city,
        billing_state_or_province: account.billing_state_or_province,
        billing_postal_code: account.billing_postal_code,
        billing_country_code: account.billing_country_code || 'US',
        connection_status: nextStatus,
        connection_reference: account.connection_reference || ''
      });
      setSuccessMessage(
        nextStatus === 'connected'
          ? 'FCC portal entry marked connected.'
          : nextStatus === 'pending_mfa'
            ? 'FCC portal entry moved to pending MFA.'
            : 'FCC portal entry updated.'
      );
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not update the FCC portal entry status.');
    } finally {
      setFedexActionAccountId(null);
    }
  }

  async function handleDisconnectFedexAccount(accountId) {
    setErrorMessage('');
    setSuccessMessage('');
    setFedexActionAccountId(accountId);

    try {
      await api.post(`/manager/fedex-accounts/${accountId}/disconnect`);
      if (editingFedexAccountId === accountId) {
        resetFedexForm();
      }
      setSuccessMessage('FCC portal entry disconnected from this CSA.');
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not disconnect that FCC portal entry.');
    } finally {
      setFedexActionAccountId(null);
    }
  }

  return (
    <section className="page-section csa-access-page">
      <PageHeader
        title="CSA Access"
        description="Manage CSA workspaces and FedEx Customer Connection access."
      />

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
      {successMessage ? <div className="info-banner">{successMessage}</div> : null}

      <div className="csa-grid">
        <section className="card csa-access-section">
          <div className="csa-section-heading">
            <div>
              <div className="card-title">Current workspace</div>
            </div>
            {currentCsa ? <StatusBadge tone="active">Current</StatusBadge> : <StatusBadge>No workspace</StatusBadge>}
          </div>

          <div className="driver-meta">The CSA workspace your manager portal is using now.</div>

          {csaQuery.isLoading ? (
            <div className="driver-meta">Loading CSA access...</div>
          ) : csaQuery.isError ? (
            <div className="error-banner">CSA access could not load right now.</div>
          ) : currentCsa ? (
            <div className="csa-settings-list">
              <article className="csa-settings-row">
                <div>
                  <div className="csa-workspace-name">{currentCsa.company_name}</div>
                  <div className="driver-meta csa-id-value" title={currentCsa.id || 'CSA ID not recorded'}>
                    CSA ID: {currentCsa.id || 'Not recorded'}
                  </div>
                </div>
                <button className="primary-button" onClick={() => navigate('/setup')} type="button">
                  Open workspace
                </button>
              </article>
              <article className="csa-settings-row">
                <div>
                  <div className="csa-workspace-name">Manager login</div>
                  <div className="driver-meta">{currentCsa.manager_email || 'No manager login email recorded'}</div>
                </div>
                <StatusBadge tone="active">Current</StatusBadge>
              </article>
            </div>
          ) : (
            <div className="labor-empty-state">Choose a CSA workspace to continue.</div>
          )}

          {csas.length ? (
            <div className="csa-linked-workspaces">
              <div className="csa-mini-heading">Linked workspaces</div>
              {csas.map((csa) => (
                <article className={`csa-settings-row csa-linked-row${csa.is_current ? ' current' : ''}`} key={csa.id}>
                  <div>
                    <div className="csa-workspace-name">{csa.company_name}</div>
                    <div className="driver-meta">{csa.manager_email || 'No primary email'}</div>
                  </div>
                  <StatusBadge tone={csa.is_current ? 'active' : 'neutral'}>{csa.is_current ? 'Current' : 'Linked'}</StatusBadge>
                  {!csa.is_current ? (
                    <div className="csa-linked-row-actions">
                      <button
                        className="secondary-button"
                        disabled={switchingAccountId === csa.id || unlinkingAccountId === csa.id}
                        onClick={() => handleSwitch(csa.id)}
                        type="button"
                      >
                        {switchingAccountId === csa.id ? 'Switching...' : 'Switch workspace'}
                      </button>
                      <button
                        className="secondary-button csa-danger-button"
                        disabled={switchingAccountId === csa.id || unlinkingAccountId === csa.id}
                        onClick={() => handleUnlink(csa)}
                        type="button"
                      >
                        {unlinkingAccountId === csa.id ? 'Unlinking...' : 'Unlink'}
                      </button>
                    </div>
                  ) : <span aria-hidden="true" />}
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="card csa-access-section">
          <div className="csa-section-heading">
            <div>
              <div className="card-title">Link another CSA</div>
            </div>
          </div>

          <div className="driver-meta">
            Use a one-time link code to connect another CSA workspace to this manager login.
          </div>

          <div className="csa-security-note">
            Generate a code from the workspace you control, or paste a code shared securely by another CSA manager.
          </div>

          <div className="csa-link-actions">
            <button className="secondary-button" disabled={isGeneratingCode} onClick={handleGenerateLinkCode} type="button">
              {isGeneratingCode ? 'Generating...' : 'Generate link code'}
            </button>
            {linkCodeResponse ? (
              <div className="info-banner">
                <strong>{linkCodeResponse.link_code}</strong>
                <div>Expires {linkCodeResponse.expires_at ? formatDateTime(linkCodeResponse.expires_at) : 'soon'}.</div>
              </div>
            ) : null}
          </div>

          <form className="csa-form csa-link-form" onSubmit={handleLinkExisting}>
            <label className="field-label" htmlFor="existing-csa-code">Link code from another CSA</label>
            <input
              className="text-field"
              id="existing-csa-code"
              onChange={(event) => setLinkCodeInput(event.target.value.trimStart().toUpperCase())}
              placeholder="CSA-XXXXXXX"
              value={linkCodeInput}
            />

            <button className="primary-button" disabled={isLinking || !linkCodeInput.trim()} type="submit">
              {isLinking ? 'Linking CSA...' : 'Link workspace'}
            </button>
          </form>
        </section>

        <section className="card csa-access-section csa-fcc-section" id="fcc-connection" ref={fccSectionRef}>
          <div className="csa-section-heading">
            <div>
              <div className="card-title">FCC Connection</div>
              <div className="driver-meta">
                Track FedEx Customer Connection status for this CSA. ReadyRoute does not store FCC usernames or passwords.
              </div>
            </div>
            <div className="csa-fcc-heading-actions">
              <StatusBadge tone="neutral">
                Manual upload only
              </StatusBadge>
            </div>
          </div>

          {isFedexSetupFocus ? (
            <div className="info-banner">
              Download manifests directly from the FCC portal and upload them in ReadyRoute. FCC login credentials cannot be entered or stored here.
            </div>
          ) : null}

          {fedexAccountsQuery.data?.migration_required ? (
            <div className="error-banner">
              Run the latest FedEx accounts migration in Supabase before managing CSA FedEx accounts.
            </div>
          ) : null}

          {FCC_AUTOMATION_PAUSED ? (
            <div className="info-banner">
              FCC portal credentials cannot be entered through ReadyRoute. Download manifests directly from the FCC portal and upload them here manually.
            </div>
          ) : null}

          {fedexAccountsQuery.isLoading ? (
            <div aria-busy="true" className="csa-fcc-table">
              <div className="csa-fcc-table-header">
                {FCC_TABLE_COLUMNS.map((column) => (
                  <span key={column}>{column}</span>
                ))}
              </div>
              {[0, 1].map((row) => (
                <div className="csa-fcc-table-row csa-fcc-loading-row" key={row}>
                  {FCC_TABLE_COLUMNS.map((column) => (
                    <span className="skeleton-line" key={column} />
                  ))}
                </div>
              ))}
            </div>
          ) : fedexAccounts.length ? (
            <div className="csa-fcc-table">
              <div className="csa-fcc-table-header">
                {FCC_TABLE_COLUMNS.map((column) => (
                  <span key={column}>{column}</span>
                ))}
              </div>
              {fedexAccounts.map((account) => {
                const statusLabel = FEDEX_STATUS_LABELS[account.connection_status] || account.connection_status || 'Not started';
                return (
                  <div className="csa-fcc-table-row" key={account.id}>
                    <div className="csa-fcc-main-cell">
                      <strong>{getFedexPortalName(account, currentCsa)}</strong>
                      <span>{account.account_number_masked || 'Masked account unavailable'}</span>
                    </div>
                    <a href={FCC_PORTAL_URL} rel="noreferrer" target="_blank">customerconnection.fedex.com</a>
                    <span>{getFedexLastUpdated(account)}</span>
                    <div className="csa-fcc-status-cell">
                      {account.is_default ? <StatusBadge tone="purple">Default</StatusBadge> : null}
                      <StatusBadge tone={getFedexStatusTone(account.connection_status)}>{statusLabel}</StatusBadge>
                    </div>
                    <div className="csa-fcc-row-actions">
                      <button className="secondary-button" onClick={() => populateFedexForm(account)} type="button">
                        Edit
                      </button>
                      <details className="csa-row-menu">
                        <summary aria-label={`More actions for ${account.nickname || 'FCC Portal Access'}`}>•••</summary>
                        <div className="csa-row-menu-panel">
                          {!account.is_default && !account.disconnected_at ? (
                            <button
                              disabled={fedexActionAccountId === account.id}
                              onClick={() => handleSetDefaultFedexAccount(account.id)}
                              type="button"
                            >
                              {fedexActionAccountId === account.id ? 'Saving...' : 'Set as default'}
                            </button>
                          ) : null}
                          {account.connection_status !== 'connected' && !account.disconnected_at ? (
                            <button
                              disabled={fedexActionAccountId === account.id}
                              onClick={() => handleSetFedexStatus(account, 'connected')}
                              type="button"
                            >
                              {fedexActionAccountId === account.id ? 'Saving...' : 'Mark connected'}
                            </button>
                          ) : null}
                          {account.connection_status !== 'pending_mfa' && !account.disconnected_at ? (
                            <button
                              disabled={fedexActionAccountId === account.id}
                              onClick={() => handleSetFedexStatus(account, 'pending_mfa')}
                              type="button"
                            >
                              {fedexActionAccountId === account.id ? 'Saving...' : 'Pending MFA'}
                            </button>
                          ) : null}
                          {!account.disconnected_at ? (
                            <button
                              className="csa-danger-menu-action"
                              disabled={fedexActionAccountId === account.id}
                              onClick={() => handleDisconnectFedexAccount(account.id)}
                              type="button"
                            >
                              {fedexActionAccountId === account.id ? 'Saving...' : 'Disconnect'}
                            </button>
                          ) : null}
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="csa-fcc-empty-state">
              <div>
                <strong>No FCC portal access saved</strong>
                <span>FCC credentials cannot be added through ReadyRoute. Download manifests from the FCC portal and upload them manually.</span>
              </div>
            </div>
          )}

          {editingFedexAccountId ? (
          <form className="csa-form csa-fcc-form" id="fcc-access-form" onSubmit={handleSaveFedexAccount}>
            <div>
              <div className="card-title">
                Edit FCC Portal Entry
              </div>
              <div className="driver-meta">
                Update the nickname or connection status for this entry. FCC credentials cannot be stored in ReadyRoute.
              </div>
            </div>

            <div className="csa-fedex-form-grid">
              <input
                className="text-field"
                onChange={(event) => updateFedexField('nickname', event.target.value)}
                placeholder="Login nickname"
                value={fedexForm.nickname}
              />
            </div>

            <div className="csa-security-note">
              ReadyRoute does not store FCC/MyBizAccount usernames or passwords. Use manual manifest upload until FedEx-approved access is available.
            </div>

            {fedexFormMessage.text ? (
              <div className={fedexFormMessage.type === 'error' ? 'error-banner' : 'info-banner'}>
                {fedexFormMessage.text}
              </div>
            ) : null}

            <div className="csa-fedex-actions">
              <button className="primary-button" disabled={isSavingFedexAccount} type="submit">
                {isSavingFedexAccount
                  ? 'Saving entry...'
                  : 'Save FCC Portal Entry'}
              </button>
              <button className="secondary-button" onClick={() => resetFedexForm()} type="button">
                Cancel edit
              </button>
            </div>
          </form>
          ) : null}
        </section>

      </div>
    </section>
  );
}
