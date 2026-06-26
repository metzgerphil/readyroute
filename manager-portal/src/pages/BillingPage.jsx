import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  ActionBanner,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  StatCard,
  StatusBadge,
  TableToolbar
} from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import api from '../services/api';

const MAX_COMMITTED_ROUTE_COUNT = 10000;

function getCurrentBillingMonth() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${today.getFullYear()}-${month}`;
}

function formatCurrency(cents, currency = 'usd') {
  const amount = Number(cents || 0) / 100;

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: String(currency || 'usd').toUpperCase(),
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString('en-US')}`;
  }
}

function formatBillingMonth(value) {
  const [year, month] = String(value || '').split('-').map(Number);
  const date = new Date(year, (month || 1) - 1, 1, 12, 0, 0);

  if (!year || !month || Number.isNaN(date.getTime())) {
    return value || 'Current month';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(date);
}

function formatDateTime(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getCommittedRouteCountError(value) {
  if (value === '') {
    return 'Enter the monthly route commitment.';
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return 'Enter a whole number.';
  }

  if (parsed < 0 || parsed > MAX_COMMITTED_ROUTE_COUNT) {
    return `Enter a number from 0 to ${MAX_COMMITTED_ROUTE_COUNT}.`;
  }

  return '';
}

function getBillingTotalDetail(billing) {
  if (billing?.is_billing_exempt) {
    return 'Billing exempt';
  }

  if (billing?.free_month_applied) {
    return 'Free month applied';
  }

  return `${formatCurrency(billing?.billing_rate_cents, billing?.currency)} per route`;
}

function BillingRouteRow({ route }) {
  return (
    <div className="billing-route-row">
      <div className="billing-route-cell">
        <span className="billing-route-mobile-label">Route</span>
        <span className="billing-route-name">{route.route_display_name || route.route_key || 'Route'}</span>
      </div>
      <div className="billing-route-cell">
        <span className="billing-route-mobile-label">First Import</span>
        <span>{formatDateTime(route.first_imported_at)}</span>
      </div>
      <div className="billing-route-cell">
        <span className="billing-route-mobile-label">Latest Import</span>
        <span>{formatDateTime(route.last_imported_at)}</span>
      </div>
      <div className="billing-route-cell">
        <span className="billing-route-mobile-label">Status</span>
        <StatusBadge tone={route.status === 'pending' ? 'warning' : 'neutral'}>
          {route.status || 'pending'}
        </StatusBadge>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { selectedCsaId, selectedCsaName } = useSelectedCsa();
  const [billingMonth, setBillingMonth] = useState(getCurrentBillingMonth);
  const [committedRouteDraft, setCommittedRouteDraft] = useState('');
  const [hasTouchedCommitment, setHasTouchedCommitment] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const billingQueryKey = ['billing-summary', selectedCsaId, billingMonth];

  const billingQuery = useQuery({
    queryKey: billingQueryKey,
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/billing/summary', {
        params: { month: billingMonth }
      });
      return response.data?.billing || null;
    }
  });

  const billing = billingQuery.data;
  const committedRouteValue = hasTouchedCommitment
    ? committedRouteDraft
    : String(billing?.committed_route_count ?? '');
  const routeCountError = getCommittedRouteCountError(committedRouteValue);
  const visibleRouteCountError = hasTouchedCommitment ? routeCountError : '';

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const response = await api.patch('/manager/billing/settings', {
        month: billingMonth,
        committed_route_count: Number(committedRouteValue)
      });
      return response.data || {};
    },
    onSuccess: (data) => {
      if (data.billing) {
        queryClient.setQueryData(billingQueryKey, data.billing);
      }
      setCommittedRouteDraft('');
      setHasTouchedCommitment(false);
      setSaveMessage('Billing commitment saved.');
    },
    onError: () => {
      setSaveMessage('');
    }
  });

  const routes = useMemo(() => billing?.routes || [], [billing?.routes]);
  const hasSummary = Boolean(billing);
  const isSaving = saveSettingsMutation.isPending;
  const canSave = !routeCountError && !isSaving;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Billing | ReadyRoute';

    return () => {
      document.title = previousTitle;
    };
  }, []);

  function handleSaveSettings(event) {
    event.preventDefault();
    setSaveMessage('');
    setHasTouchedCommitment(true);

    if (routeCountError) {
      return;
    }

    saveSettingsMutation.mutate();
  }

  function handleCommittedRouteChange(event) {
    setCommittedRouteDraft(event.target.value);
    setHasTouchedCommitment(true);
    setSaveMessage('');
  }

  function handleBillingMonthChange(event) {
    setBillingMonth(event.target.value || getCurrentBillingMonth());
    setCommittedRouteDraft('');
    setHasTouchedCommitment(false);
    setSaveMessage('');
  }

  return (
    <section className="page-section billing-page">
      <PageHeader
        description={`${selectedCsaName ? `${selectedCsaName} · ` : ''}${formatBillingMonth(billingMonth)}`}
        title="Billing"
        actions={(
          <label className="billing-month-picker">
            <span className="field-label">Billing Month</span>
            <input
              className="date-field"
              onChange={handleBillingMonthChange}
              type="month"
              value={billingMonth}
            />
          </label>
        )}
      />

      <ActionBanner
        compact
        description="Imported FedEx manifest routes are being tracked here before Stripe charging is enabled."
        title="Shadow billing mode"
        action={<StatusBadge tone="integration">No automatic charge</StatusBadge>}
      />

      {!selectedCsaId || billingQuery.isLoading ? (
        <LoadingState
          title="Loading billing"
          description="Pulling the monthly route ledger and billing settings."
          variant="card"
        />
      ) : null}

      {billingQuery.isError ? (
        <ErrorState
          title="Unable to load billing"
          description="ReadyRoute could not load the route billing summary right now."
          onRetry={() => billingQuery.refetch()}
        />
      ) : null}

      {hasSummary && !billingQuery.isError ? (
        <>
          <div className="billing-summary-grid">
            <StatCard
              label="Monthly Commitment"
              value={billing.committed_route_count}
              detail={billing.commitment_source === 'legacy_vehicle_count' ? 'Defaulted from vehicle count' : 'Billing settings'}
            />
            <StatCard
              label="Imported Routes"
              value={billing.imported_billable_routes}
              detail="Unique FedEx manifest routes"
              tone={billing.imported_billable_routes ? 'active' : 'default'}
            />
            <StatCard
              label="Billable Routes"
              value={billing.billable_quantity}
              detail={billing.additional_route_count ? `${billing.additional_route_count} above commitment` : 'Within commitment'}
              tone={billing.additional_route_count ? 'warning' : 'default'}
            />
            <StatCard
              label="Estimated Total"
              value={formatCurrency(billing.estimated_total_cents, billing.currency)}
              detail={getBillingTotalDetail(billing)}
              tone={billing.estimated_total_cents ? 'active' : 'default'}
            />
          </div>

          <div className="billing-workspace-grid">
            <form className="card billing-settings-card" onSubmit={handleSaveSettings}>
              <div>
                <div className="card-title">Monthly route commitment</div>
                <p>Set the number of routes this CSA expects to run each month.</p>
              </div>

              <label className="billing-route-count-field">
                <span className="field-label">Committed Routes</span>
                <input
                  aria-describedby="billing-route-count-help"
                  aria-invalid={Boolean(visibleRouteCountError)}
                  className="text-field"
                  inputMode="numeric"
                  max={MAX_COMMITTED_ROUTE_COUNT}
                  min="0"
                  onChange={handleCommittedRouteChange}
                  step="1"
                  type="number"
                  value={committedRouteValue}
                />
              </label>
              <div className="driver-meta" id="billing-route-count-help">
                Imports above this count are counted as additional billable routes for the month.
              </div>

              {visibleRouteCountError ? <div className="error-banner">{visibleRouteCountError}</div> : null}
              {saveSettingsMutation.isError ? (
                <div className="error-banner">
                  {saveSettingsMutation.error?.response?.data?.error || 'Billing commitment could not be saved.'}
                </div>
              ) : null}
              {saveMessage ? <div className="success-banner">{saveMessage}</div> : null}

              <div className="billing-settings-actions">
                <button className="primary-cta" disabled={!canSave} type="submit">
                  {isSaving ? 'Saving...' : 'Save Commitment'}
                </button>
              </div>
            </form>

            <div className="card billing-calculation-card">
              <div className="card-title">Current calculation</div>
              <div className="billing-calculation-list">
                <div>
                  <span>Committed routes</span>
                  <strong>{billing.committed_route_count}</strong>
                </div>
                <div>
                  <span>Imported routes</span>
                  <strong>{billing.imported_billable_routes}</strong>
                </div>
                <div>
                  <span>Billable route total</span>
                  <strong>{billing.billable_quantity}</strong>
                </div>
                <div>
                  <span>Estimated total</span>
                  <strong>{formatCurrency(billing.estimated_total_cents, billing.currency)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card billing-routes-card">
            <TableToolbar
              title="Imported FedEx Manifest Routes"
              meta={`${routes.length} unique route${routes.length === 1 ? '' : 's'} in ${formatBillingMonth(billingMonth)}`}
            />

            {routes.length ? (
              <DataTable className="billing-routes-table">
                <div className="billing-routes-table-header" aria-hidden="true">
                  <span>Route</span>
                  <span>First Import</span>
                  <span>Latest Import</span>
                  <span>Status</span>
                </div>
                {routes.map((route) => (
                  <BillingRouteRow key={route.id || route.route_key} route={route} />
                ))}
              </DataTable>
            ) : (
              <EmptyState
                title="No imported routes yet"
                description="When a FedEx manifest is imported for this billing month, the route will appear here."
                variant="inline"
              />
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}
