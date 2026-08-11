import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import api from '../services/api';

const LIFECYCLE_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'trial', label: 'Trial' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'active', label: 'Active' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'canceled', label: 'Canceled' }
];

function formatDateTime(value) {
  if (!value) {
    return 'Not recorded';
  }

  const dateOnlyMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCurrencyFromCents(cents = 0) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD'
  }).format(Number(cents || 0) / 100);
}

function getLifecycleTone(status) {
  if (status === 'active') {
    return 'active';
  }

  if (status === 'at_risk' || status === 'canceled') {
    return 'urgent';
  }

  if (status === 'onboarding' || status === 'trial') {
    return 'warning';
  }

  return 'neutral';
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function getAccountState(account) {
  const candidates = [
    account.state,
    account.company_state,
    account.business_state,
    account.billing_state,
    account.service_state,
    account.operations_state,
    account.address_state,
    account.primary_state,
    account.internal_profile?.state,
    account.internal_profile?.company_state,
    account.internal_profile?.operations_state
  ];
  const state = candidates.find((candidate) => String(candidate || '').trim());

  return state ? String(state).trim().toUpperCase() : '';
}

function getAccountSearchText(account) {
  return normalizeSearchValue([
    account.company_name,
    account.manager_email,
    account.internal_profile?.lifecycle_status,
    account.internal_profile?.onboarding_stage,
    getAccountState(account),
    account.subscription_status,
    account.account_status,
    account.plan
  ].filter(Boolean).join(' '));
}

export default function StaffCompaniesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [profileDraft, setProfileDraft] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [accountActionMessage, setAccountActionMessage] = useState('');
  const [supportViewReason, setSupportViewReason] = useState('');
  const [supportViewTicketId, setSupportViewTicketId] = useState('');
  const [isSupportViewPromptOpen, setIsSupportViewPromptOpen] = useState(false);
  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({ company_name: '', manager_name: '', manager_email: '' });
  const [companyCreateMessage, setCompanyCreateMessage] = useState('');

  const accountsQuery = useQuery({
    queryKey: ['staff-accounts'],
    queryFn: async () => {
      const response = await api.get('/staff/accounts');
      return response.data?.accounts || [];
    }
  });

  const accounts = useMemo(
    () => (Array.isArray(accountsQuery.data) ? accountsQuery.data : []),
    [accountsQuery.data]
  );

  const createCompanyMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/staff/accounts', companyDraft);
      return response.data;
    },
    onSuccess: async (result) => {
      setCompanyDraft({ company_name: '', manager_name: '', manager_email: '' });
      setIsCreateCompanyOpen(false);
      setCompanyCreateMessage(
        result?.invitation?.email_delivery === 'sent'
          ? 'Company created and the manager invitation was sent.'
          : result?.invitation?.email_delivery === 'not_required'
            ? 'Company created and linked to the manager’s existing secure account.'
          : 'Company created. Email delivery needs attention; the secure invite is available in the response.'
      );
      await queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
      if (result?.account?.id) setSelectedAccountId(result.account.id);
    },
    onError: (error) => setCompanyCreateMessage(error.response?.data?.error || 'Unable to create this company.')
  });

  const stateOptions = useMemo(
    () => Array.from(new Set(accounts.map(getAccountState).filter(Boolean))).sort(),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    const searchNeedle = normalizeSearchValue(companySearch);

    return accounts.filter((account) => {
      const lifecycle = account.internal_profile?.lifecycle_status || 'lead';
      const accountState = getAccountState(account);

      if (lifecycleFilter && lifecycle !== lifecycleFilter) {
        return false;
      }

      if (stateFilter && accountState !== stateFilter) {
        return false;
      }

      if (searchNeedle && !getAccountSearchText(account).includes(searchNeedle)) {
        return false;
      }

      return true;
    });
  }, [accounts, companySearch, lifecycleFilter, stateFilter]);

  const selectedAccount = useMemo(
    () => filteredAccounts.find((account) => account.id === selectedAccountId) || filteredAccounts[0] || null,
    [filteredAccounts, selectedAccountId]
  );

  const accountDetailQuery = useQuery({
    queryKey: ['staff-account-detail', selectedAccount?.id],
    enabled: Boolean(selectedAccount?.id),
    queryFn: async () => {
      const response = await api.get(`/staff/accounts/${selectedAccount.id}`);
      return response.data || null;
    }
  });

  const detail = accountDetailQuery.data || {};
  const detailedAccount = detail.account || selectedAccount;
  const selectedProfileDraft = profileDraft?.accountId === detailedAccount?.id ? profileDraft : null;
  const lifecycleDraft = selectedProfileDraft?.lifecycle_status || detailedAccount?.internal_profile?.lifecycle_status || 'lead';
  const onboardingDraft = selectedProfileDraft?.onboarding_stage ?? detailedAccount?.internal_profile?.onboarding_stage ?? '';
  const notesDraft = selectedProfileDraft?.internal_notes ?? detailedAccount?.internal_profile?.internal_notes ?? '';
  const billingSettings = detail.billing_settings || null;
  const timeline = Array.isArray(detail.timeline) ? detail.timeline : [];

  const activeCount = accounts.filter((account) => account.internal_profile?.lifecycle_status === 'active').length;
  const onboardingCount = accounts.filter((account) => ['trial', 'onboarding'].includes(account.internal_profile?.lifecycle_status)).length;
  const atRiskCount = accounts.filter((account) => account.internal_profile?.lifecycle_status === 'at_risk').length;
  const openTicketCount = accounts.reduce((sum, account) => sum + Number(account.counts?.open_support_tickets || 0), 0);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!detailedAccount?.id) {
        throw new Error('Select a company first.');
      }

      const response = await api.patch(`/staff/accounts/${detailedAccount.id}/internal-profile`, {
        lifecycle_status: lifecycleDraft,
        onboarding_stage: onboardingDraft,
        internal_notes: notesDraft
      });

      return response.data?.internal_profile || null;
    },
    onSuccess: (profile) => {
      if (profile) {
        queryClient.setQueryData(['staff-accounts'], (current = []) => (
          Array.isArray(current)
            ? current.map((account) => (
                account.id === profile.account_id
                  ? { ...account, internal_profile: { ...account.internal_profile, ...profile } }
                  : account
              ))
            : current
        ));
        queryClient.invalidateQueries({ queryKey: ['staff-account-detail', profile.account_id] });
      }

      setProfileDraft(null);
      setSaveMessage('Company profile updated.');
    }
  });

  const recoverAccountMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/staff/accounts/${detailedAccount.id}/recover`);
      return response.data || {};
    },
    onSuccess: (data) => {
      setAccountActionMessage(data.billing_reactivation_required
        ? 'Workspace recovered. Its Stripe subscription must be reactivated before billing goes live.'
        : 'Workspace recovered and cancellation removed.');
      queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['staff-account-detail', detailedAccount.id] });
    }
  });

  const startSupportViewMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post(`/staff/accounts/${detailedAccount.id}/access-sessions`, {
        reason: supportViewReason,
        support_ticket_id: supportViewTicketId || null
      });
      return response.data?.access_session || null;
    },
    onSuccess: (accessSession) => {
      if (accessSession?.id) {
        navigate(`/readyroute/companies/${detailedAccount.id}/view?session=${encodeURIComponent(accessSession.id)}`);
      }
    }
  });

  function updateProfileDraft(patch) {
    if (!detailedAccount?.id) {
      return;
    }

    setProfileDraft((current) => {
      const currentMatchesAccount = current?.accountId === detailedAccount.id;

      return {
        accountId: detailedAccount.id,
        lifecycle_status: currentMatchesAccount ? current.lifecycle_status : detailedAccount.internal_profile?.lifecycle_status || 'lead',
        onboarding_stage: currentMatchesAccount ? current.onboarding_stage : detailedAccount.internal_profile?.onboarding_stage || '',
        internal_notes: currentMatchesAccount ? current.internal_notes : detailedAccount.internal_profile?.internal_notes || '',
        ...patch
      };
    });
    setSaveMessage('');
  }

  function handleSelectAccount(accountId) {
    if (!accountId) {
      return;
    }

    setSelectedAccountId(accountId);
    setProfileDraft(null);
    setSaveMessage('');
    setAccountActionMessage('');
  }

  async function handleSaveProfile(event) {
    event.preventDefault();
    setSaveMessage('');

    try {
      await saveProfileMutation.mutateAsync();
    } catch {
      // The mutation state renders the user-facing error.
    }
  }

  return (
    <section className="staff-page staff-companies-page">
      <PageHeader
        eyebrow="ReadyRoute Internal"
        title="Companies"
        description="Monitor accounts, onboarding, support activity, usage, and billing health."
        actions={(
          <div className="staff-inline-actions">
            <button className="primary-button" onClick={() => { setCompanyCreateMessage(''); setIsCreateCompanyOpen(true); }} type="button">
              Add company
            </button>
            <button className="secondary-inline-button" onClick={() => accountsQuery.refetch()} type="button">
              Refresh
            </button>
          </div>
        )}
      />

      {companyCreateMessage ? <p className="form-success-message">{companyCreateMessage}</p> : null}
      {isCreateCompanyOpen ? (
        <section className="staff-account-detail" aria-label="Create company">
          <header className="staff-account-detail-header">
            <h2>Create company and invite manager</h2>
            <p>The manager receives a secure single-use link and establishes their own password.</p>
          </header>
          <div className="staff-company-finder-grid">
            <label>Company name<input value={companyDraft.company_name} onChange={(event) => setCompanyDraft((current) => ({ ...current, company_name: event.target.value }))} /></label>
            <label>Manager full name<input value={companyDraft.manager_name} onChange={(event) => setCompanyDraft((current) => ({ ...current, manager_name: event.target.value }))} /></label>
            <label>Manager email<input type="email" value={companyDraft.manager_email} onChange={(event) => setCompanyDraft((current) => ({ ...current, manager_email: event.target.value }))} /></label>
          </div>
          <div className="staff-inline-actions">
            <button className="primary-button" disabled={createCompanyMutation.isPending} onClick={() => createCompanyMutation.mutate()} type="button">
              {createCompanyMutation.isPending ? 'Creating…' : 'Create and send invite'}
            </button>
            <button className="secondary-inline-button" onClick={() => setIsCreateCompanyOpen(false)} type="button">Cancel</button>
          </div>
        </section>
      ) : null}

      <div className="staff-stat-grid">
        <StatCard label="Companies" value={accounts.length} />
        <StatCard label="Active" value={activeCount} tone={activeCount ? 'active' : 'default'} />
        <StatCard label="Trial/Onboarding" value={onboardingCount} tone={onboardingCount ? 'warning' : 'default'} />
        <StatCard label="Open Tickets" value={openTicketCount} tone={openTicketCount ? 'urgent' : 'active'} />
        <StatCard label="At Risk" value={atRiskCount} tone={atRiskCount ? 'urgent' : 'active'} />
      </div>

      {accountsQuery.isLoading ? (
        <LoadingState title="Loading companies" variant="card" />
      ) : accountsQuery.isError ? (
        <ErrorState
          title="Unable to load companies"
          description="Refresh this page or sign back in to the ReadyRoute staff console."
          onRetry={() => accountsQuery.refetch()}
        />
      ) : accounts.length ? (
        <div className="staff-crm-layout">
          <section className="staff-company-finder" aria-label="ReadyRoute company finder">
            <div className="staff-company-finder-header">
              <div>
                <h2>Company Finder</h2>
                <p>{filteredAccounts.length} of {accounts.length} companies</p>
              </div>
              {selectedAccount ? (
                <StatusBadge tone={getLifecycleTone(selectedAccount.internal_profile?.lifecycle_status || 'lead')}>
                  {formatLabel(selectedAccount.internal_profile?.lifecycle_status || 'lead')}
                </StatusBadge>
              ) : null}
            </div>

            <div className="staff-company-finder-grid">
              <label>
                Search
                <input
                  onChange={(event) => setCompanySearch(event.target.value)}
                  placeholder="Company, owner, stage, or plan"
                  type="search"
                  value={companySearch}
                />
              </label>

              <label>
                Company
                <select
                  disabled={!filteredAccounts.length}
                  onChange={(event) => handleSelectAccount(event.target.value)}
                  value={selectedAccount?.id || ''}
                >
                  {filteredAccounts.length ? (
                    filteredAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.company_name}
                      </option>
                    ))
                  ) : (
                    <option value="">No matching companies</option>
                  )}
                </select>
              </label>

              <label>
                Lifecycle
                <select value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)}>
                  <option value="">All lifecycles</option>
                  {LIFECYCLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                State
                <select
                  disabled={!stateOptions.length}
                  onChange={(event) => setStateFilter(event.target.value)}
                  value={stateFilter}
                >
                  <option value="">{stateOptions.length ? 'All states' : 'Not tracked'}</option>
                  {stateOptions.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {selectedAccount ? (
              <div className="staff-company-selected-strip">
                <div className="staff-company-selected-main">
                  <strong>{selectedAccount.company_name}</strong>
                  <span>{selectedAccount.manager_email || 'No owner email'} · Created {formatDateTime(selectedAccount.created_at)}</span>
                </div>
                <div className="staff-company-selected-metrics">
                  <span><strong>{selectedAccount.counts?.active_managers || 0}</strong> managers</span>
                  <span><strong>{selectedAccount.counts?.active_drivers || 0}</strong> drivers</span>
                  <span><strong>{selectedAccount.vehicle_count || 0}</strong> vehicles</span>
                  <span><strong>{selectedAccount.counts?.open_support_tickets || 0}</strong> open tickets</span>
                </div>
              </div>
            ) : (
              <EmptyState
                title="No matching companies"
                description="Clear the search or filters to select a company."
                variant="inline"
              />
            )}
          </section>

          {detailedAccount ? (
            <article className="staff-account-detail">
              <header className="staff-account-detail-header">
                <StatusBadge tone={getLifecycleTone(detailedAccount.internal_profile?.lifecycle_status)}>
                  {formatLabel(detailedAccount.internal_profile?.lifecycle_status || 'lead')}
                </StatusBadge>
                <h2>{detailedAccount.company_name}</h2>
                <p>{detailedAccount.manager_email || 'No manager email'} · Created {formatDateTime(detailedAccount.created_at)}</p>
                <button className="secondary-inline-button" onClick={() => setIsSupportViewPromptOpen(true)} type="button">
                  Open Support View
                </button>
              </header>

              {accountDetailQuery.isLoading ? (
                <LoadingState title="Loading company detail" />
              ) : accountDetailQuery.isError ? (
                <ErrorState
                  title="Unable to load company detail"
                  description="The company summary is visible, but the detail panel could not refresh."
                  onRetry={() => accountDetailQuery.refetch()}
                />
              ) : null}

              <div className="staff-account-metrics">
                <div>
                  <span>Subscription</span>
                  <strong>{formatLabel(detailedAccount.subscription_status || detailedAccount.plan || 'not set')}</strong>
                </div>
                <div>
                  <span>Managers</span>
                  <strong>{detailedAccount.counts?.active_managers || 0}</strong>
                </div>
                <div>
                  <span>Drivers</span>
                  <strong>{detailedAccount.counts?.active_drivers || 0}</strong>
                </div>
                <div>
                  <span>Vehicles</span>
                  <strong>{detailedAccount.vehicle_count || 0}</strong>
                </div>
                <div>
                  <span>Open Tickets</span>
                  <strong>{detailedAccount.counts?.open_support_tickets || 0}</strong>
                </div>
                <div>
                  <span>Committed Routes</span>
                  <strong>{billingSettings?.committed_route_count ?? 'Not set'}</strong>
                </div>
              </div>

              {['canceling', 'retained'].includes(detailedAccount.account_status) ? (
                <section className="staff-account-retention-panel">
                  <div>
                    <span className="field-label">Account status</span>
                    <h3>{formatLabel(detailedAccount.account_status)}</h3>
                    <p>
                      {detailedAccount.service_ends_at ? `Service ends ${formatDateTime(detailedAccount.service_ends_at)}. ` : ''}
                      {detailedAccount.retention_ends_at ? `Recovery window ends ${formatDateTime(detailedAccount.retention_ends_at)}.` : ''}
                    </p>
                    {detailedAccount.cancellation_reason ? <p>Reason: {detailedAccount.cancellation_reason}</p> : null}
                  </div>
                  <div className="staff-account-retention-actions">
                    <button
                      className="secondary-inline-button"
                      disabled={recoverAccountMutation.isPending}
                      onClick={() => recoverAccountMutation.mutate()}
                      type="button"
                    >
                      {recoverAccountMutation.isPending ? 'Recovering...' : 'Recover Account'}
                    </button>
                  </div>
                  {recoverAccountMutation.isError ? (
                    <div className="support-ticket-save-error">
                      {recoverAccountMutation.error?.response?.data?.error || 'Account could not be recovered.'}
                    </div>
                  ) : accountActionMessage ? (
                    <div className="support-ticket-save-message">{accountActionMessage}</div>
                  ) : null}
                </section>
              ) : null}

              <form className="staff-account-profile-form" onSubmit={handleSaveProfile}>
                <div className="staff-account-profile-grid">
                  <label>
                    Lifecycle
                    <select value={lifecycleDraft} onChange={(event) => updateProfileDraft({ lifecycle_status: event.target.value })}>
                      {LIFECYCLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Onboarding stage
                    <input
                      onChange={(event) => updateProfileDraft({ onboarding_stage: event.target.value })}
                      placeholder="Example: FedEx setup"
                      type="text"
                      value={onboardingDraft}
                    />
                  </label>
                </div>

                <label>
                  Internal notes
                  <textarea
                    onChange={(event) => updateProfileDraft({ internal_notes: event.target.value })}
                    placeholder="Notes for ReadyRoute staff only."
                    value={notesDraft}
                  />
                </label>

                <div className="staff-account-profile-actions">
                  {saveProfileMutation.isError ? (
                    <span className="support-ticket-save-error">Company profile could not be updated.</span>
                  ) : saveMessage ? (
                    <span className="support-ticket-save-message">{saveMessage}</span>
                  ) : null}
                  <button className="primary-cta" disabled={saveProfileMutation.isPending} type="submit">
                    {saveProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>
              </form>

              <div className="staff-detail-grid">
                <section className="staff-detail-panel">
                  <h3>Usage Snapshot</h3>
                  <div className="staff-compact-list">
                    <article>
                      <strong>{detail.billing_routes?.length || 0} billable route records</strong>
                      <span>Recent billing ledger entries</span>
                    </article>
                    <article>
                      <strong>{detail.routes?.length || 0} recent routes</strong>
                      <span>Imported or active route records</span>
                    </article>
                    <article>
                      <strong>{detail.drivers?.length || 0} drivers · {detail.managers?.length || 0} managers</strong>
                      <span>Current account user footprint</span>
                    </article>
                    <article>
                      <strong>{billingSettings?.committed_route_count ?? 'Not set'} committed routes</strong>
                      <span>{billingSettings?.billing_rate_cents ? `${formatCurrencyFromCents(billingSettings.billing_rate_cents)} per route` : 'Billing rate not set'}</span>
                    </article>
                  </div>
                </section>

                <section className="staff-detail-panel">
                  <h3>Timeline</h3>
                  {timeline.length ? (
                    <div className="staff-timeline-list">
                      {timeline.slice(0, 12).map((event) => (
                        <article className="staff-timeline-row" key={event.id}>
                          <span>{formatDateTime(event.created_at)}</span>
                          <strong>{event.title}</strong>
                          <p>{event.description}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      title="No timeline yet"
                      description="Support, account, billing, and audit activity will appear here."
                      variant="inline"
                    />
                  )}
                </section>

                <section className="staff-detail-panel staff-detail-panel-wide">
                  <h3>Support History</h3>
                  {detail.support_tickets?.length ? (
                    <div className="staff-compact-list">
                      {detail.support_tickets.slice(0, 8).map((ticket) => (
                        <article key={ticket.id}>
                          <strong>{ticket.ticket_reference || 'Ticket'} · {formatLabel(ticket.status)}</strong>
                          <span>{ticket.subject || ticket.description || 'Support request'}</span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No support tickets" description="Support history will appear here." variant="inline" />
                  )}
                </section>

                <section className="staff-detail-panel staff-detail-panel-wide">
                  <h3>Usage Signals</h3>
                  <div className="staff-compact-list">
                    {(detail.routes || []).slice(0, 8).map((route) => (
                      <article key={route.id}>
                        <strong>{route.work_area_name || route.id} · {formatLabel(route.status || route.dispatch_state || 'route')}</strong>
                        <span>{formatDateTime(route.date || route.created_at)} · {route.completed_stops || 0}/{route.total_stops || 0} stops</span>
                      </article>
                    ))}
                    {detail.routes?.length ? null : (
                      <article>
                        <strong>No recent route activity</strong>
                        <span>Recent imported routes will appear here.</span>
                      </article>
                    )}
                  </div>
                </section>
              </div>
            </article>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="No companies yet"
          description="Customer accounts will appear here after signup or account creation."
        />
      )}

      {isSupportViewPromptOpen && detailedAccount ? (
        <div className="support-modal-backdrop" role="presentation">
          <form
            aria-labelledby="support-view-prompt-title"
            aria-modal="true"
            className="support-modal staff-support-view-prompt"
            onSubmit={async (event) => {
              event.preventDefault();
              await startSupportViewMutation.mutateAsync();
            }}
            role="dialog"
          >
            <div className="support-modal-header">
              <div>
                <p className="rr-eyebrow">Audited Access</p>
                <h2 id="support-view-prompt-title">View {detailedAccount.company_name}</h2>
                <p>This opens a read-only company snapshot for 30 minutes. The reason and activity are recorded.</p>
              </div>
            </div>
            <label>
              Reason for access
              <textarea
                minLength={10}
                onChange={(event) => setSupportViewReason(event.target.value)}
                placeholder="Example: Investigating ticket RR-123 about missing vehicle inspections."
                required
                value={supportViewReason}
              />
            </label>
            <label>
              Related support ticket
              <select onChange={(event) => setSupportViewTicketId(event.target.value)} value={supportViewTicketId}>
                <option value="">No related ticket</option>
                {(detail.support_tickets || []).map((ticket) => (
                  <option key={ticket.id} value={ticket.id}>{ticket.ticket_reference || ticket.subject || 'Support ticket'}</option>
                ))}
              </select>
            </label>
            {startSupportViewMutation.isError ? (
              <div className="support-ticket-save-error">{startSupportViewMutation.error?.response?.data?.error || 'Support View could not start.'}</div>
            ) : null}
            <div className="support-modal-actions">
              <button className="secondary-button" onClick={() => setIsSupportViewPromptOpen(false)} type="button">Cancel</button>
              <button className="primary-button" disabled={startSupportViewMutation.isPending} type="submit">
                {startSupportViewMutation.isPending ? 'Opening...' : 'Open Read-Only View'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
