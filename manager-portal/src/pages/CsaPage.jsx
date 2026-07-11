import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import api from '../services/api';
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { saveManagerToken } from '../services/auth';

const DEFAULT_FEDEX_FORM = {
  nickname: 'FedEx/MyBizAccount Reference',
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

function buildFccPortalPayload(form, currentCsa) {
  const fallbackReference = String(currentCsa?.id || '').replace(/-/g, '').slice(0, 12);

  return {
    nickname: String(form.nickname || '').trim() || 'FedEx/MyBizAccount Reference',
    account_number: String(form.account_number || '').trim() || fallbackReference,
    billing_contact_name: form.billing_contact_name || 'FCC Portal',
    billing_company_name: form.billing_company_name || 'ReadyRoute FCC Access',
    billing_address_line1: form.billing_address_line1 || 'FedEx Customer Connection',
    billing_address_line2: form.billing_address_line2 || '',
    billing_city: form.billing_city || 'FCC Portal',
    billing_state_or_province: form.billing_state_or_province || 'NA',
    billing_postal_code: form.billing_postal_code || '00000',
    billing_country_code: form.billing_country_code || 'US',
    connection_status: form.connection_status || 'not_started',
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
  if (account.nickname && !['FCC Portal Access', 'MyBizAccount Access', 'FedEx/MyBizAccount Reference'].includes(account.nickname)) {
    return account.nickname;
  }

  return currentCsa?.company_name ? `${currentCsa.company_name} FedEx access` : 'FedEx/MyBizAccount Reference';
}

export default function CsaPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const fccSectionRef = useRef(null);
  const [linkCodeInput, setLinkCodeInput] = useState('');
  const [linkCodeResponse, setLinkCodeResponse] = useState(null);
  const [newCsaName, setNewCsaName] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isCreatingCsa, setIsCreatingCsa] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState(null);
  const [unlinkingAccountId, setUnlinkingAccountId] = useState(null);
  const [fedexForm, setFedexForm] = useState(DEFAULT_FEDEX_FORM);
  const [isFedexFormOpen, setIsFedexFormOpen] = useState(false);
  const [editingFedexAccountId, setEditingFedexAccountId] = useState(null);
  const [isSavingFedexAccount, setIsSavingFedexAccount] = useState(false);
  const [fedexFormMessage, setFedexFormMessage] = useState({ type: '', text: '' });
  const {
    linkedCsas: csas,
    csaQuery,
    selectedCsa: currentCsa,
    selectedCsaId,
    setSelectedCsaId
  } = useSelectedCsa();
  const otherLinkedCsas = useMemo(
    () => csas.filter((csa) => !csa.is_current && csa.id !== selectedCsaId && csa.id !== currentCsa?.id),
    [csas, currentCsa?.id, selectedCsaId]
  );

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
    setIsFedexFormOpen(false);
    setEditingFedexAccountId(null);
    if (!keepMessage) {
      setFedexFormMessage({ type: '', text: '' });
    }
  }

  function startNewFedexForm() {
    setEditingFedexAccountId(null);
    setFedexForm({
      ...DEFAULT_FEDEX_FORM,
      nickname: currentCsa?.company_name ? `${currentCsa.company_name} FedEx access` : DEFAULT_FEDEX_FORM.nickname
    });
    setIsFedexFormOpen(true);
    setFedexFormMessage({ type: '', text: '' });
  }

  function populateFedexForm(account) {
    setEditingFedexAccountId(account.id);
    setIsFedexFormOpen(true);
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

  async function handleCreateCsa(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsCreatingCsa(true);

    try {
      const response = await api.post('/manager/csas', {
        company_name: newCsaName.trim()
      });
      const createdCsa = response.data?.csa;
      if (response.data?.token) {
        saveManagerToken(response.data.token);
      }
      if (createdCsa?.id) {
        setSelectedCsaId(createdCsa.id);
      }
      setNewCsaName('');
      setSuccessMessage(`${createdCsa?.company_name || 'CSA workspace'} was created. You are now switched into it.`);
      await queryClient.invalidateQueries({ queryKey: ['manager-csas'] });
    } catch (error) {
      setErrorMessage(error.response?.data?.error || 'Could not create this CSA workspace.');
    } finally {
      setIsCreatingCsa(false);
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

    setIsSavingFedexAccount(true);

    try {
      const payload = buildFccPortalPayload(fedexForm, currentCsa);
      if (editingFedexAccountId) {
        await api.patch(`/manager/fedex-accounts/${editingFedexAccountId}`, payload);
      } else {
        await api.post('/manager/fedex-accounts', payload);
      }
      setSuccessMessage('FedEx access reference saved for future approved use.');
      setFedexFormMessage({ type: 'success', text: 'FedEx access reference saved.' });

      resetFedexForm({ keepMessage: true });
      await refreshFedexQueries();
    } catch (error) {
      const message = error.response?.data?.error || error.message || 'Could not save this FedEx access reference.';
      setErrorMessage(message);
      setFedexFormMessage({ type: 'error', text: message });
    } finally {
      setIsSavingFedexAccount(false);
    }
  }

  return (
    <section className="page-section csa-access-page">
      <PageHeader
        title="CSA Access"
        description="Manage linked CSA workspaces and saved FedEx access."
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
            <LoadingState skeletonRows={2} title="Loading CSA access" />
          ) : csaQuery.isError ? (
            <ErrorState
              title="Unable to load CSA access"
              description="CSA workspace access could not load right now."
              onRetry={() => csaQuery.refetch()}
            />
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
              </article>
            </div>
          ) : (
            <EmptyState
              variant="inline"
              title="Choose a CSA workspace to continue"
              description="Link or select a CSA workspace before managing workspace-level settings."
            />
          )}

          {otherLinkedCsas.length ? (
            <div className="csa-linked-workspaces">
              <div className="csa-mini-heading">Other linked workspaces</div>
              {otherLinkedCsas.map((csa) => (
                <article className="csa-settings-row csa-linked-row" key={csa.id}>
                  <div>
                    <div className="csa-workspace-name">{csa.company_name}</div>
                    <div className="driver-meta">{csa.manager_email || 'No primary email'}</div>
                  </div>
                  <StatusBadge tone="neutral">Linked</StatusBadge>
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

        <section className="card csa-access-section">
          <div className="csa-section-heading">
            <div>
              <div className="card-title">Create a new CSA</div>
            </div>
          </div>

          <div className="driver-meta">
            Add a separate CSA workspace when you are opening a new operation, service area, or company account.
          </div>

          <div className="csa-security-note">
            This uses your current manager login and keeps the new CSA data separate from your other workspaces.
          </div>

          <form className="csa-form csa-create-form" onSubmit={handleCreateCsa}>
            <label className="field-label" htmlFor="new-csa-name">CSA company name</label>
            <input
              className="text-field"
              id="new-csa-name"
              onChange={(event) => setNewCsaName(event.target.value)}
              placeholder="Example: North Region CSA"
              value={newCsaName}
            />

            <button className="primary-button" disabled={isCreatingCsa || !newCsaName.trim()} type="submit">
              {isCreatingCsa ? 'Creating CSA...' : 'Create CSA workspace'}
            </button>
          </form>
        </section>

        <section className="card csa-access-section csa-fcc-section" id="fcc-connection" ref={fccSectionRef}>
          <div className="csa-section-heading">
            <div>
              <div className="card-title">FedEx / MyBizAccount Access</div>
              <div className="driver-meta">
                Track future FedEx-approved access without storing MyBizAccount usernames or passwords.
              </div>
            </div>
            <div className="csa-fcc-heading-actions">
              <StatusBadge tone="neutral">
                Future use
              </StatusBadge>
              {!isFedexFormOpen ? (
                <button className="secondary-button" onClick={startNewFedexForm} type="button">
                  Add reference
                </button>
              ) : null}
            </div>
          </div>

          {isFedexSetupFocus ? (
            <div className="info-banner">
              Manual manifest uploads remain active. ReadyRoute does not store FedEx/MyBizAccount login credentials.
            </div>
          ) : null}

          {fedexAccountsQuery.data?.migration_required ? (
            <div className="error-banner">
              Run the latest FedEx accounts migration in Supabase before managing CSA FedEx accounts.
            </div>
          ) : null}

          {fedexAccountsQuery.isLoading ? (
            <div aria-busy="true" className="csa-fedex-access-list">
              {[0, 1].map((row) => (
                <div className="csa-fedex-access-card csa-fcc-loading-row" key={row}>
                  <span className="skeleton-line" />
                  <span className="skeleton-line" />
                </div>
              ))}
            </div>
          ) : fedexAccountsQuery.isError ? (
            <ErrorState
              title="Unable to load FedEx access references"
              description="Saved CSA FedEx references could not be loaded."
              onRetry={() => fedexAccountsQuery.refetch()}
            />
          ) : fedexAccounts.length ? (
            <div className="csa-fedex-access-list">
              {fedexAccounts.map((account) => {
                const statusLabel = FEDEX_STATUS_LABELS[account.connection_status] || account.connection_status || 'Not started';
                return (
                  <article className="csa-fedex-access-card" key={account.id}>
                    <div className="csa-fedex-access-main">
                      <div>
                        <strong>{getFedexPortalName(account, currentCsa)}</strong>
                        <span>{account.account_number_masked || 'Reference saved'}</span>
                      </div>
                      <div className="csa-fedex-chip-row">
                        {account.is_default ? <StatusBadge tone="purple">Default</StatusBadge> : null}
                        <StatusBadge tone={getFedexStatusTone(account.connection_status)}>{statusLabel}</StatusBadge>
                      </div>
                    </div>

                    <div className="csa-fedex-access-details">
                      <div>
                        <span>Reference</span>
                        <strong>{account.connection_reference || account.account_number_masked || 'Not recorded'}</strong>
                      </div>
                      <div>
                        <span>Credentials</span>
                        <strong>Not stored</strong>
                      </div>
                      <div>
                        <span>Last updated</span>
                        <strong>{getFedexLastUpdated(account)}</strong>
                      </div>
                    </div>

                    <div className="csa-fedex-actions">
                      <button className="secondary-button" onClick={() => populateFedexForm(account)} type="button">
                        Update reference
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="csa-fcc-empty-state">
              <div>
                <strong>No FedEx access reference saved</strong>
                <span>Manual manifest upload still works. Do not enter FedEx/MyBizAccount usernames or passwords in ReadyRoute.</span>
              </div>
              <button className="primary-button" onClick={startNewFedexForm} type="button">
                Add reference
              </button>
            </div>
          )}

          {isFedexFormOpen ? (
          <form className="csa-form csa-fcc-form" id="fcc-access-form" onSubmit={handleSaveFedexAccount}>
            <div>
              <div className="card-title">
                {editingFedexAccount ? 'Update FedEx Access Reference' : 'Add FedEx Access Reference'}
              </div>
              <div className="driver-meta">
                Keep a non-secret reference for future FedEx-approved data access. ReadyRoute will not store MyBizAccount usernames or passwords.
              </div>
            </div>

            <div className="csa-fedex-form-grid">
              <label className="field-label">
                Label
                <input
                  className="text-field"
                  onChange={(event) => updateFedexField('nickname', event.target.value)}
                  placeholder="Primary FedEx access"
                  value={fedexForm.nickname}
                />
              </label>
              <label className="field-label">
                FedEx account/reference
                <input
                  className="text-field"
                  onChange={(event) => updateFedexField('account_number', event.target.value)}
                  placeholder="Optional reference"
                  value={fedexForm.account_number}
                />
              </label>
            </div>

            <div className="csa-security-note">
              Security note: ReadyRoute does not collect, store, display, or automate FedEx/MyBizAccount login credentials.
            </div>

            {fedexFormMessage.text ? (
              <div className={fedexFormMessage.type === 'error' ? 'error-banner' : 'info-banner'}>
                {fedexFormMessage.text}
              </div>
            ) : null}

            <div className="csa-fedex-actions">
              <button className="primary-button" disabled={isSavingFedexAccount} type="submit">
                {isSavingFedexAccount
                  ? 'Saving reference...'
                  : 'Save FedEx Reference'}
              </button>
              <button className="secondary-button" onClick={() => resetFedexForm()} type="button">
                Cancel
              </button>
            </div>
          </form>
          ) : null}
        </section>

      </div>
    </section>
  );
}
