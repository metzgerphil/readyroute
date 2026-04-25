import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { clearManagerToken, saveManagerToken } from '../services/auth';
import { ROUTE_SYNC_INTERVAL_OPTIONS, ROUTE_SYNC_TIMEZONES } from '../config/constants';

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
  connection_reference: '',
  fcc_username: '',
  fcc_password: '',
  has_saved_fcc_password: false,
  clear_saved_fcc_password: false
};

const FEDEX_STATUS_LABELS = {
  not_started: 'Not started',
  pending_mfa: 'Pending MFA',
  connected: 'Connected',
  failed: 'Needs attention',
  disconnected: 'Disconnected'
};

const DEFAULT_ROUTE_SYNC_FORM = {
  operations_timezone: 'America/Los_Angeles',
  dispatch_window_start_hour: 6,
  dispatch_window_end_hour: 11,
  manifest_sync_interval_minutes: 15
};

function formatHourLabel(hour) {
  const normalizedHour = Number(hour);
  const period = normalizedHour >= 12 ? 'PM' : 'AM';
  const displayHour = normalizedHour % 12 || 12;
  return `${displayHour}:00 ${period}`;
}

function buildFccPortalAccountNumber(username) {
  const normalized = String(username || '').trim().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `FCC${normalized || 'PORTAL'}`.slice(0, 32);
}

function buildFccPortalPayload(form) {
  const username = String(form.fcc_username || '').trim();

  return {
    ...form,
    nickname: String(form.nickname || '').trim() || 'FCC Portal Access',
    account_number: String(form.account_number || '').trim() || buildFccPortalAccountNumber(username),
    billing_contact_name: form.billing_contact_name || 'FCC Portal',
    billing_company_name: form.billing_company_name || 'ReadyRoute FCC Access',
    billing_address_line1: form.billing_address_line1 || 'FCC Portal Credential',
    billing_address_line2: form.billing_address_line2 || '',
    billing_city: form.billing_city || 'FCC Portal',
    billing_state_or_province: form.billing_state_or_province || 'NA',
    billing_postal_code: form.billing_postal_code || '00000',
    billing_country_code: form.billing_country_code || 'US',
    connection_status: form.connection_status || 'connected',
    fcc_username: username
  };
}

