import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import api from '../services/api';
import { getReadyRouteStaffTokenPayload } from '../services/auth';

const COST_CATEGORIES = [
  { value: 'ai_tools', label: 'AI / Codex' },
  { value: 'vercel', label: 'Vercel' },
  { value: 'google_cloud_run', label: 'Google Cloud Run' },
  { value: 'supabase', label: 'Supabase' },
  { value: 'email', label: 'Resend / Email' },
  { value: 'maps', label: 'Google Maps' },
  { value: 'apple_developer', label: 'Apple Developer' },
  { value: 'stripe_fees', label: 'Stripe Fees' },
  { value: 'domains', label: 'Domains' },
  { value: 'software', label: 'Software' },
  { value: 'other', label: 'Other' }
];

function getCurrentPeriodMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCurrencyFromCents(cents = 0) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD'
  }).format(Number(cents || 0) / 100);
}

function formatDate(value) {
  if (!value) {
    return 'No date';
  }

  const dateOnlyMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnlyMatch
    ? new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No date';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function centsToInput(cents = 0) {
  const dollars = Number(cents || 0) / 100;
  return dollars ? dollars.toFixed(2) : '';
}

function inputToCents(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric * 100) : 0;
}

function getCategoryLabel(value) {
  return COST_CATEGORIES.find((category) => category.value === value)?.label || 'Other';
}

function createDraft(periodMonth = getCurrentPeriodMonth()) {
  return {
    period_month: periodMonth,
    category: 'ai_tools',
    vendor: '',
    amount: '',
    billing_date: '',
    is_recurring: true,
    receipt_url: '',
    notes: ''
  };
}

function draftFromCost(cost = {}, fallbackPeriodMonth = getCurrentPeriodMonth()) {
  return {
    period_month: String(cost.period_month || fallbackPeriodMonth).slice(0, 7),
    category: cost.category || 'other',
    vendor: cost.vendor || '',
    amount: centsToInput(cost.amount_cents),
    billing_date: cost.billing_date || '',
    is_recurring: cost.is_recurring !== false,
    receipt_url: cost.receipt_url || '',
    notes: cost.notes || ''
  };
}

function buildClientSummary(costs = []) {
  const categoryTotals = {};
  const vendors = new Set();
  let totalCostCents = 0;
  let recurringCostCents = 0;
  let oneTimeCostCents = 0;

  for (const cost of costs) {
    const amountCents = Number(cost.amount_cents || 0);
    totalCostCents += amountCents;
    categoryTotals[cost.category || 'other'] = (categoryTotals[cost.category || 'other'] || 0) + amountCents;

    if (cost.vendor) {
      vendors.add(cost.vendor.trim().toLowerCase());
    }

    if (cost.is_recurring === false) {
      oneTimeCostCents += amountCents;
    } else {
      recurringCostCents += amountCents;
    }
  }

  return {
    total_cost_cents: totalCostCents,
    recurring_cost_cents: recurringCostCents,
    one_time_cost_cents: oneTimeCostCents,
    category_totals: categoryTotals,
    vendor_count: vendors.size,
    entry_count: costs.length
  };
}

