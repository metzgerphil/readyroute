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

const COST_FIELDS = [
  { key: 'cloud_run', label: 'Cloud Run' },
  { key: 'database', label: 'Database' },
  { key: 'storage', label: 'Storage' },
  { key: 'email', label: 'Email' },
  { key: 'maps', label: 'Maps' },
  { key: 'support', label: 'Support' },
  { key: 'other', label: 'Other' }
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

function formatCurrencyFromCents(cents = 0) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(cents || 0) / 100);
}

function centsToInput(cents = 0) {
  const dollars = Number(cents || 0) / 100;
  return dollars ? dollars.toFixed(2) : '';
}

function inputToCents(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) : 0;
}

function getCurrentPeriodMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function createEmptyCostForm(periodMonth = getCurrentPeriodMonth(), estimatedRevenueCents = 0) {
  return {
    period_month: periodMonth,
    estimated_revenue: centsToInput(estimatedRevenueCents),
    cloud_run: '',
    database: '',
    storage: '',
    email: '',
    maps: '',
    support: '',
    other: '',
    notes: ''
  };
}

function snapshotToCostForm(snapshot, fallbackRevenueCents = 0) {
  if (!snapshot) {
    return createEmptyCostForm(getCurrentPeriodMonth(), fallbackRevenueCents);
  }

  return {
    period_month: String(snapshot.period_month || getCurrentPeriodMonth()).slice(0, 7),
    estimated_revenue: centsToInput(snapshot.estimated_revenue_cents),
    cloud_run: centsToInput(snapshot.cloud_run_cents),
    database: centsToInput(snapshot.database_cents),
    storage: centsToInput(snapshot.storage_cents),
    email: centsToInput(snapshot.email_cents),
    maps: centsToInput(snapshot.maps_cents),
    support: centsToInput(snapshot.support_cents),
    other: centsToInput(snapshot.other_cents),
    notes: snapshot.notes || ''
  };
}