export default function CsaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [linkCodeResponse, setLinkCodeResponse] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState(null);
  const [closeWorkspaceName, setCloseWorkspaceName] = useState('');
  const [isClosingWorkspace, setIsClosingWorkspace] = useState(false);
  const [fedexForm, setFedexForm] = useState(DEFAULT_FEDEX_FORM);
  const [editingFedexAccountId, setEditingFedexAccountId] = useState(null);
  const [isSavingFedexAccount, setIsSavingFedexAccount] = useState(false);
  const [fedexFormMessage, setFedexFormMessage] = useState({ type: '', text: '' });
  const [fedexActionAccountId, setFedexActionAccountId] = useState(null);
  const [routeSyncForm, setRouteSyncForm] = useState(DEFAULT_ROUTE_SYNC_FORM);
  const [isSavingRouteSyncSettings, setIsSavingRouteSyncSettings] = useState(false);

  useEffect(() => {
    document.title = 'CSA Access | ReadyRoute';
  }, []);

  const csaQuery = useQuery({
    queryKey: ['manager-csas'],
    queryFn: async () => {
      const response = await api.get('/manager/csas');
      return response.data || { current_csa: null, csas: [] };
    }
  });

  const fedexAccountsQuery = useQuery({
    queryKey: ['manager-fedex-accounts'],
    queryFn: async () => {
      const response = await api.get('/manager/fedex-accounts');
      return response.data || { migration_required: false, accounts: [], default_account_id: null, connected_accounts_count: 0 };
    }
  });

  const routeSyncSettingsQuery = useQuery({
    queryKey: ['manager-route-sync-settings'],
    queryFn: async () => {
      const response = await api.get('/manager/route-sync-settings');
      return response.data?.route_sync_settings || DEFAULT_ROUTE_SYNC_FORM;
    }
  });

  const csas = useMemo(() => csaQuery.data?.csas || [], [csaQuery.data?.csas]);
  const currentCsa = csaQuery.data?.current_csa || null;
  const fedexAccounts = useMemo(() => fedexAccountsQuery.data?.accounts || [], [fedexAccountsQuery.data?.accounts]);
  const fedexConnectedCount = fedexAccountsQuery.data?.connected_accounts_count || 0;
  const isFedexSetupFocus = searchParams.get('focus') === 'fedex';

  useEffect(() => {
    if (!routeSyncSettingsQuery.data) {
      return;
    }

    setRouteSyncForm({
      operations_timezone: routeSyncSettingsQuery.data.operations_timezone || DEFAULT_ROUTE_SYNC_FORM.operations_timezone,
      dispatch_window_start_hour: Number(
        routeSyncSettingsQuery.data.dispatch_window_start_hour ?? DEFAULT_ROUTE_SYNC_FORM.dispatch_window_start_hour
      ),
      dispatch_window_end_hour: Number(
        routeSyncSettingsQuery.data.dispatch_window_end_hour ?? DEFAULT_ROUTE_SYNC_FORM.dispatch_window_end_hour
      ),
      manifest_sync_interval_minutes: Number(
        routeSyncSettingsQuery.data.manifest_sync_interval_minutes ?? DEFAULT_ROUTE_SYNC_FORM.manifest_sync_interval_minutes
      )
    });
  }, [routeSyncSettingsQuery.data]);

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
      connection_reference: account.connection_reference || '',
      fcc_username: account.fcc_username || '',
      fcc_password: '',
      has_saved_fcc_password: account.has_saved_fcc_password === true,
      clear_saved_fcc_password: false
    });
  }

  async function refreshFedexQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['manager-fedex-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] })
    ]);
  }

  async function refreshRouteSyncSettings() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['manager-route-sync-settings'] }),
      queryClient.invalidateQueries({ queryKey: ['manager-routes'] })
    ]);
  }

  async function handleSwitch(accountId) {
    if (!accountId || accountId === currentCsa?.id) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setSwitchingAccountId(accountId);

    try {
      const response = await api.post('/manager/csas/switch', {
        account_id: accountId
      });

      saveManagerToken(response.data?.token || '');
      window.location.assign('/setup');
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not switch CSA right now.');
    } finally {
      setSwitchingAccountId(null);
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

    try {
      await api.post('/manager/csas/link-existing', {
        code: linkCodeInput
      });
      setSuccessMessage('CSA linked successfully. You can switch to it now.');
      setLinkCodeInput('');
      await queryClient.invalidateQueries({ queryKey: ['manager-csas'] });
      await queryClient.invalidateQueries({ queryKey: ['sidebar-csas'] });
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not link that CSA.');
    } finally {
      setIsLinking(false);
    }
  }

  async function handleCancelReadyRoute(event) {
    event.preventDefault();
    if (!currentCsa?.company_name) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsClosingWorkspace(true);

    try {
      await api.post('/manager/account/cancel', {
        confirm_company_name: closeWorkspaceName
      });
      clearManagerToken();
      window.location.assign('https://readyroute.org');
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not close this ReadyRoute workspace.');
    } finally {
      setIsClosingWorkspace(false);
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

    if (!String(fedexForm.fcc_username || '').trim()) {
      setFedexFormMessage({ type: 'error', text: 'Enter the MyBizAccount/FCC username before saving.' });
      return;
    }

    if ((!editingFedexAccountId || fedexForm.has_saved_fcc_password !== true) && !String(fedexForm.fcc_password || '').trim()) {
      setFedexFormMessage({ type: 'error', text: 'Enter the MyBizAccount password before saving this FCC login.' });
      return;
    }

    setIsSavingFedexAccount(true);

    try {
      const payload = buildFccPortalPayload(fedexForm);
      if (editingFedexAccountId) {
        await api.patch(`/manager/fedex-accounts/${editingFedexAccountId}`, payload);
        setSuccessMessage('FCC portal login updated.');
        setFedexFormMessage({ type: 'success', text: 'FCC portal login saved.' });
      } else {
        await api.post('/manager/fedex-accounts', payload);
        setSuccessMessage('FCC portal login added to this CSA.');
        setFedexFormMessage({ type: 'success', text: 'FCC portal login saved. ReadyRoute can now use it for FCC sync.' });
      }

      resetFedexForm({ keepMessage: true });
      await refreshFedexQueries();
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Could not save this FCC portal login.';
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
      setSuccessMessage('Default FCC portal login updated.');
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not change the default FCC portal login.');
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
        connection_reference: account.connection_reference || '',
        fcc_username: account.fcc_username || ''
      });
      setSuccessMessage(
        nextStatus === 'connected'
          ? 'FCC portal login marked connected.'
          : nextStatus === 'pending_mfa'
            ? 'FCC portal login moved to pending MFA.'
            : 'FCC portal login updated.'
      );
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not update the FCC portal login status.');
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
      setSuccessMessage('FCC portal login disconnected from this CSA.');
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not disconnect that FCC portal login.');
    } finally {
      setFedexActionAccountId(null);
    }
  }

  async function handleSaveRouteSyncSettings(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSavingRouteSyncSettings(true);

    try {
      await api.patch('/manager/route-sync-settings', {
        operations_timezone: routeSyncForm.operations_timezone,
        dispatch_window_start_hour: Number(routeSyncForm.dispatch_window_start_hour),
        dispatch_window_end_hour: Number(routeSyncForm.dispatch_window_end_hour),
        manifest_sync_interval_minutes: Number(routeSyncForm.manifest_sync_interval_minutes)
      });
      setSuccessMessage('Route sync settings updated for this CSA.');
      await refreshRouteSyncSettings();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not update the route sync settings.');
    } finally {
      setIsSavingRouteSyncSettings(false);
    }
  }

  return (
    <section className="page-section">
      <div className="page-header">
        <div>
          <h1>CSA Access</h1>
          <p>Link an existing CSA and switch between your company’s workspaces without logging out.</p>
        </div>
      </div>

      {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}
      {successMessage ? <div className="info-banner">{successMessage}</div> : null}

      <div className="csa-grid">
        <div className="card">
          <div className="card-title">Linked CSAs</div>
          <div className="driver-meta">
            {currentCsa ? `Current workspace: ${currentCsa.company_name}` : 'Choose a CSA workspace to continue.'}
          </div>

          {csaQuery.isLoading ? (
            <div className="driver-meta">Loading CSA access...</div>
          ) : csaQuery.isError ? (
            <div className="error-banner">CSA access could not load right now.</div>
          ) : csas.length ? (
            <div className="csa-list">
              {csas.map((csa) => (
                <article className={`csa-card${csa.is_current ? ' current' : ''}`} key={csa.id}>
                  <div className="csa-card-topline">
                    <strong>{csa.company_name}</strong>
                    <span>{csa.is_current ? 'Current' : 'Linked'}</span>
                  </div>
                  <div className="records-route-meta">
                    <span>{csa.manager_count} managers</span>
                    <span>{csa.driver_count} drivers</span>
                    <span>{csa.vehicle_count} vehicles</span>
                    <span>{csa.routes_today} routes today</span>
                  </div>
                  <div className="records-route-meta">
                    <span>{csa.route_sync_settings?.operations_timezone || 'Local timezone not set'}</span>
                    <span>{csa.route_sync_settings?.dispatch_window_label || 'Dispatch window not set'}</span>
                    <span>{csa.local_date || 'No local date'}</span>
                  </div>
                  <div className="records-route-meta">
                    <span>{csa.ready || 0} ready</span>
                    <span>{csa.review || 0} review</span>
                    <span>{csa.blocked || 0} blocked</span>
                    <span>{csa.dispatched || 0} dispatched</span>
                  </div>
                  <div className="records-route-meta">
                    <span>{csa.manager_email || 'No primary email'}</span>
                  </div>
                  {!csa.is_current ? (
                    <button
                      className="secondary-button"
                      disabled={switchingAccountId === csa.id}
                      onClick={() => handleSwitch(csa.id)}
                      type="button"
                    >
                      {switchingAccountId === csa.id ? 'Switching...' : 'Switch to this CSA'}
                    </button>
                  ) : (
                    <button className="secondary-button" onClick={() => navigate('/setup')} type="button">
                      Open workspace
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="labor-empty-state">No CSA workspaces are linked to this manager yet.</div>
          )}
        </div>

        <div className="card">
          <div className="card-title">Link an Existing CSA</div>
          <div className="driver-meta">
            Use a one-time link code from another CSA workspace to add it to this same manager login and switch between them easily.
          </div>

          <div className="csa-link-actions">
            <button className="secondary-button" disabled={isGeneratingCode} onClick={handleGenerateLinkCode} type="button">
              {isGeneratingCode ? 'Generating...' : 'Generate link code for this CSA'}
            </button>
            {linkCodeResponse ? (
              <div className="info-banner">
                <strong>{linkCodeResponse.link_code}</strong>
                <div>Expires {linkCodeResponse.expires_at ? new Date(linkCodeResponse.expires_at).toLocaleString() : 'soon'}.</div>
              </div>
            ) : null}
          </div>

          <form className="csa-form" onSubmit={handleLinkExisting}>
            <label className="field-label" htmlFor="existing-csa-code">Link code from another CSA</label>
            <input
              className="text-field"
              id="existing-csa-code"
              onChange={(event) => setLinkCodeInput(event.target.value.toUpperCase())}
              placeholder="CSA-XXXXXXX"
              value={linkCodeInput}
            />

            <button className="secondary-button" disabled={isLinking} type="submit">
              {isLinking ? 'Linking CSA...' : 'Link existing CSA'}
            </button>
          </form>
        </div>

        <div className="card">
          <div className="card-title">FCC Portal Access</div>
          <div className="driver-meta">
            Save the MyBizAccount/FCC login ReadyRoute should use to pull Combined Manifest data for this CSA.
          </div>

          {isFedexSetupFocus ? (
            <div className="info-banner">
              Add the FCC portal username and password for this CSA. ReadyRoute uses this login to open MyBizAccount and pull manifests automatically.
            </div>
          ) : null}

          {fedexAccountsQuery.data?.migration_required ? (
            <div className="error-banner">
              Run the latest FedEx accounts migration in Supabase before managing CSA FedEx accounts.
            </div>
          ) : null}

          <div className="csa-fedex-summary">
            <div>
              <strong>{fedexAccounts.length}</strong>
              <span>portal logins on file</span>
            </div>
            <div>
              <strong>{fedexConnectedCount}</strong>
              <span>connected</span>
            </div>
            <div>
              <strong>{fedexAccountsQuery.data?.default_account_label || 'None selected'}</strong>
              <span>default FCC login</span>
            </div>
          </div>

          {fedexAccounts.length ? (
            <div className="csa-fedex-list">
              {fedexAccounts.map((account) => (
                <article className={`csa-fedex-card${account.is_default ? ' default' : ''}`} key={account.id}>
                  <div className="csa-fedex-card-topline">
                    <div>
                      <strong>{account.nickname}</strong>
                    <div className="driver-meta">
                      {account.fcc_username ? `MyBizAccount: ${account.fcc_username}` : 'MyBizAccount login not configured'}
                    </div>
                    {account.fcc_username ? (
                      <div className="driver-meta">
                        {account.has_saved_fcc_password ? 'Password saved for FCC automation' : 'Password missing'}
                      </div>
                    ) : (
                      <div className="driver-meta">FCC login not configured yet.</div>
                    )}
                  </div>
                    <div className="csa-fedex-chip-row">
                      {account.is_default ? <span className="csa-fedex-chip default">Default</span> : null}
                      <span className={`csa-fedex-chip status ${account.connection_status}`}>
                        {FEDEX_STATUS_LABELS[account.connection_status] || account.connection_status}
                      </span>
                    </div>
                  </div>

                  <div className="records-route-meta">
                    <span>{account.account_number_masked}</span>
                    <span>{account.connection_status === 'connected' ? 'Ready for sync' : 'Not ready for sync'}</span>
                    <span>{account.last_verified_at ? `Verified ${new Date(account.last_verified_at).toLocaleDateString()}` : 'Not yet verified'}</span>
                  </div>

                  <div className="csa-fedex-actions">
                    <button className="secondary-button" onClick={() => populateFedexForm(account)} type="button">
                      Edit login
                    </button>
                    {!account.is_default && !account.disconnected_at ? (
                      <button
                        className="secondary-button"
                        disabled={fedexActionAccountId === account.id}
                        onClick={() => handleSetDefaultFedexAccount(account.id)}
                        type="button"
                      >
                        {fedexActionAccountId === account.id ? 'Saving...' : 'Set as default'}
                      </button>
                    ) : null}
                    {account.connection_status !== 'connected' && !account.disconnected_at ? (
                      <button
                        className="secondary-button"
                        disabled={fedexActionAccountId === account.id}
                        onClick={() => handleSetFedexStatus(account, 'connected')}
                        type="button"
                      >
                        {fedexActionAccountId === account.id ? 'Saving...' : 'Mark connected'}
                      </button>
                    ) : null}
                    {account.connection_status !== 'pending_mfa' && !account.disconnected_at ? (
                      <button
                        className="secondary-button"
                        disabled={fedexActionAccountId === account.id}
                        onClick={() => handleSetFedexStatus(account, 'pending_mfa')}
                        type="button"
                      >
                        {fedexActionAccountId === account.id ? 'Saving...' : 'Pending MFA'}
                      </button>
                    ) : null}
                    {!account.disconnected_at ? (
                      <button
                        className="secondary-button"
                        disabled={fedexActionAccountId === account.id}
                        onClick={() => handleDisconnectFedexAccount(account.id)}
                        type="button"
                      >
                        {fedexActionAccountId === account.id ? 'Saving...' : 'Disconnect'}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="labor-empty-state">No FCC portal login is saved for this CSA yet.</div>
          )}

          <form className="csa-form" onSubmit={handleSaveFedexAccount}>
            <div className="field-label">
              {editingFedexAccountId ? 'Edit FCC portal login' : 'Add FCC portal login'}
            </div>

            <div className="csa-fedex-form-grid">
              <input
                className="text-field"
                onChange={(event) => updateFedexField('nickname', event.target.value)}
                placeholder="Login nickname"
                value={fedexForm.nickname}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('fcc_username', event.target.value)}
                placeholder="MyBizAccount / FCC username"
                value={fedexForm.fcc_username}
              />
              <input
                className="text-field"
                onChange={(event) => {
                  updateFedexField('fcc_password', event.target.value);
                  if (event.target.value) {
                    updateFedexField('clear_saved_fcc_password', false);
                  }
                }}
                placeholder={editingFedexAccountId ? 'MyBizAccount password (leave blank to keep saved password)' : 'MyBizAccount password'}
                type="password"
                value={fedexForm.fcc_password}
              />
            </div>

            {editingFedexAccountId ? (
              <label className="checkbox-row">
                <input
                  checked={fedexForm.clear_saved_fcc_password === true}
                  onChange={(event) => updateFedexField('clear_saved_fcc_password', event.target.checked)}
                  type="checkbox"
                />
                Clear the saved FCC password
              </label>
            ) : null}

            <div className="driver-meta">
              ReadyRoute uses this login at https://mybizaccount.fedex.com/my.policy, then navigates to FCC to pull the Combined Manifest. The password is stored encrypted and never returned in the API response.
            </div>

            {fedexFormMessage.text ? (
              <div className={fedexFormMessage.type === 'error' ? 'error-banner' : 'info-banner'}>
                {fedexFormMessage.text}
              </div>
            ) : null}

            <div className="csa-fedex-actions">
              <button className="secondary-button" disabled={isSavingFedexAccount} type="submit">
                {isSavingFedexAccount
                  ? (editingFedexAccountId ? 'Saving login...' : 'Adding login...')
                  : (editingFedexAccountId ? 'Save FCC login' : 'Add FCC login')}
              </button>
              {editingFedexAccountId ? (
                <button className="secondary-button" onClick={resetFedexForm} type="button">
                  Cancel edit
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-title">Route Sync Window</div>
          <div className="driver-meta">
            Configure this CSA’s local timezone, dispatch window, and FCC sync cadence. ReadyRoute uses these settings to reason about morning route readiness per terminal instead of assuming one national dispatch schedule.
          </div>

          {routeSyncSettingsQuery.data ? (
            <div className="info-banner">
              Current dispatch window: {routeSyncSettingsQuery.data.dispatch_window_label} · {routeSyncSettingsQuery.data.operations_timezone}
            </div>
          ) : null}

          <form className="csa-form" onSubmit={handleSaveRouteSyncSettings}>
            <div className="csa-fedex-form-grid">
              <label className="field-label">
                Local timezone
                <select
                  className="text-field"
                  onChange={(event) => setRouteSyncForm((current) => ({ ...current, operations_timezone: event.target.value }))}
                  value={routeSyncForm.operations_timezone}
                >
                  {ROUTE_SYNC_TIMEZONES.map((timezone) => (
                    <option key={timezone} value={timezone}>
                      {timezone}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                Dispatch window start
                <select
                  className="text-field"
                  onChange={(event) =>
                    setRouteSyncForm((current) => ({ ...current, dispatch_window_start_hour: Number(event.target.value) }))
                  }
                  value={routeSyncForm.dispatch_window_start_hour}
                >
                  {Array.from({ length: 24 }, (_, hour) => (
                    <option key={hour} value={hour}>
                      {formatHourLabel(hour)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                Dispatch window end
                <select
                  className="text-field"
                  onChange={(event) =>
                    setRouteSyncForm((current) => ({ ...current, dispatch_window_end_hour: Number(event.target.value) }))
                  }
                  value={routeSyncForm.dispatch_window_end_hour}
                >
                  {Array.from({ length: 23 }, (_, index) => index + 1).map((hour) => (
                    <option key={hour} value={hour}>
                      {formatHourLabel(hour)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-label">
                FCC sync cadence
                <select
                  className="text-field"
                  onChange={(event) =>
                    setRouteSyncForm((current) => ({ ...current, manifest_sync_interval_minutes: Number(event.target.value) }))
                  }
                  value={routeSyncForm.manifest_sync_interval_minutes}
                >
                  {ROUTE_SYNC_INTERVAL_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      Every {minutes} minutes
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <button className="secondary-button" disabled={isSavingRouteSyncSettings} type="submit">
              {isSavingRouteSyncSettings ? 'Saving route sync settings...' : 'Save route sync settings'}
            </button>
          </form>
        </div>

        {currentCsa ? (
          <div className="card csa-danger-card">
            <div className="card-title">Cancel ReadyRoute</div>
            <div className="driver-meta">
              Close this workspace, cancel billing, and permanently remove its managers, drivers, vehicles, routes,
              notes, and labor records from ReadyRoute. This does not delete anything in FedEx or your VEDR provider.
            </div>

            <form className="csa-form" onSubmit={handleCancelReadyRoute}>
              <label className="field-label" htmlFor="close-readyroute-name">
                Type <strong>{currentCsa.company_name}</strong> to confirm
              </label>
              <input
                autoComplete="off"
                className="text-field"
                id="close-readyroute-name"
                onChange={(event) => setCloseWorkspaceName(event.target.value)}
                placeholder={currentCsa.company_name}
                value={closeWorkspaceName}
              />

              <button
                className="csa-danger-button"
                disabled={isClosingWorkspace || closeWorkspaceName.trim().toLowerCase() !== currentCsa.company_name.trim().toLowerCase()}
                type="submit"
              >
                {isClosingWorkspace ? 'Closing workspace...' : 'Cancel ReadyRoute'}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </section>
  );
}