export default function StaffOperatingCostsPage() {
  const queryClient = useQueryClient();
  const staffPayload = getReadyRouteStaffTokenPayload() || {};
  const canManageCosts = ['owner', 'admin'].includes(staffPayload.staff_role);
  const [periodMonth, setPeriodMonth] = useState(getCurrentPeriodMonth());
  const [selectedCostId, setSelectedCostId] = useState('');
  const [draft, setDraft] = useState(() => createDraft(periodMonth));
  const [saveMessage, setSaveMessage] = useState('');

  const costsQuery = useQuery({
    queryKey: ['staff-operating-costs', periodMonth],
    queryFn: async () => {
      const response = await api.get('/staff/operating-costs', {
        params: { period_month: periodMonth }
      });
      return response.data || {};
    }
  });

  const operatingCosts = useMemo(
    () => (Array.isArray(costsQuery.data?.operating_costs) ? costsQuery.data.operating_costs : []),
    [costsQuery.data]
  );
  const summary = costsQuery.data?.summary || buildClientSummary(operatingCosts);
  const categoryBreakdown = useMemo(() => (
    COST_CATEGORIES
      .map((category) => ({
        ...category,
        amount_cents: Number(summary.category_totals?.[category.value] || 0)
      }))
      .filter((category) => category.amount_cents > 0)
      .sort((left, right) => right.amount_cents - left.amount_cents)
  ), [summary.category_totals]);

  const saveCostMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        period_month: draft.period_month,
        category: draft.category,
        vendor: draft.vendor,
        amount_cents: inputToCents(draft.amount),
        billing_date: draft.billing_date || null,
        is_recurring: draft.is_recurring,
        receipt_url: draft.receipt_url,
        notes: draft.notes
      };
      const response = selectedCostId
        ? await api.patch(`/staff/operating-costs/${selectedCostId}`, payload)
        : await api.post('/staff/operating-costs', payload);

      return response.data?.operating_cost || null;
    },
    onSuccess: (operatingCost) => {
      const nextPeriodMonth = String(operatingCost?.period_month || draft.period_month || periodMonth).slice(0, 7);
      setPeriodMonth(nextPeriodMonth);
      setSelectedCostId('');
      setDraft(createDraft(nextPeriodMonth));
      setSaveMessage(selectedCostId ? 'Operating cost updated.' : 'Operating cost added.');
      queryClient.invalidateQueries({ queryKey: ['staff-operating-costs'] });
    }
  });

  function updateDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setSaveMessage('');
  }

  function handlePeriodChange(value) {
    setPeriodMonth(value);
    setSelectedCostId('');
    setDraft(createDraft(value));
    setSaveMessage('');
  }

  function handleEditCost(cost) {
    setSelectedCostId(cost.id);
    setDraft(draftFromCost(cost, periodMonth));
    setSaveMessage('');
  }

  function handleNewCost() {
    setSelectedCostId('');
    setDraft(createDraft(periodMonth));
    setSaveMessage('');
  }

  async function handleSaveCost(event) {
    event.preventDefault();
    setSaveMessage('');

    try {
      await saveCostMutation.mutateAsync();
    } catch {
      // The mutation state renders the user-facing error.
    }
  }

  return (
    <section className="staff-page staff-operating-costs-page">
      <PageHeader
        eyebrow="ReadyRoute Internal"
        title="Operating Costs"
        description="ReadyRoute-wide monthly expenses, separate from customer accounts."
        actions={(
          <div className="staff-header-controls">
            <label>
              Month
              <input
                onChange={(event) => handlePeriodChange(event.target.value)}
                type="month"
                value={periodMonth}
              />
            </label>
            <button className="secondary-inline-button" onClick={() => costsQuery.refetch()} type="button">
              Refresh
            </button>
          </div>
        )}
      />

      <div className="staff-stat-grid">
        <StatCard label="Monthly Cost" value={formatCurrencyFromCents(summary.total_cost_cents)} tone={summary.total_cost_cents ? 'warning' : 'default'} />
        <StatCard label="Recurring" value={formatCurrencyFromCents(summary.recurring_cost_cents)} />
        <StatCard label="One-Time" value={formatCurrencyFromCents(summary.one_time_cost_cents)} />
        <StatCard label="Vendors" value={summary.vendor_count || 0} />
        <StatCard label="Entries" value={summary.entry_count || 0} />
      </div>

      {costsQuery.data?.setup_required ? (
        <div className="info-banner">
          Operating costs need the ReadyRoute operating costs SQL migration before entries can be saved.
        </div>
      ) : null}

      {costsQuery.isError ? (
        <ErrorState
          title="Unable to load operating costs"
          description="The monthly ledger could not refresh."
          onRetry={() => costsQuery.refetch()}
        />
      ) : null}

      <div className="staff-operating-costs-layout">
        <section className="staff-detail-panel staff-operating-costs-list-card">
          <div className="staff-section-heading-row">
            <h3>Monthly Ledger</h3>
            {canManageCosts ? (
              <button className="secondary-inline-button" onClick={handleNewCost} type="button">
                New Entry
              </button>
            ) : null}
          </div>

          {costsQuery.isLoading ? (
            <LoadingState title="Loading operating costs" />
          ) : operatingCosts.length ? (
            <div className="staff-operating-cost-list">
              {operatingCosts.map((cost) => (
                <button
                  className={`staff-operating-cost-row${selectedCostId === cost.id ? ' selected' : ''}`}
                  disabled={!canManageCosts}
                  key={cost.id}
                  onClick={() => handleEditCost(cost)}
                  type="button"
                >
                  <span>
                    <strong>{cost.vendor}</strong>
                    <small>{getCategoryLabel(cost.category)} · {formatDate(cost.billing_date || cost.period_month)}</small>
                  </span>
                  <span>
                    <strong>{formatCurrencyFromCents(cost.amount_cents)}</strong>
                    <StatusBadge tone={cost.is_recurring ? 'active' : 'neutral'}>
                      {cost.is_recurring ? 'Recurring' : 'One-time'}
                    </StatusBadge>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No operating costs for this month"
              description="Add ReadyRoute vendor costs as monthly invoices arrive."
              variant="inline"
            />
          )}
        </section>

        <section className="staff-detail-panel">
          <h3>{selectedCostId ? 'Edit Cost' : 'Add Cost'}</h3>
          {canManageCosts ? (
            <form className="staff-cost-form staff-operating-cost-form" onSubmit={handleSaveCost}>
              <label>
                Month
                <input
                  onChange={(event) => updateDraft({ period_month: event.target.value })}
                  type="month"
                  value={draft.period_month}
                />
              </label>
              <label>
                Category
                <select value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })}>
                  {COST_CATEGORIES.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vendor / Tool
                <input
                  onChange={(event) => updateDraft({ vendor: event.target.value })}
                  placeholder="Example: Vercel"
                  required
                  type="text"
                  value={draft.vendor}
                />
              </label>
              <label>
                Amount
                <input
                  inputMode="decimal"
                  min="0"
                  onChange={(event) => updateDraft({ amount: event.target.value })}
                  required
                  step="0.01"
                  type="number"
                  value={draft.amount}
                />
              </label>
              <label>
                Billing date
                <input
                  onChange={(event) => updateDraft({ billing_date: event.target.value })}
                  type="date"
                  value={draft.billing_date}
                />
              </label>
              <label className="staff-checkbox-label">
                <input
                  checked={draft.is_recurring}
                  onChange={(event) => updateDraft({ is_recurring: event.target.checked })}
                  type="checkbox"
                />
                Recurring monthly cost
              </label>
              <label className="staff-cost-form-notes">
                Receipt URL
                <input
                  onChange={(event) => updateDraft({ receipt_url: event.target.value })}
                  placeholder="https://..."
                  type="url"
                  value={draft.receipt_url}
                />
              </label>
              <label className="staff-cost-form-notes">
                Notes
                <textarea
                  onChange={(event) => updateDraft({ notes: event.target.value })}
                  value={draft.notes}
                />
              </label>
              {saveCostMutation.isError ? (
                <div className="error-banner">{saveCostMutation.error?.response?.data?.error || 'Operating cost could not be saved.'}</div>
              ) : saveMessage ? (
                <div className="info-banner">{saveMessage}</div>
              ) : null}
              <button className="primary-cta" disabled={saveCostMutation.isPending} type="submit">
                {saveCostMutation.isPending ? 'Saving...' : selectedCostId ? 'Update Cost' : 'Add Cost'}
              </button>
            </form>
          ) : (
            <EmptyState
              title="View-only access"
              description="Owner or admin staff can add and edit operating costs."
              variant="inline"
            />
          )}
        </section>

        <section className="staff-detail-panel staff-detail-panel-wide">
          <h3>Category Breakdown</h3>
          {categoryBreakdown.length ? (
            <div className="staff-cost-breakdown-grid">
              {categoryBreakdown.map((category) => (
                <article key={category.value}>
                  <span>{category.label}</span>
                  <strong>{formatCurrencyFromCents(category.amount_cents)}</strong>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState title="No category totals yet" description="Category totals appear after costs are added." variant="inline" />
          )}
        </section>
      </div>
    </section>
  );
}
