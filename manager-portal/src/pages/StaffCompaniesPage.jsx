import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import api from '../services/api';

function formatDateTime(value, includeTime = false) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...(includeTime ? { hour: 'numeric', minute: '2-digit' } : {})
  }).format(date);
}

function formatMonth(value) {
  if (!value) return 'Current month';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatPercent(value, emptyLabel = 'No ratings') {
  return value == null ? emptyLabel : `${Math.round(Number(value) * 100)}%`;
}

function formatEstimatedTime(minutes) {
  const numericMinutes = Number(minutes || 0);
  if (numericMinutes < 60) return `${numericMinutes} min`;
  return `${(numericMinutes / 60).toFixed(1)} hr`;
}

function formatResponseMode(mode) {
  if (mode === 'ANSWER') return 'Verified answer';
  if (mode === 'CLARIFY') return 'Asked one detail';
  return 'Escalated safely';
}

function responseTone(mode) {
  if (mode === 'ANSWER') return 'active';
  if (mode === 'CLARIFY') return 'warning';
  return 'neutral';
}

export default function StaffCompaniesPage() {
  const queryClient = useQueryClient();
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [isCreateCompanyOpen, setIsCreateCompanyOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState({ company_name: '', manager_name: '', manager_email: '' });
  const [companyCreateMessage, setCompanyCreateMessage] = useState('');
  const [managerInviteStatus, setManagerInviteStatus] = useState({});
  const [billingConfirmation, setBillingConfirmation] = useState('');
  const [billingActivationMessage, setBillingActivationMessage] = useState('');

  const accountsQuery = useQuery({
    queryKey: ['staff-accounts'],
    queryFn: async () => {
      const response = await api.get('/staff/accounts');
      return response.data?.accounts || [];
    }
  });

  const companySignupsQuery = useQuery({
    queryKey: ['staff-company-signups'],
    queryFn: async () => (await api.get('/staff/company-signups')).data?.pending_signups || []
  });

  const accounts = useMemo(
    () => (Array.isArray(accountsQuery.data) ? accountsQuery.data : []),
    [accountsQuery.data]
  );

  const filteredAccounts = useMemo(() => {
    const search = companySearch.trim().toLowerCase();
    if (!search) return accounts;
    return accounts.filter((account) => [account.company_name, account.manager_email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(search));
  }, [accounts, companySearch]);

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
          ? 'Company created and the manager invitation was emailed.'
          : result?.invitation?.email_delivery === 'not_required'
            ? 'Company created and linked to the manager’s existing Ready Route login.'
            : 'Company created, but email delivery needs attention.'
      );
      await queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['staff-company-signups'] });
      if (result?.account?.id) setSelectedAccountId(result.account.id);
    },
    onError: (error) => setCompanyCreateMessage(error.response?.data?.error || 'Unable to create this company.')
  });

  const resendManagerInviteMutation = useMutation({
    mutationFn: async ({ accountId, managerId }) => {
      const response = await api.post(`/staff/accounts/${accountId}/managers/${managerId}/invite`);
      return response.data || {};
    },
    onSuccess: (payload, variables) => {
      setManagerInviteStatus((current) => ({
        ...current,
        [variables.managerId]: {
          tone: payload.email_delivery?.delivered ? 'success' : 'warning',
          message: payload.email_delivery?.delivered
            ? `Invitation emailed again ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date())}.`
            : 'Email was not accepted by the delivery service. Copy the refreshed invitation link below.',
          inviteUrl: payload.invite_url || ''
        }
      }));
      queryClient.invalidateQueries({ queryKey: ['staff-account-detail', variables.accountId] });
    },
    onError: (error, variables) => {
      setManagerInviteStatus((current) => ({
        ...current,
        [variables.managerId]: {
          tone: 'error',
          message: error.response?.data?.error || 'The manager invitation was not resent.',
          inviteUrl: ''
        }
      }));
    }
  });

  const activateBillingMutation = useMutation({
    mutationFn: async ({ accountId, companyName }) => (await api.post(`/staff/accounts/${accountId}/billing/activate`, { confirm_company_name: companyName })).data,
    onSuccess: async (result, variables) => {
      setBillingActivationMessage(`Billing activated for ${result.active_driver_count || 0} active drivers.`);
      setBillingConfirmation('');
      await queryClient.invalidateQueries({ queryKey: ['staff-account-detail', variables.accountId] });
      await queryClient.invalidateQueries({ queryKey: ['staff-accounts'] });
    },
    onError: (error) => setBillingActivationMessage(error.response?.data?.error || 'Billing could not be activated.')
  });

  const detail = accountDetailQuery.data || {};
  const account = detail.account || selectedAccount;
  const driverHelp = detail.driver_help || {};
  const metrics = driverHelp.metrics || {};
  const interactions = Array.isArray(driverHelp.recent_interactions) ? driverHelp.recent_interactions : [];
  const feedback = Array.isArray(driverHelp.recent_feedback) ? driverHelp.recent_feedback : [];
  const driverMetrics = Array.isArray(driverHelp.driver_metrics) ? driverHelp.driver_metrics : [];
  const managers = Array.isArray(detail.managers) ? detail.managers : [];
  const drivers = Array.isArray(detail.drivers) ? detail.drivers : [];
  const monthlyReports = Array.isArray(driverHelp.monthly_reports) ? driverHelp.monthly_reports : [];
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
  const feedbackByInteraction = new Map(feedback.map((item) => [item.interaction_id, item]));

  function updateCompanyDraft(field, value) {
    setCompanyDraft((current) => ({ ...current, [field]: value }));
    setCompanyCreateMessage('');
  }

  function prepareCompanyFromSignup(signup) {
    setCompanyDraft({ company_name: signup.company_name || '', manager_name: signup.name || '', manager_email: signup.email || '' });
    setCompanyCreateMessage('Review the signup details, then create the company and send the manager invitation.');
    setIsCreateCompanyOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <section className="staff-page staff-companies-page">
      <PageHeader
        eyebrow="Ready Route Staff"
        title="Companies"
        description="Open company accounts and review how drivers use Ready Route."
        actions={(
          <button className="primary-button" onClick={() => { setCompanyCreateMessage(''); setIsCreateCompanyOpen(true); }} type="button">
            Add company
          </button>
        )}
      />

      {companyCreateMessage ? <p className="form-success-message" role="status">{companyCreateMessage}</p> : null}

      {companySignupsQuery.isLoading ? (
        <LoadingState title="Loading new company signups" variant="card" />
      ) : companySignupsQuery.isError ? (
        <ErrorState title="Unable to load new company signups" description="Company accounts are still available below. Refresh this queue before onboarding a new request." onRetry={() => companySignupsQuery.refetch()} />
      ) : companySignupsQuery.data?.length ? (
        <section className="staff-account-detail staff-signup-queue" aria-label="New company signups">
          <header className="staff-account-detail-header"><h2>New company signups</h2><p>Open the company account and email the manager their secure password link.</p></header>
          <div className="staff-compact-list">
            {companySignupsQuery.data.map((signup) => (
              <article key={signup.id}>
                <div>
                  <strong>{signup.company_name || 'Company name not provided'}</strong>
                  <span>{signup.name || 'Manager name not provided'} · {signup.email}</span>
                  <span>{signup.driver_count || 'No'} expected driver{signup.driver_count === 1 ? '' : 's'}{signup.billing_interval ? ` · ${signup.billing_interval} billing requested` : ''}{signup.created_at ? ` · Signed up ${formatDateTime(signup.created_at, true)}` : ''}</span>
                </div>
                <div className="staff-user-row-badges">
                  <StatusBadge tone={signup.billing_setup_status === 'succeeded' ? 'active' : 'warning'}>{signup.billing_setup_status === 'succeeded' ? 'Payment method ready' : 'Payment not collected'}</StatusBadge>
                  <button className="primary-button" onClick={() => prepareCompanyFromSignup(signup)} type="button">Review and onboard</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="staff-account-detail staff-signup-queue" aria-label="New company signups"><EmptyState title="No pending company signups" description="New requests from readyroute.org/signup will appear here." variant="inline" /></section>
      )}

      {isCreateCompanyOpen ? (
        <section className="staff-account-detail staff-create-company-card" aria-label="Create company">
          <header className="staff-account-detail-header">
            <h2>Open a company account</h2>
            <p>The manager will receive a secure link to create their password.</p>
          </header>
          <div className="staff-company-finder-grid staff-company-create-grid">
            <label>Company name<input value={companyDraft.company_name} onChange={(event) => updateCompanyDraft('company_name', event.target.value)} /></label>
            <label>Manager full name<input value={companyDraft.manager_name} onChange={(event) => updateCompanyDraft('manager_name', event.target.value)} /></label>
            <label>Manager email<input type="email" value={companyDraft.manager_email} onChange={(event) => updateCompanyDraft('manager_email', event.target.value)} /></label>
          </div>
          {createCompanyMutation.isError ? <p className="support-ticket-save-error">{companyCreateMessage}</p> : null}
          <div className="staff-inline-actions">
            <button
              className="primary-button"
              disabled={createCompanyMutation.isPending || !companyDraft.company_name.trim() || !companyDraft.manager_name.trim() || !companyDraft.manager_email.trim()}
              onClick={() => createCompanyMutation.mutate()}
              type="button"
            >
              {createCompanyMutation.isPending ? 'Creating…' : 'Create and invite manager'}
            </button>
            <button className="secondary-inline-button" onClick={() => setIsCreateCompanyOpen(false)} type="button">Cancel</button>
          </div>
        </section>
      ) : null}

      {accountsQuery.isLoading ? (
        <LoadingState title="Loading companies" variant="card" />
      ) : accountsQuery.isError ? (
        <ErrorState title="Unable to load companies" description="Refresh this page or sign back in." onRetry={() => accountsQuery.refetch()} />
      ) : accounts.length ? (
        <>
          <section className="staff-company-selector-card" aria-label="Choose company">
            <label>
              Find a company
              <input
                onChange={(event) => setCompanySearch(event.target.value)}
                placeholder="Search company or manager email"
                type="search"
                value={companySearch}
              />
            </label>
            <label>
              Company
              <select
                disabled={!filteredAccounts.length}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                value={selectedAccount?.id || ''}
              >
                {filteredAccounts.map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}
              </select>
            </label>
          </section>

          {!selectedAccount ? (
            <EmptyState title="No matching company" description="Clear your search to choose a company." />
          ) : accountDetailQuery.isLoading ? (
            <LoadingState title="Loading company usage" variant="card" />
          ) : accountDetailQuery.isError ? (
            <ErrorState title="Unable to load company usage" description="The account could not be refreshed." onRetry={() => accountDetailQuery.refetch()} />
          ) : account ? (
            <article className="staff-account-detail staff-company-usage-detail">
              <header className="staff-account-detail-header staff-company-summary-header">
                <div>
                  <p className="rr-eyebrow">Company account</p>
                  <h2>{account.company_name}</h2>
                  <p>{account.manager_email || 'No manager email'} · Opened {formatDateTime(account.created_at)}</p>
                </div>
                <button className="secondary-inline-button" onClick={() => accountDetailQuery.refetch()} type="button">Refresh data</button>
              </header>

              <div className="staff-stat-grid staff-usage-stat-grid">
                <StatCard label="Active drivers" value={metrics.active_drivers ?? account.counts?.active_drivers ?? 0} />
                <StatCard label="Questions this month" value={metrics.total_questions || 0} />
                <StatCard label="Verified success rate" value={formatPercent(metrics.success_rate, 'No questions')} tone={metrics.success_rate != null ? 'active' : 'default'} />
                <StatCard label="Failed questions" value={metrics.failed_questions || 0} tone={metrics.failed_questions ? 'warning' : 'default'} />
                <StatCard label="Helpful ratings" value={formatPercent(metrics.helpful_rate)} tone={metrics.helpful_rate != null ? 'active' : 'default'} />
                <StatCard label="Feedback coverage" value={formatPercent(metrics.feedback_response_rate, 'No answers')} />
                <StatCard label="Estimated time saved" value={formatEstimatedTime(metrics.estimated_manager_minutes_avoided)} />
              </div>
              <p className="staff-usage-estimate-note">
                A question is one driver-help situation, even when Ready Route asks a follow-up. Success means the situation reached at least one verified answer. Helpful rate includes rated answers only; feedback coverage shows how many verified answers received a rating. Time saved remains an estimate: {metrics.minutes_per_answer_estimate || account.driver_help_minutes_per_answer_estimate || 5} minutes per successful situation.
              </p>

              <section className="staff-simple-section">
                <div className="staff-simple-section-header">
                  <div><h3>Subscription activation</h3><p>$10 per active driver monthly or $100 per active driver annually.</p></div>
                  <StatusBadge tone={account.billing_activation_status === 'active' ? 'active' : account.billing_setup_status === 'succeeded' ? 'warning' : 'neutral'}>{account.billing_activation_status === 'active' ? 'Billing active' : account.billing_setup_status === 'succeeded' ? 'Ready to activate' : 'Payment method needed'}</StatusBadge>
                </div>
                <div className="staff-company-finder-grid staff-company-create-grid">
                  <div><span className="field-label">Plan</span><strong>{account.billing_interval === 'annual' ? '$100/year' : '$10/month'} per active driver</strong></div>
                  <div><span className="field-label">Active drivers</span><strong>{account.counts?.active_drivers || 0}</strong></div>
                  <div><span className="field-label">Estimated total</span><strong>${(account.counts?.active_drivers || 0) * (account.billing_interval === 'annual' ? 100 : 10)}/{account.billing_interval === 'annual' ? 'year' : 'month'}</strong></div>
                </div>
                {account.billing_activation_status !== 'active' ? (
                  <div className="billing-cancellation-form">
                    <label>Type {account.company_name} to confirm the first live charge<input className="text-field" onChange={(event) => { setBillingConfirmation(event.target.value); setBillingActivationMessage(''); }} value={billingConfirmation} /></label>
                    <button className="primary-button" disabled={activateBillingMutation.isPending || account.billing_setup_status !== 'succeeded' || !(account.counts?.active_drivers > 0) || billingConfirmation !== account.company_name} onClick={() => activateBillingMutation.mutate({ accountId: account.id, companyName: billingConfirmation })} type="button">{activateBillingMutation.isPending ? 'Activating…' : 'Activate live billing'}</button>
                  </div>
                ) : null}
                {billingActivationMessage ? <p className={activateBillingMutation.isError ? 'support-ticket-save-error' : 'form-success-message'} role="status">{billingActivationMessage}</p> : null}
                {account.billing_setup_status !== 'succeeded' ? <p className="staff-usage-estimate-note">This company must securely save a payment method before billing can be activated.</p> : null}
                {account.billing_setup_status === 'succeeded' && !(account.counts?.active_drivers > 0) ? <p className="staff-usage-estimate-note">Add at least one active driver before billing can be activated.</p> : null}
              </section>

              <section className="staff-simple-section">
                <div className="staff-simple-section-header">
                  <div>
                    <h3>Manager access</h3>
                    <p>Confirm the company manager can activate and use their account.</p>
                  </div>
                </div>
                {managers.length ? (
                  <div className="staff-compact-list">
                    {managers.map((manager) => {
                      const isPending = manager.is_active !== false && !manager.accepted_at;
                      const inviteStatus = managerInviteStatus[manager.id];
                      return (
                        <article key={manager.id}>
                          <div>
                            <strong>{manager.full_name || manager.email}</strong>
                            <span>{manager.email}</span>
                            <span>{isPending ? `Invited ${formatDateTime(manager.invited_at)}` : manager.is_active === false ? 'Deactivated' : 'Active'}</span>
                            {inviteStatus ? <span className={`staff-invite-delivery-status ${inviteStatus.tone}`} role="status">{inviteStatus.message}</span> : null}
                            {inviteStatus?.inviteUrl ? <textarea aria-label={`Invitation link for ${manager.full_name || manager.email}`} readOnly value={inviteStatus.inviteUrl} /> : null}
                          </div>
                          <div className="staff-user-row-badges">
                            <StatusBadge tone={isPending ? 'warning' : manager.is_active === false ? 'urgent' : 'active'}>
                              {isPending ? 'Invite pending' : manager.is_active === false ? 'Inactive' : 'Active'}
                            </StatusBadge>
                            {isPending ? (
                              <button
                                className="secondary-inline-button"
                                disabled={resendManagerInviteMutation.isPending}
                                onClick={() => {
                                  setManagerInviteStatus((current) => ({ ...current, [manager.id]: { tone: 'pending', message: 'Resending invitation…', inviteUrl: '' } }));
                                  resendManagerInviteMutation.mutate({ accountId: account.id, managerId: manager.id });
                                }}
                                type="button"
                              >
                                {resendManagerInviteMutation.isPending && resendManagerInviteMutation.variables?.managerId === manager.id ? 'Resending…' : 'Resend invite'}
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : <EmptyState title="No manager account" description="Add a manager before inviting drivers." variant="inline" />}
              </section>

              <section className="staff-simple-section">
                <div className="staff-simple-section-header">
                  <div>
                    <h3>Driver questions</h3>
                    <p>{formatMonth(driverHelp.month_start)} · newest first</p>
                  </div>
                  <span>{metrics.verified_answers || 0} verified · {metrics.clarifications || 0} clarification turns · {metrics.failed_questions || 0} failed</span>
                </div>
                {interactions.length ? (
                  <div className="staff-question-list">
                    {interactions.slice(0, 50).map((interaction) => {
                      const driver = driverById.get(interaction.driver_id);
                      const interactionFeedback = feedbackByInteraction.get(interaction.id);
                      return (
                        <article className="staff-question-row" key={interaction.id}>
                          <div className="staff-question-copy">
                            <strong>“{interaction.question}”</strong>
                            <span>{driver?.name || driver?.email || 'Unknown driver'} · {formatDateTime(interaction.created_at, true)}</span>
                            {interaction.selected_knowledge_ids?.length ? <span>Knowledge: {interaction.selected_knowledge_ids.join(', ')}</span> : null}
                          </div>
                          <div className="staff-question-result">
                            <StatusBadge tone={responseTone(interaction.response_mode)}>{formatResponseMode(interaction.response_mode)}</StatusBadge>
                            <span>{interactionFeedback?.rating === 'up' ? 'Helpful' : interactionFeedback?.rating === 'down' ? 'Not helpful' : 'Not rated'}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : <EmptyState title="No questions this month" description="Driver questions and answer outcomes will appear here." variant="inline" />}
              </section>

              <section className="staff-simple-section">
                <div className="staff-simple-section-header">
                  <div>
                    <h3>Results by driver</h3>
                    <p>Current-month question volume, verified success, failures, and answer ratings.</p>
                  </div>
                </div>
                {driverMetrics.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr><th>Driver</th><th>Questions</th><th>Verified</th><th>Failed</th><th>Success rate</th><th>Helpful</th><th>Not helpful</th></tr>
                      </thead>
                      <tbody>
                        {driverMetrics.map((driverMetric) => (
                          <tr key={driverMetric.driver_id || driverMetric.driver_name}>
                            <td>{driverMetric.driver_name}</td>
                            <td>{driverMetric.total_questions}</td>
                            <td>{driverMetric.verified_answers}</td>
                            <td>{driverMetric.failed_questions}</td>
                            <td>{formatPercent(driverMetric.success_rate, 'No questions')}</td>
                            <td>{driverMetric.helpful_ratings}</td>
                            <td>{driverMetric.unhelpful_ratings}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <EmptyState title="No driver question activity" description="Per-driver results will appear after drivers ask Ready Route." variant="inline" />}
              </section>

              <div className="staff-detail-grid staff-company-report-grid">
                <section className="staff-simple-section">
                  <h3>Drivers</h3>
                  {drivers.length ? (
                    <div className="staff-compact-list">
                      {drivers.map((driver) => (
                        <article key={driver.id}>
                          <div><strong>{driver.name || driver.email}</strong><span>{driver.email || 'No email recorded'}</span></div>
                          <StatusBadge tone={driver.is_active === false ? 'urgent' : 'active'}>{driver.is_active === false ? 'Inactive' : 'Active'}</StatusBadge>
                        </article>
                      ))}
                    </div>
                  ) : <EmptyState title="No drivers" description="Drivers will appear after the manager adds them." variant="inline" />}
                </section>

                <section className="staff-simple-section">
                  <h3>Monthly email history</h3>
                  <p>The company email uses the same question, helpfulness, and estimated-time data shown above.</p>
                  {monthlyReports.length ? (
                    <div className="staff-compact-list">
                      {monthlyReports.slice(0, 8).map((report) => (
                        <article key={report.id}>
                          <div>
                            <strong>{formatMonth(report.report_month)}</strong>
                            <span>{report.recipient_email}</span>
                            <span>
                              {report.metrics?.total_questions || 0} questions · {report.metrics?.success_rate == null ? 'success not recorded' : `${formatPercent(report.metrics.success_rate)} success`} · {report.metrics?.helpful_ratings || 0} helpful · {report.metrics?.unhelpful_ratings || 0} not helpful
                            </span>
                          </div>
                          <StatusBadge tone={report.delivery_status === 'sent' ? 'active' : report.delivery_status === 'failed' ? 'urgent' : 'warning'}>
                            {report.delivery_status}
                          </StatusBadge>
                        </article>
                      ))}
                    </div>
                  ) : <EmptyState title="No monthly emails sent yet" description="Delivery history will appear after the first report runs." variant="inline" />}
                </section>
              </div>
            </article>
          ) : null}
        </>
      ) : (
        <EmptyState title="No companies yet" description="Select Add company to open the first account." />
      )}
    </section>
  );
}