export default function StaffCompaniesPage() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [profileDraft, setProfileDraft] = useState(null);
  const [costDraft, setCostDraft] = useState({ key: '', form: createEmptyCostForm() });
  const [saveMessage, setSaveMessage] = useState('');
  const [costSaveMessage, setCostSaveMessage] = useState('');

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
  const fallbackRevenueCents = billingSettings
    ? Number(billingSettings.committed_route_count || 0) * Number(billingSettings.billing_rate_cents || 0)
    : 0;
  const costSnapshots = useMemo(
    () => (Array.isArray(detail.cost_snapshots) ? detail.cost_snapshots : []),
    [detail.cost_snapshots]
  );
  const timeline = Array.isArray(detail.timeline) ? detail.timeline : [];
  const costFormKey = detailedAccount?.id || selectedAccount?.id || '';
  const defaultCostForm = useMemo(
    () => snapshotToCostForm(costSnapshots[0], fallbackRevenueCents),
    [costSnapshots, fallbackRevenueCents]
  );
  const costForm = costDraft.key === costFormKey ? costDraft.form : defaultCostForm;

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

  const saveCostMutation = useMutation({
    mutationFn: async () => {
      if (!detailedAccount?.id) {
        throw new Error('Select a company first.');
      }

      const payload = {
        period_month: costForm.period_month,
        estimated_revenue_cents: inputToCents(costForm.estimated_revenue),
        notes: costForm.notes
      };

      for (const field of COST_FIELDS) {
        payload[`${field.key}_cents`] = inputToCents(costForm[field.key]);
      }

      const response = await api.post(`/staff/accounts/${detailedAccount.id}/cost-snapshots`, payload);
      return response.data?.cost_snapshot || null;
    },
    onSuccess: (snapshot) => {
      if (snapshot) {
        queryClient.setQueryData(['staff-account-detail', detailedAccount.id], (current) => {
          if (!current) {
            return current;
          }

          const snapshots = Array.isArray(current.cost_snapshots) ? current.cost_snapshots : [];
          const nextSnapshots = [
            snapshot,
            ...snapshots.filter((item) => item.id !== snapshot.id && item.period_month !== snapshot.period_month)
          ].sort((left, right) => String(right.period_month).localeCompare(String(left.period_month)));

          return {
            ...current,
            cost_snapshots: nextSnapshots
          };
        });
      }

      setCostSaveMessage('Cost snapshot saved.');
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

  function updateCostField(field, value) {
    setCostDraft((current) => {
      const baseForm = current.key === costFormKey ? current.form : costForm;

      return {
        key: costFormKey,
        form: {
          ...baseForm,
          [field]: value
        }
      };
    });
    setCostSaveMessage('');
  }

  function handleSelectAccount(accountId) {
    setSelectedAccountId(accountId);
    setProfileDraft(null);
    setSaveMessage('');
    setCostSaveMessage('');
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

  async function handleSaveCost(event) {
    event.preventDefault();
    setCostSaveMessage('');

    try {
      await saveCostMutation.mutateAsync();
    } catch {
      // The mutation state renders the user-facing error.
    }
  }

  const totalCostCents = COST_FIELDS.reduce((sum, field) => sum + inputToCents(costForm[field.key]), 0);
  const estimatedProfitCents = inputToCents(costForm.estimated_revenue) - totalCostCents;

  return (
    <section className="staff-page staff-companies-page">
      <PageHeader
        eyebrow="ReadyRoute CRM"
        title="Companies"
        description="Monitor customer accounts, onboarding, support pressure, usage, and internal cost estimates."
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

          {detailedAccount ? (
            <article className="staff-account-detail">
              <header className="staff-account-detail-header">
                <StatusBadge tone={getLifecycleTone(detailedAccount.internal_profile?.lifecycle_status)}>
                  {formatLabel(detailedAccount.internal_profile?.lifecycle_status || 'lead')}
                </StatusBadge>
                <h2>{detailedAccount.company_name}</h2>
                <p>{detailedAccount.manager_email || 'No manager email'} · Created {formatDateTime(detailedAccount.created_at)}</p>
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
                  <h3>Cost / Profit Snapshot</h3>
                  <form className="staff-cost-form" onSubmit={handleSaveCost}>
                    <label>
                      Month
                      <input
                        onChange={(event) => updateCostField('period_month', event.target.value)}
                        type="month"
                        value={costForm.period_month}
                      />
                    </label>
                    <label>
                      Estimated revenue
                      <input
                        inputMode="decimal"
                        onChange={(event) => updateCostField('estimated_revenue', event.target.value)}
                        type="number"
                        value={costForm.estimated_revenue}
                      />
                    </label>
                    {COST_FIELDS.map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <input
                          inputMode="decimal"
                          onChange={(event) => updateCostField(field.key, event.target.value)}
                          type="number"
                          value={costForm[field.key]}
                        />
                      </label>
                    ))}
                    <label className="staff-cost-form-notes">
                      Notes
                      <textarea
                        onChange={(event) => updateCostField('notes', event.target.value)}
                        value={costForm.notes}
                      />
                    </label>
                    <div className="staff-cost-summary">
                      <span>Cost {formatCurrencyFromCents(totalCostCents)}</span>
                      <span>Profit {formatCurrencyFromCents(estimatedProfitCents)}</span>
                    </div>
                    {saveCostMutation.isError ? (
                      <div className="error-banner">{saveCostMutation.error?.response?.data?.error || 'Cost snapshot could not be saved.'}</div>
                    ) : costSaveMessage ? (
                      <div className="info-banner">{costSaveMessage}</div>
                    ) : null}
                    <button className="primary-cta" disabled={saveCostMutation.isPending} type="submit">
                      {saveCostMutation.isPending ? 'Saving snapshot...' : 'Save Cost Snapshot'}
                    </button>
                  </form>
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
                      description="Support, account, cost, and audit activity will appear here."
                      variant="inline"
                    />
                  )}
                </section>

                <section className="staff-detail-panel">
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

                <section className="staff-detail-panel">
                  <h3>Usage Signals</h3>
                  <div className="staff-compact-list">
                    <article>
                      <strong>{detail.billing_routes?.length || 0} billable route records</strong>
                      <span>Recent route billing ledger entries</span>
                    </article>
                    <article>
                      <strong>{detail.routes?.length || 0} recent routes</strong>
                      <span>Imported or active route records</span>
                    </article>
                    <article>
                      <strong>{detail.drivers?.length || 0} drivers · {detail.managers?.length || 0} managers</strong>
                      <span>Current account user footprint</span>
                    </article>
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
    </section>
  );
}
