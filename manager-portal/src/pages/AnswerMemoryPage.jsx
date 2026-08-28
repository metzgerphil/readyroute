import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';

const TABS = [
  { value: 'QUEUE', label: 'Review queue' },
  { value: 'ROUTES', label: 'Learned routes' },
  { value: 'PERFORMANCE', label: 'Activity & performance' },
  { value: 'AUDIT', label: 'Audit trail' }
];
const ROUTE_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'REVIEW_REQUIRED', label: 'Needs review' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'CANDIDATE', label: 'Learning' },
  { value: 'SUSPENDED', label: 'Suspended' }
];
const STATUS_META = {
  ACTIVE: { label: 'Active', tone: 'ready' },
  CANDIDATE: { label: 'Learning', tone: 'neutral' },
  REVIEW_REQUIRED: { label: 'Needs review', tone: 'warning' },
  SUSPENDED: { label: 'Suspended', tone: 'danger' }
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function formatKnowledgeId(value) {
  return String(value || 'Unknown record').replace(/^KNO-/, '').replaceAll('-', ' · ');
}

function formatLatency(value) {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return '—';
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(1)}s` : `${Math.round(milliseconds)}ms`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(amount < 1 ? 4 : 2)}`;
}

function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', tone: 'neutral' };
}

function auditMethod(interaction) {
  if (interaction.interpretation_mode === 'LEARNED_ROUTE') return 'LEARNED';
  if (['GROUNDED_AI', 'AI_SHADOW', 'AI_SHADOW_FALLBACK', 'DETERMINISTIC_FALLBACK'].includes(interaction.interpretation_mode)) return 'AI';
  return 'DETERMINISTIC';
}

function auditMethodLabel(interaction) {
  const method = auditMethod(interaction);
  if (method === 'LEARNED') return 'Learned route';
  if (method === 'AI') return 'Grounded AI';
  return 'Published rule';
}

function routeMatches(route, search, companyId) {
  if (companyId && !(route.company_usage || []).some((company) => company.account_id === companyId)) return false;
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [route.latest_question, route.knowledge_id, route.review_reason, ...(route.company_usage || []).map((company) => company.company_name)]
    .some((value) => String(value || '').toLowerCase().includes(term));
}

