import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { clearManagerToken, saveManagerToken } from '../services/auth';

const DEFAULT_FEDEX_FORM = {
  nickname: '',
  account_number: '',
  billing_contact_name: '',
  billing_company_name: '',
  billing_address_line1: '',
  billing_address_line2: '',
  billing_city: '',
  billing_state_or_province: '',
  billing_postal_code: '',
  billing_country_code: 'US',
  connection_status: 'not_started',
  connection_reference: ''
};

const FEDEX_STATUS_LABELS = {
  not_started: 'Not started',
  pending_mfa: 'Pending MFA',
  connected: 'Connected',
  failed: 'Needs attention',
  disconnected: 'Disconnected'
};

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
  const [fedexActionAccountId, setFedexActionAccountId] = useState(null);

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

  const csas = useMemo(() => csaQuery.data?.csas || [], [csaQuery.data?.csas]);
  const currentCsa = csaQuery.data?.current_csa || null;
  const fedexAccounts = useMemo(() => fedexAccountsQuery.data?.accounts || [], [fedexAccountsQuery.data?.accounts]);
  const fedexConnectedCount = fedexAccountsQuery.data?.connected_accounts_count || 0;
  const isFedexSetupFocus = searchParams.get('focus') === 'fedex';

  function resetFedexForm() {
    setFedexForm(DEFAULT_FEDEX_FORM);
    setEditingFedexAccountId(null);
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
      queryClient.invalidateQueries({ queryKey: ['manager-fedex-accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['manager-dashboard'] })
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
    setIsSavingFedexAccount(true);

    try {
      if (editingFedexAccountId) {
        await api.patch(`/manager/fedex-accounts/${editingFedexAccountId}`, fedexForm);
        setSuccessMessage('FedEx account updated.');
      } else {
        await api.post('/manager/fedex-accounts', fedexForm);
        setSuccessMessage('FedEx account added to this CSA.');
      }

      resetFedexForm();
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not save this FedEx account.');
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
      setSuccessMessage('Default FedEx account updated.');
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not change the default FedEx account.');
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
          ? 'FedEx account marked connected.'
          : nextStatus === 'pending_mfa'
            ? 'FedEx account moved to pending MFA.'
            : 'FedEx account updated.'
      );
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not update the FedEx account status.');
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
      setSuccessMessage('FedEx account disconnected from this CSA.');
      await refreshFedexQueries();
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not disconnect that FedEx account.');
    } finally {
      setFedexActionAccountId(null);
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
          <div className="card-title">FedEx Accounts</div>
          <div className="driver-meta">
            Add one or more FedEx shipping accounts for this CSA. ReadyRoute will use the default connected account for future FedEx operations.
          </div>

          {isFedexSetupFocus ? (
            <div className="info-banner">
              Add both CSA FedEx accounts here now if you have them. One account should be marked as the default connection for day-to-day operations.
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
              <span>accounts on file</span>
            </div>
            <div>
              <strong>{fedexConnectedCount}</strong>
              <span>connected</span>
            </div>
            <div>
              <strong>{fedexAccountsQuery.data?.default_account_label || 'None selected'}</strong>
              <span>default account</span>
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
                        {account.account_number_masked} · {account.billing_city}, {account.billing_state_or_province}
                      </div>
                    </div>
                    <div className="csa-fedex-chip-row">
                      {account.is_default ? <span className="csa-fedex-chip default">Default</span> : null}
                      <span className={`csa-fedex-chip status ${account.connection_status}`}>
                        {FEDEX_STATUS_LABELS[account.connection_status] || account.connection_status}
                      </span>
                    </div>
                  </div>

                  <div className="records-route-meta">
                    <span>{account.billing_address_line1}</span>
                    <span>{account.billing_postal_code}</span>
                    <span>{account.last_verified_at ? `Verified ${new Date(account.last_verified_at).toLocaleDateString()}` : 'Not yet verified'}</span>
                  </div>

                  <div className="csa-fedex-actions">
                    <button className="secondary-button" onClick={() => populateFedexForm(account)} type="button">
                      Edit account
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
            <div className="labor-empty-state">No FedEx accounts are linked to this CSA yet.</div>
          )}

          <form className="csa-form" onSubmit={handleSaveFedexAccount}>
            <div className="field-label">
              {editingFedexAccountId ? 'Edit FedEx account' : 'Add a FedEx account'}
            </div>

            <div className="csa-fedex-form-grid">
              <input
                className="text-field"
                onChange={(event) => updateFedexField('nickname', event.target.value)}
                placeholder="Account nickname"
                value={fedexForm.nickname}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('account_number', event.target.value)}
                placeholder="FedEx account number"
                value={fedexForm.account_number}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('billing_contact_name', event.target.value)}
                placeholder="Billing contact name"
                value={fedexForm.billing_contact_name}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('billing_company_name', event.target.value)}
                placeholder="Billing company name"
                value={fedexForm.billing_company_name}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('billing_address_line1', event.target.value)}
                placeholder="Billing address line 1"
                value={fedexForm.billing_address_line1}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('billing_address_line2', event.target.value)}
                placeholder="Billing address line 2"
                value={fedexForm.billing_address_line2}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('billing_city', event.target.value)}
                placeholder="City"
                value={fedexForm.billing_city}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('billing_state_or_province', event.target.value)}
                placeholder="State / province"
                value={fedexForm.billing_state_or_province}
              />
              <input
                className="text-field"
                onChange={(event) => updateFedexField('billing_postal_code', event.target.value)}
                placeholder="Postal code"
                value={fedexForm.billing_postal_code}
              />
              <input
                className="text-field"
                maxLength={2}
                onChange={(event) => updateFedexField('billing_country_code', event.target.value.toUpperCase())}
                placeholder="Country code"
                value={fedexForm.billing_country_code}
              />
              <select
                className="text-field"
                onChange={(event) => updateFedexField('connection_status', event.target.value)}
                value={fedexForm.connection_status}
              >
                <option value="not_started">Not started</option>
                <option value="pending_mfa">Pending MFA</option>
                <option value="connected">Connected</option>
                <option value="failed">Needs attention</option>
              </select>
              <input
                className="text-field"
                onChange={(event) => updateFedexField('connection_reference', event.target.value)}
                placeholder="Connection reference (optional)"
                value={fedexForm.connection_reference}
              />
            </div>

            <div className="csa-fedex-actions">
              <button className="secondary-button" disabled={isSavingFedexAccount} type="submit">
                {isSavingFedexAccount
                  ? (editingFedexAccountId ? 'Saving account...' : 'Adding account...')
                  : (editingFedexAccountId ? 'Save FedEx account' : 'Add FedEx account')}
              </button>
              {editingFedexAccountId ? (
                <button className="secondary-button" onClick={resetFedexForm} type="button">
                  Cancel edit
                </button>
              ) : null}
            </div>
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
