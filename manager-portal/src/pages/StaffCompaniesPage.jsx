import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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

  const date = new Date(value);

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

export default function StaffCompaniesPage() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [profileDraft, setProfileDraft] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

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
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId) || accounts[0] || null,
    [accounts, selectedAccountId]
  );
  const selectedProfileDraft = profileDraft?.accountId === selectedAccount?.id ? profileDraft : null;
  const lifecycleDraft = selectedProfileDraft?.lifecycle_status || selectedAccount?.internal_profile?.lifecycle_status || 'lead';
  const onboardingDraft = selectedProfileDraft?.onboarding_stage ?? selectedAccount?.internal_profile?.onboarding_stage ?? '';
  const notesDraft = selectedProfileDraft?.internal_notes ?? selectedAccount?.internal_profile?.internal_notes ?? '';

  const activeCount = accounts.filter((account) => account.internal_profile?.lifecycle_status === 'active').length;
  const onboardingCount = accounts.filter((account) => ['trial', 'onboarding'].includes(account.internal_profile?.lifecycle_status)).length;
  const atRiskCount = accounts.filter((account) => account.internal_profile?.lifecycle_status === 'at_risk').length;
  const openTicketCount = accounts.reduce((sum, account) => sum + Number(account.counts?.open_support_tickets || 0), 0);

  const saveProfileMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount?.id) {
        throw new Error('Select a company first.');
      }

      const response = await api.patch(`/staff/accounts/${selectedAccount.id}/internal-profile`, {
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
      }

      setProfileDraft(null);
      setSaveMessage('Company profile updated.');
    }
  });

  function updateProfileDraft(patch) {
    if (!selectedAccount?.id) {
      return;
    }

    setProfileDraft((current) => {
      const currentMatchesAccount = current?.accountId === selectedAccount.id;

      return {
        accountId: selectedAccount.id,
        lifecycle_status: currentMatchesAccount ? current.lifecycle_status : selectedAccount.internal_profile?.lifecycle_status || 'lead',
        onboarding_stage: currentMatchesAccount ? current.onboarding_stage : selectedAccount.internal_profile?.onboarding_stage || '',
        internal_notes: currentMatchesAccount ? current.internal_notes : selectedAccount.internal_profile?.internal_notes || '',
        ...patch
      };
    });
    setSaveMessage('');
  }

  function handleSelectAccount(accountId) {
    setSelectedAccountId(accountId);
    setProfileDraft(null);
    setSaveMessage('');
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
        eyebrow="ReadyRoute CRM"
        title="Companies"
        description="Monitor customer accounts, onboarding state, support pressure, and internal notes."
        actions={(
          <button className="secondary-inline-button" onClick={() => accountsQuery.refetch()} type="button">
            Refresh
          </button>
        )}
      />

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
          <aside className="staff-account-list" aria-label="ReadyRoute customer accounts">
            {accounts.map((account) => {
              const lifecycle = account.internal_profile?.lifecycle_status || 'lead';
              const isSelected = account.id === selectedAccount?.id;

              return (
                <button
                  className={`staff-account-row${isSelected ? ' selected' : ''}`}
                  key={account.id}
                  onClick={() => handleSelectAccount(account.id)}
                  type="button"
                >
                  <span className="staff-account-row-header">
                    <strong>{account.company_name}</strong>
                    <StatusBadge tone={getLifecycleTone(lifecycle)}>
                      {formatLabel(lifecycle)}
                    </StatusBadge>
                  </span>
                  <span className="staff-account-row-meta">
                    {account.manager_email || 'No owner email'} · {formatDateTime(account.created_at)}
                  </span>
                  <span className="staff-account-row-meta">
                    {account.counts?.active_managers || 0} managers · {account.counts?.active_drivers || 0} drivers · {account.vehicle_count || 0} vehicles
                  </span>
                  {account.counts?.open_support_tickets ? (
                    <span className="staff-account-ticket-warning">
                      {account.counts.open_support_tickets} open support ticket{account.counts.open_support_tickets === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </aside>

          {selectedAccount ? (
            <article className="staff-account-detail">
              <header className="staff-account-detail-header">
                <StatusBadge tone={getLifecycleTone(selectedAccount.internal_profile?.lifecycle_status)}>
                  {formatLabel(selectedAccount.internal_profile?.lifecycle_status || 'lead')}
                </StatusBadge>
                <h2>{selectedAccount.company_name}</h2>
                <p>{selectedAccount.manager_email || 'No manager email'} · Created {formatDateTime(selectedAccount.created_at)}</p>
              </header>

              <div className="staff-account-metrics">
                <div>
                  <span>Subscription</span>
                  <strong>{formatLabel(selectedAccount.subscription_status || selectedAccount.plan || 'not set')}</strong>
                </div>
                <div>
                  <span>Managers</span>
                  <strong>{selectedAccount.counts?.active_managers || 0}</strong>
                </div>
                <div>
                  <span>Drivers</span>
                  <strong>{selectedAccount.counts?.active_drivers || 0}</strong>
                </div>
                <div>
                  <span>Vehicles</span>
                  <strong>{selectedAccount.vehicle_count || 0}</strong>
                </div>
                <div>
                  <span>Open Tickets</span>
                  <strong>{selectedAccount.counts?.open_support_tickets || 0}</strong>
                </div>
                <div>
                  <span>Urgent Tickets</span>
                  <strong>{selectedAccount.counts?.urgent_support_tickets || 0}</strong>
                </div>
              </div>

              {selectedAccount.latest_support_ticket ? (
                <section className="staff-latest-ticket">
                  <h3>Latest support signal</h3>
                  <p>
                    {selectedAccount.latest_support_ticket.ticket_reference} · {selectedAccount.latest_support_ticket.subject || 'Support request'}
                  </p>
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
            </article>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="No companies yet"
          description="Customer accounts will appear here after signup or account creation."
        />
      )}
    </section>
  );
}