function QuestionPreview({ preview }) {
  const steps = preview?.answer_structure?.steps || [];
  const watchFor = preview?.answer_structure?.watch_for || preview?.answer_structure?.prohibited_actions?.[0] || null;
  if (!preview) return <p className="answer-quality-muted">Preview unavailable. Keep this route suspended until its published behavior can be loaded.</p>;
  return (
    <div className="answer-quality-driver-preview">
      <span className="eyebrow">What the driver receives</span>
      <h4>{preview.response_mode === 'CLARIFY' ? 'Clarification' : 'Published answer'}</h4>
      {preview.clarification_prompt ? <p className="answer-quality-answer">{preview.clarification_prompt}</p> : null}
      {preview.clarification_options?.length ? <div className="answer-memory-preview-options">{preview.clarification_options.map((option) => <span key={`${option.label}-${option.query}`}>{option.label}</span>)}</div> : null}
      {preview.answer ? <p className="answer-quality-answer">{preview.answer}</p> : null}
      {steps.length ? <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
      {watchFor ? <p className="answer-memory-preview-watch"><strong>Watch for:</strong> {watchFor}</p> : null}
      {preview.more_info ? <details><summary>More information</summary><p>{preview.more_info}</p></details> : null}
    </div>
  );
}

function CompanyUsage({ route }) {
  const companies = route.company_usage || [];
  if (!companies.length) return <p className="answer-quality-muted">No retained company activity is available for this route.</p>;
  return (
    <div className="answer-quality-company-list">
      {companies.map((company) => (
        <div key={company.account_id}>
          <Link to={`/readyroute/companies/${company.account_id}/view`}>{company.company_name}</Link>
          <span>{company.question_count} question{company.question_count === 1 ? '' : 's'} · latest {formatDate(company.latest_seen_at)}</span>
        </div>
      ))}
    </div>
  );
}

function RouteCard({ route, expanded, isUpdating, onToggle, onReview }) {
  const meta = statusMeta(route.status);
  const remaining = Math.max(Number(route.required_agreements || 0) - Number(route.agreement_count || 0), 0);
  const latestCompany = (route.company_usage || []).find((company) => company.account_id === route.latest_company_id)
    || route.company_usage?.[0];
  return (
    <article className={`answer-quality-route-card ${meta.tone}`}>
      <div className="answer-quality-route-main">
        <div className="answer-quality-route-copy">
          <div className="answer-quality-route-topline"><span className={`answer-memory-status ${meta.tone}`}>{meta.label}</span><span>{route.risk_tier === 'HIGH' ? 'High-risk topic' : 'Standard topic'}</span></div>
          <h3>{route.latest_question ? `“${route.latest_question}”` : formatKnowledgeId(route.knowledge_id)}</h3>
          <p className="answer-quality-reason">{route.review_reason}</p>
          <div className="answer-quality-route-facts">
            <span><strong>Approved record:</strong> {formatKnowledgeId(route.knowledge_id)}</span>
            <span><strong>Company activity:</strong> {route.company_count || 0} compan{route.company_count === 1 ? 'y' : 'ies'} · {route.recent_question_count || 0} retained question{route.recent_question_count === 1 ? '' : 's'}</span>
            {route.latest_company_name ? <span><strong>Most recent company:</strong> {route.latest_company_name}</span> : null}
            <span><strong>Confirmation:</strong> {remaining > 0 ? `${route.agreement_count || 0} of ${route.required_agreements}` : 'Requirement met'}</span>
          </div>
        </div>
        <div className="answer-quality-route-actions">
          <button className="secondary-button" onClick={onToggle} type="button">{expanded ? 'Close review' : 'Review issue'}</button>
          {route.status !== 'ACTIVE' ? <button className="primary-button" disabled={isUpdating || !route.preview || !route.ready_for_approval} onClick={() => onReview(route.route_key, 'APPROVE')} type="button">{isUpdating ? 'Saving…' : !route.ready_for_approval ? `Needs ${remaining} more` : route.status === 'SUSPENDED' ? 'Reactivate route' : 'Approve route'}</button> : null}
          {route.status !== 'SUSPENDED' ? <button className="text-button answer-quality-suspend" disabled={isUpdating} onClick={() => onReview(route.route_key, 'SUSPEND')} type="button">Suspend route</button> : null}
          {latestCompany ? <Link className="answer-quality-company-link" to={`/readyroute/companies/${latestCompany.account_id}/view`}>Open company</Link> : null}
        </div>
      </div>
      {expanded ? (
        <div className="answer-quality-review-panel">
          <QuestionPreview preview={route.preview} />
          <div className="answer-quality-review-context">
            <section><h4>Company usage · last {route.company_window_days || 90} days</h4><CompanyUsage route={route} /></section>
            <section><h4>Review evidence</h4><dl className="answer-quality-evidence"><div><dt>Matching confirmations</dt><dd>{route.agreement_count || 0}</dd></div><div><dt>Conflicting interpretations</dt><dd>{route.disagreement_count || 0}</dd></div><div><dt>Audits passed</dt><dd>{route.audit_agreement_count || 0}</dd></div><div><dt>Audit disagreements</dt><dd>{route.audit_disagreement_count || 0}</dd></div><div><dt>Negative feedback</dt><dd>{route.negative_feedback_count || 0}</dd></div><div><dt>AI calls avoided</dt><dd>{route.reuse_count || 0}</dd></div></dl></section>
            <details className="answer-quality-technical"><summary>Technical details</summary><dl><div><dt>Route ID</dt><dd>{route.route_key}</dd></div><div><dt>Knowledge ID</dt><dd>{route.knowledge_id} · version {route.knowledge_version}</dd></div><div><dt>Last seen</dt><dd>{formatDate(route.last_seen_at)}</dd></div></dl></details>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SimpleIssueCard({ eyebrow, companyName, question, detail, date, accountId }) {
  return (
    <article className="answer-quality-simple-issue">
      <div><span className="eyebrow">{eyebrow}</span><h3>{question ? `“${question}”` : detail}</h3>{question && detail ? <p>{detail}</p> : null}<span className="answer-quality-muted">{companyName || 'Unknown company'} · {formatDate(date)}</span></div>
      {accountId ? <Link className="secondary-button" to={`/readyroute/companies/${accountId}/view`}>Open company</Link> : null}
    </article>
  );
}

function AuditInteraction({ interaction, feedback }) {
  const knowledgeIds = interaction.selected_knowledge_ids || [];
  const versions = interaction.selected_knowledge_versions || [];
  const occurrenceCount = interaction.occurrence_count || 1;
  return (
    <details className="answer-quality-audit-row">
      <summary>
        <div className="answer-quality-audit-question">
          <strong>{interaction.question ? `“${interaction.question}”` : 'Retained question unavailable'}</strong>
          <span>{interaction.company_name || 'Unknown company'}{occurrenceCount > 1 ? ` · ${occurrenceCount} similar occurrences` : ''}</span>
        </div>
        <div className="answer-quality-audit-badges">
          <span className={`answer-quality-result ${String(interaction.response_mode || '').toLowerCase()}`}>{interaction.response_mode || 'Unknown'}</span>
          <span>{auditMethodLabel(interaction)}</span>
          {feedback ? <span className={feedback.rating === 'down' ? 'negative' : 'helpful'}>{feedback.rating === 'down' ? 'Not helpful' : 'Helpful'}</span> : null}
        </div>
        <time>{formatDate(interaction.created_at)}</time>
      </summary>
      <div className="answer-quality-audit-details">
        <section>
          <span className="eyebrow">Answer delivered</span>
          <p>{interaction.answer_snapshot || interaction.escalation_message || (interaction.response_mode === 'CLARIFY' ? 'ReadyRoute asked the driver for a clarification.' : 'No retained answer snapshot.')}</p>
          {feedback ? <p className={feedback.rating === 'down' ? 'answer-quality-feedback-negative' : 'answer-quality-feedback-helpful'}><strong>Feedback:</strong> {feedback.comment || (feedback.rating === 'down' ? 'Marked not helpful.' : 'Marked helpful.')}</p> : null}
        </section>
        <section>
          <span className="eyebrow">Approved knowledge</span>
          {knowledgeIds.length ? <ul>{knowledgeIds.map((id, index) => <li key={id}><strong>{formatKnowledgeId(id)}</strong> · version {versions[index] || 1}</li>)}</ul> : <p>No approved record was selected.</p>}
          <p className="answer-quality-muted">{interaction.company_name || 'Unknown company'} · {formatLatency(interaction.response_latency_ms)}</p>
          {interaction.account_id ? <Link to={`/readyroute/companies/${interaction.account_id}/view`}>Open company</Link> : null}
        </section>
        <details className="answer-quality-technical">
          <summary>Technical trace</summary>
          <dl>
            <div><dt>Interaction ID</dt><dd>{interaction.id}</dd></div>
            <div><dt>Interpretation mode</dt><dd>{interaction.interpretation_mode || 'DETERMINISTIC'}</dd></div>
            <div><dt>Knowledge IDs</dt><dd>{knowledgeIds.join(', ') || 'None'}</dd></div>
            {interaction.interpretation_result?.confidence != null ? <div><dt>AI confidence</dt><dd>{Math.round(Number(interaction.interpretation_result.confidence) * 100)}%</dd></div> : null}
          </dl>
        </details>
      </div>
    </details>
  );
}

export default function AnswerMemoryPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = String(searchParams.get('tab') || '').toUpperCase();
  const [activeTab, setActiveTab] = useState(TABS.some((tab) => tab.value === requestedTab) ? requestedTab : 'QUEUE');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [actionError, setActionError] = useState('');
  const [expandedRouteKey, setExpandedRouteKey] = useState(null);
  const [auditOutcome, setAuditOutcome] = useState('ALL');
  const [auditMethodFilter, setAuditMethodFilter] = useState('ALL');
  const [auditFeedback, setAuditFeedback] = useState('ALL');
  const [groupRepeated, setGroupRepeated] = useState(true);
  const memoryQuery = useQuery({ queryKey: ['driver-help-answer-memory'], queryFn: async () => (await api.get('/staff/driver-help/answer-memory', { params: { limit: 250 } })).data, refetchInterval: 60000 });
  const overviewQuery = useQuery({ queryKey: ['global-driver-help-overview'], queryFn: async () => (await api.get('/staff/driver-help/overview', { params: { limit: 150, days: 30 } })).data, refetchInterval: 60000 });
  const reviewMutation = useMutation({
    mutationFn: async ({ routeKey, action }) => (await api.post(`/staff/driver-help/answer-memory/${encodeURIComponent(routeKey)}/review`, { action })).data,
    onMutate: () => setActionError(''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['driver-help-answer-memory'] }),
    onError: (error) => setActionError(error.response?.data?.error || 'That learned route could not be updated.')
  });
  const routes = useMemo(() => memoryQuery.data?.routes || [], [memoryQuery.data?.routes]);
  const overview = overviewQuery.data || {};
  const metrics = overview.metrics || {};
  const recentInteractions = overview.recent_interactions || [];
  const unansweredQuestions = (overview.unanswered_questions || []).filter((entry) => ['open', 'reviewing'].includes(entry.status));
  const negativeFeedback = (overview.recent_feedback || []).filter((entry) => entry.rating === 'down');
  const reviewRoutes = routes.filter((route) => ['REVIEW_REQUIRED', 'SUSPENDED'].includes(route.status));
  const counts = useMemo(() => routes.reduce((result, route) => { result[route.status] = (result[route.status] || 0) + 1; return result; }, {}), [routes]);
  const companies = (() => {
    const byId = new Map();
    routes.forEach((route) => (route.company_usage || []).forEach((company) => byId.set(company.account_id, company.company_name)));
    recentInteractions.forEach((entry) => byId.set(entry.account_id, entry.company_name));
    return Array.from(byId, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name));
  })();
  const visibleRoutes = routes.filter((route) => (statusFilter === 'ALL' || route.status === statusFilter) && routeMatches(route, search, companyFilter));
  const visibleReviewRoutes = reviewRoutes.filter((route) => routeMatches(route, search, companyFilter));
  const issueMatches = (entry) => {
    if (companyFilter && entry.account_id !== companyFilter) return false;
    const term = search.trim().toLowerCase();
    return !term || [entry.question, entry.comment, entry.company_name, entry.status].some((value) => String(value || '').toLowerCase().includes(term));
  };
  const visibleUnanswered = unansweredQuestions.filter(issueMatches);
  const visibleNegativeFeedback = negativeFeedback.filter(issueMatches);
  const queueCount = reviewRoutes.length + unansweredQuestions.length + negativeFeedback.length;
  const feedbackByInteraction = new Map((overview.recent_feedback || []).map((entry) => [entry.interaction_id, entry]));
  const auditInteractions = recentInteractions.filter((entry) => {
    if (companyFilter && entry.account_id !== companyFilter) return false;
    if (auditOutcome !== 'ALL' && entry.response_mode !== auditOutcome) return false;
    if (auditMethodFilter !== 'ALL' && auditMethod(entry) !== auditMethodFilter) return false;
    const feedback = feedbackByInteraction.get(entry.id);
    if (auditFeedback === 'NEGATIVE' && feedback?.rating !== 'down') return false;
    if (auditFeedback === 'HELPFUL' && feedback?.rating !== 'up') return false;
    if (auditFeedback === 'NONE' && feedback) return false;
    const term = search.trim().toLowerCase();
    return !term || [entry.question, entry.company_name, entry.answer_snapshot, ...(entry.selected_knowledge_ids || [])]
      .some((value) => String(value || '').toLowerCase().includes(term));
  });
  const visibleAuditInteractions = groupRepeated
    ? Array.from(auditInteractions.reduce((grouped, entry) => {
      const key = [String(entry.question || '').trim().toLowerCase(), entry.response_mode, ...(entry.selected_knowledge_ids || [])].join('|');
      const existing = grouped.get(key);
      if (existing) existing.occurrence_count += 1;
      else grouped.set(key, { ...entry, occurrence_count: 1 });
      return grouped;
    }, new Map()).values())
    : auditInteractions;
  const groundedAiCount = recentInteractions.filter((entry) => auditMethod(entry) === 'AI').length;
  const learnedCount = recentInteractions.filter((entry) => auditMethod(entry) === 'LEARNED').length;
  const auditDisagreements = routes.reduce((sum, route) => sum + Number(route.audit_disagreement_count || 0), 0);
  const auditErrors = routes.reduce((sum, route) => sum + Number(route.audit_error_count || 0), 0);

  if (memoryQuery.isLoading || overviewQuery.isLoading) return <div className="page-card">Loading answer quality…</div>;
  if (memoryQuery.isError || overviewQuery.isError) return <div className="page-card">Answer quality activity could not be loaded.</div>;
  const handleReview = (routeKey, action) => reviewMutation.mutate({ routeKey, action });
  const selectTab = (value) => {
    setActiveTab(value);
    setSearchParams({ tab: value.toLowerCase() }, { replace: true });
  };

  return (
    <main className="page answer-memory-page answer-quality-page">
      <div className="page-heading-row answer-quality-heading">
        <div><div className="eyebrow">Ready Route Answers</div><h1>Answer Quality</h1><p>Review questions needing attention, manage learned routes, measure performance, and inspect the answer audit trail.</p></div>
        <div className="answer-quality-refresh"><span>Updates automatically every minute</span><button className="secondary-button" disabled={memoryQuery.isFetching || overviewQuery.isFetching} onClick={() => { memoryQuery.refetch(); overviewQuery.refetch(); }} type="button">{memoryQuery.isFetching || overviewQuery.isFetching ? 'Refreshing…' : 'Refresh now'}</button></div>
      </div>
      <section className="answer-quality-priority-grid" aria-label="Answer quality summary">
        <button className="answer-quality-priority-card danger" onClick={() => selectTab('QUEUE')} type="button"><span>Needs staff attention</span><strong>{queueCount}</strong><small>Open the review queue</small></button>
        <button className="answer-quality-priority-card warning" onClick={() => { selectTab('ROUTES'); setStatusFilter('SUSPENDED'); }} type="button"><span>Suspended routes</span><strong>{counts.SUSPENDED || 0}</strong><small>Not being reused</small></button>
        <button className="answer-quality-priority-card neutral" onClick={() => { selectTab('ROUTES'); setStatusFilter('CANDIDATE'); }} type="button"><span>Still learning</span><strong>{counts.CANDIDATE || 0}</strong><small>Collecting confirmations</small></button>
        <button className="answer-quality-priority-card ready" onClick={() => { selectTab('ROUTES'); setStatusFilter('ACTIVE'); }} type="button"><span>Healthy active routes</span><strong>{counts.ACTIVE || 0}</strong><small>Available for reuse</small></button>
      </section>
      <nav className="answer-quality-tabs" aria-label="Answer Quality sections">{TABS.map((tab) => <button className={activeTab === tab.value ? 'active' : ''} key={tab.value} onClick={() => selectTab(tab.value)} type="button">{tab.label}{tab.value === 'QUEUE' ? ` (${queueCount})` : ''}</button>)}</nav>
      {activeTab !== 'PERFORMANCE' ? <section className="answer-quality-toolbar"><label><span>Search</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Question, company, or approved record" type="search" value={search} /></label><label><span>Company</span><select onChange={(event) => setCompanyFilter(event.target.value)} value={companyFilter}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label></section> : null}
      {actionError ? <div className="answer-memory-action-error" role="alert">{actionError}</div> : null}
      {memoryQuery.data?.setup_required ? <div className="page-card warning-card">Answer Memory still needs to be enabled for this workspace.</div> : null}

      {activeTab === 'QUEUE' ? (
        <div className="answer-quality-section-stack">
          <section><div className="answer-quality-section-heading"><div><h2>Learned routes needing review</h2><p>These routes are suspended or require an explicit ReadyRoute decision.</p></div><strong>{visibleReviewRoutes.length}</strong></div><div className="answer-quality-route-list">{visibleReviewRoutes.map((route) => <RouteCard expanded={expandedRouteKey === route.route_key} isUpdating={reviewMutation.isPending && reviewMutation.variables?.routeKey === route.route_key} key={route.route_key} onReview={handleReview} onToggle={() => setExpandedRouteKey(expandedRouteKey === route.route_key ? null : route.route_key)} route={route} />)}{!visibleReviewRoutes.length ? <div className="empty-state">No learned routes match this review view.</div> : null}</div></section>
          <section><div className="answer-quality-section-heading"><div><h2>Unanswered questions</h2><p>These may require a new approved knowledge answer.</p></div><strong>{visibleUnanswered.length}</strong></div><div className="answer-quality-simple-list">{visibleUnanswered.map((entry) => <SimpleIssueCard accountId={entry.account_id} companyName={entry.company_name} date={entry.created_at} detail={`Status: ${entry.status}`} eyebrow="Knowledge gap" key={entry.id} question={entry.question} />)}{!visibleUnanswered.length ? <div className="empty-state">No unanswered questions match this view.</div> : null}</div></section>
          <section><div className="answer-quality-section-heading"><div><h2>Negative feedback</h2><p>Review the answer and company context before reactivating any affected route.</p></div><strong>{visibleNegativeFeedback.length}</strong></div><div className="answer-quality-simple-list">{visibleNegativeFeedback.map((entry) => <SimpleIssueCard accountId={entry.account_id} companyName={entry.company_name} date={entry.created_at} detail={entry.comment || 'The driver or manager marked this answer as not helpful.'} eyebrow="Answer improvement" key={entry.id} question={entry.question} />)}{!visibleNegativeFeedback.length ? <div className="empty-state">No negative feedback matches this view.</div> : null}</div></section>
        </div>
      ) : null}

      {activeTab === 'ROUTES' ? <section><div className="answer-memory-filters answer-quality-route-filters" aria-label="Filter learned routes by status">{ROUTE_FILTERS.map((filter) => <button className={`answer-memory-filter${statusFilter === filter.value ? ' active' : ''}`} key={filter.value} onClick={() => setStatusFilter(filter.value)} type="button">{filter.label} ({filter.value === 'ALL' ? routes.length : counts[filter.value] || 0})</button>)}</div><div className="answer-quality-route-list">{visibleRoutes.map((route) => <RouteCard expanded={expandedRouteKey === route.route_key} isUpdating={reviewMutation.isPending && reviewMutation.variables?.routeKey === route.route_key} key={route.route_key} onReview={handleReview} onToggle={() => setExpandedRouteKey(expandedRouteKey === route.route_key ? null : route.route_key)} route={route} />)}{!visibleRoutes.length ? <div className="empty-state">No learned routes match these filters.</div> : null}</div><details className="page-card answer-quality-how-it-works"><summary>How learned routes work</summary><p>Active routes can reuse a published answer for eligible repeated wording. Standard routes require matching AI confirmations; clarifications and high-risk routes require additional confirmation, and high-risk routes require staff approval. A disagreement or negative feedback suspends reuse until staff review it.</p></details></section> : null}

      {activeTab === 'PERFORMANCE' ? (
        <div className="answer-quality-section-stack">
          <section className="page-card"><div className="answer-quality-section-heading"><div><h2>Last 30 days</h2><p>Usage, cost, and response speed across ReadyRoute.</p></div></div><div className="summary-grid"><div className="summary-card"><span>Questions</span><strong>{metrics.total_questions || 0}</strong></div><div className="summary-card"><span>Companies</span><strong>{metrics.companies || 0}</strong></div><div className="summary-card"><span>AI calls avoided</span><strong>{metrics.ai_calls_avoided || 0}</strong></div><div className="summary-card"><span>Estimated AI cost</span><strong>{formatMoney(metrics.estimated_ai_cost_usd)}</strong></div></div></section>
          <section className="page-card"><div className="answer-quality-section-heading"><div><h2>Response speed</h2><p>Learned routes can answer eligible repeated wording without another AI interpretation.</p></div></div><div className="summary-grid"><div className="summary-card"><span>Average response</span><strong>{formatLatency(metrics.average_response_latency_ms)}</strong></div><div className="summary-card"><span>95% answered within</span><strong>{formatLatency(metrics.p95_response_latency_ms)}</strong></div><div className="summary-card"><span>New AI wording</span><strong>{formatLatency(metrics.average_ai_response_latency_ms)}</strong></div><div className="summary-card"><span>Learned wording</span><strong>{formatLatency(metrics.average_learned_response_latency_ms)}</strong></div></div></section>
        </div>
      ) : null}

      {activeTab === 'AUDIT' ? (
        <div className="answer-quality-section-stack">
          <section className="page-card">
            <div className="answer-quality-section-heading"><div><h2>Answer delivery overview</h2><p>How recent driver questions were resolved. Detailed system identifiers remain hidden until expanded.</p></div></div>
            <div className="summary-grid answer-quality-audit-summary"><div className="summary-card"><span>Grounded AI</span><strong>{groundedAiCount}</strong></div><div className="summary-card"><span>Learned routes</span><strong>{learnedCount}</strong></div><div className="summary-card"><span>Escalations</span><strong>{metrics.escalations || 0}</strong></div><div className="summary-card"><span>Audit disagreements</span><strong>{auditDisagreements}</strong></div><div className="summary-card"><span>Audit errors</span><strong>{auditErrors}</strong></div></div>
          </section>
          <section>
            <div className="answer-quality-audit-controls">
              <label><span>Outcome</span><select onChange={(event) => setAuditOutcome(event.target.value)} value={auditOutcome}><option value="ALL">All outcomes</option><option value="ANSWER">Answered</option><option value="CLARIFY">Clarification</option><option value="ESCALATE">Escalated</option></select></label>
              <label><span>Answer method</span><select onChange={(event) => setAuditMethodFilter(event.target.value)} value={auditMethodFilter}><option value="ALL">All methods</option><option value="AI">Grounded AI</option><option value="LEARNED">Learned route</option><option value="DETERMINISTIC">Published rule</option></select></label>
              <label><span>Feedback</span><select onChange={(event) => setAuditFeedback(event.target.value)} value={auditFeedback}><option value="ALL">All feedback</option><option value="NEGATIVE">Not helpful</option><option value="HELPFUL">Helpful</option><option value="NONE">No feedback</option></select></label>
              <label className="answer-quality-group-toggle"><input checked={groupRepeated} onChange={(event) => setGroupRepeated(event.target.checked)} type="checkbox" /><span>Group repeated questions</span></label>
            </div>
            <div className="answer-quality-section-heading"><div><h2>Recent answer trail</h2><p>Open an entry to see the delivered answer, approved knowledge, and technical trace.</p></div><strong>{visibleAuditInteractions.length}</strong></div>
            <div className="answer-quality-audit-list">{visibleAuditInteractions.map((interaction) => <AuditInteraction feedback={feedbackByInteraction.get(interaction.id)} interaction={interaction} key={interaction.id} />)}{!visibleAuditInteractions.length ? <div className="empty-state">No answer activity matches these filters.</div> : null}</div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
