import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ActionBanner, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import api from '../services/api';

function formatCurrency(cents, interval = 'monthly') {
  const amount = Number(cents || 0) / 100;
  const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
  return `${formatted}/${interval === 'annual' ? 'year' : 'month'}`;
}

function formatDateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function activationLabel(status) {
  if (status === 'active') return 'Active';
  if (status === 'ready') return 'Ready for staff activation';
  if (status === 'creating') return 'Activating';
  if (status === 'past_due') return 'Payment past due';
  if (status === 'action_required') return 'Payment action needed';
  return 'Not activated';
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const { selectedCsaId, selectedCsaName } = useSelectedCsa();
  const [cancellationConfirm, setCancellationConfirm] = useState('');
  const [cancellationReason, setCancellationReason] = useState('');

  const billingQuery = useQuery({
    queryKey: ['driver-subscription-summary', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => (await api.get('/billing/subscription-summary')).data?.billing || null
  });
  const lifecycleQuery = useQuery({
    queryKey: ['account-lifecycle', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => (await api.get('/manager/account/lifecycle')).data?.account || null
  });
  const portalMutation = useMutation({
    mutationFn: async () => (await api.post('/billing/portal')).data,
    onSuccess: (data) => { if (data?.url) window.location.assign(data.url); }
  });
  const cancelAccountMutation = useMutation({
    mutationFn: async () => (await api.post('/manager/account/cancel', {
      confirm_company_name: cancellationConfirm,
      reason: cancellationReason
    })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['account-lifecycle', selectedCsaId] })
  });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = 'Billing | ReadyRoute';
    return () => { document.title = previousTitle; };
  }, []);

  const billing = billingQuery.data;
  const lifecycle = lifecycleQuery.data;
  const interval = billing?.billing_interval || 'monthly';
  const driverWord = billing?.active_driver_count === 1 ? 'driver' : 'drivers';

  async function handleAccountExport() {
    const response = await api.get('/manager/account/export', { responseType: 'blob' });
    const downloadUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `readyroute-${selectedCsaId}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  }

  return (
    <section className="page-section billing-page">
      <PageHeader title="Billing" description={`${selectedCsaName || 'Company'} · active-driver subscription`} />
      <ActionBanner
        compact
        title="Simple per-driver pricing"
        description="Ready Route is $10 per active driver each month or $100 per active driver each year. Inactive drivers are not included in the subscription quantity."
        action={<StatusBadge tone={billing?.billing_activation_status === 'active' ? 'active' : 'integration'}>{activationLabel(billing?.billing_activation_status)}</StatusBadge>}
      />

      {!selectedCsaId || billingQuery.isLoading ? <LoadingState title="Loading subscription" description="Checking drivers and payment status." variant="card" /> : null}
      {billingQuery.isError ? <ErrorState title="Unable to load billing" description="Ready Route could not load the subscription details." onRetry={() => billingQuery.refetch()} /> : null}

      {billing ? (
        <>
          <div className="billing-summary-grid">
            <StatCard label="Active drivers" value={billing.active_driver_count} detail={`${billing.active_driver_count} ${driverWord} with access`} tone={billing.active_driver_count ? 'active' : 'default'} />
            <StatCard label="Price per driver" value={formatCurrency(billing.unit_amount_cents, interval)} detail={interval === 'annual' ? 'Annual plan' : 'Monthly plan'} />
            <StatCard label="Estimated subscription" value={formatCurrency(billing.estimated_total_cents, interval)} detail="Updates when active drivers change" tone={billing.estimated_total_cents ? 'active' : 'default'} />
            <StatCard label="Payment method" value={billing.payment_method_ready ? 'Ready' : 'Needed'} detail={billing.payment_method_ready ? 'Securely saved with Stripe' : 'Contact Ready Route to complete setup'} tone={billing.payment_method_ready ? 'active' : 'warning'} />
          </div>

          <div className="card billing-calculation-card">
            <div className="card-title">How your subscription works</div>
            <div className="billing-calculation-list">
              <div><span>Active drivers</span><strong>{billing.active_driver_count}</strong></div>
              <div><span>Billing schedule</span><strong>{interval === 'annual' ? 'Annual' : 'Monthly'}</strong></div>
              <div><span>Subscription status</span><strong>{activationLabel(billing.billing_activation_status)}</strong></div>
              <div><span>Estimated total</span><strong>{formatCurrency(billing.estimated_total_cents, interval)}</strong></div>
            </div>
            <p className="driver-meta">Ready Route staff reviews and activates the first subscription. After activation, adding or deactivating drivers automatically updates the billed driver count.</p>
            {billing.subscription_active ? <button className="secondary-button" disabled={portalMutation.isPending} onClick={() => portalMutation.mutate()} type="button">{portalMutation.isPending ? 'Opening…' : 'Manage payment and invoices'}</button> : null}
            {portalMutation.isError ? <div className="error-banner">{portalMutation.error?.response?.data?.error || 'Billing management could not be opened.'}</div> : null}
          </div>
        </>
      ) : null}

      {lifecycle ? (
        <div className="card billing-account-lifecycle-card">
          <div><div className="card-title">Account and data</div><p>Export company records at any time. Cancellation ends service at the billing-period boundary and retains the workspace for 60 days for staff-assisted recovery.</p></div>
          <div className="billing-account-lifecycle-status">
            <span className="field-label">Workspace status</span>
            <StatusBadge tone={lifecycle.account_status === 'active' ? 'active' : 'warning'}>{lifecycle.account_status || 'active'}</StatusBadge>
            {lifecycle.service_ends_at ? <span>Service ends {formatDateTime(lifecycle.service_ends_at)}</span> : null}
          </div>
          <button className="secondary-button" onClick={handleAccountExport} type="button">Export account data</button>
          {lifecycle.can_cancel && lifecycle.account_status === 'active' ? (
            <form className="billing-cancellation-form" onSubmit={(event) => { event.preventDefault(); cancelAccountMutation.mutate(); }}>
              <strong>Schedule cancellation</strong>
              <label>Reason (optional)<input className="text-field" onChange={(event) => setCancellationReason(event.target.value)} value={cancellationReason} /></label>
              <label>Type {lifecycle.company_name} to confirm<input className="text-field" onChange={(event) => setCancellationConfirm(event.target.value)} value={cancellationConfirm} /></label>
              {cancelAccountMutation.isError ? <div className="error-banner">{cancelAccountMutation.error?.response?.data?.error || 'Cancellation could not be scheduled.'}</div> : null}
              {cancelAccountMutation.isSuccess ? <div className="success-banner">Cancellation scheduled.</div> : null}
              <button className="secondary-button billing-cancel-account-button" disabled={cancelAccountMutation.isPending || cancellationConfirm !== lifecycle.company_name} type="submit">{cancelAccountMutation.isPending ? 'Scheduling…' : 'Schedule cancellation'}</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
