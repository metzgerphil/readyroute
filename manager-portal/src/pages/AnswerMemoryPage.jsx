import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useMemo, useState } from 'react';

import api from '../services/api';

const FILTERS = [
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

function statusMeta(status) {
  return STATUS_META[status] || { label: status || 'Unknown', tone: 'neutral' };
}

export default function AnswerMemoryPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState('');
  const [expandedRouteKey, setExpandedRouteKey] = useState(null);

  const memoryQuery = useQuery({
    queryKey: ['driver-help-answer-memory'],
    queryFn: async () => {
      const response = await api.get('/staff/driver-help/answer-memory', { params: { limit: 250 } });
      return response.data;
    },
    refetchInterval: 60000
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ routeKey, action }) => {
      const response = await api.post(
        `/staff/driver-help/answer-memory/${encodeURIComponent(routeKey)}/review`,
        { action }
      );
      return response.data;
    },
    onMutate: () => setActionError(''),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['driver-help-answer-memory'] }),
    onError: (error) => setActionError(error.response?.data?.error || 'That memory route could not be updated.')
  });

  const routes = useMemo(() => memoryQuery.data?.routes || [], [memoryQuery.data?.routes]);
  const counts = useMemo(() => routes.reduce((result, route) => {
    result[route.status] = (result[route.status] || 0) + 1;
    return result;
  }, {}), [routes]);

  const visibleRoutes = useMemo(() => {
    const term = search.trim().toLowerCase();
    return routes.filter((route) => {
      if (statusFilter !== 'ALL' && route.status !== statusFilter) return false;
      if (!term) return true;
      return [route.normalized_question, route.knowledge_id, route.response_mode]
        .some((value) => String(value || '').toLowerCase().includes(term));
    });
  }, [routes, search, statusFilter]);

  if (memoryQuery.isLoading) {
    return <div className="page-card">Loading Answer Memory...</div>;
  }

  if (memoryQuery.isError) {
    return <div className="page-card">Answer Memory could not be loaded.</div>;
  }

  return (
    <main className="page answer-memory-page">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Ready Route Answers</div>
          <h1>Answer Memory</h1>
          <p>Review the question routes RRA has learned so repeated questions can use approved answers without another AI interpretation.</p>
        </div>
        <button className="secondary-button" disabled={memoryQuery.isFetching} onClick={() => memoryQuery.refetch()} type="button">
          {memoryQuery.isFetching ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {memoryQuery.data?.setup_required ? (
        <div className="page-card warning-card">Answer Memory still needs to be enabled for this workspace.</div>
      ) : null}

      <section className="summary-grid answer-memory-summary">
        <div className="summary-card"><span>Remembered questions</span><strong>{routes.length}</strong></div>
        <div className="summary-card"><span>Active</span><strong>{counts.ACTIVE || 0}</strong></div>
        <div className="summary-card"><span>Needs review</span><strong>{counts.REVIEW_REQUIRED || 0}</strong></div>
        <div className="summary-card"><span>Still learning</span><strong>{counts.CANDIDATE || 0}</strong></div>
        <div className="summary-card"><span>Suspended</span><strong>{counts.SUSPENDED || 0}</strong></div>
      </section>

      <section className="page-card answer-memory-guidance">
        <h2>How it works</h2>
        <p><strong>Active</strong> routes can bypass AI for that same question. Direct standard answers require three matching AI confirmations. Clarifications and high-risk routes require five; high-risk routes also require manager approval. RRA continues checking about 5% of remembered answers with AI. Any disagreement or negative feedback suspends the route.</p>
      </section>

      <section className="page-card">
        <div className="answer-memory-toolbar">
          <div className="answer-memory-filters" aria-label="Filter Answer Memory by status">
            {FILTERS.map((filter) => (
              <button
                className={`answer-memory-filter${statusFilter === filter.value ? ' active' : ''}`}
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                type="button"
              >
                {filter.label}{filter.value === 'ALL' ? ` (${routes.length})` : ` (${counts[filter.value] || 0})`}
              </button>
            ))}
          </div>
          <label className="answer-memory-search">
            <span>Find a question</span>
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search questions or knowledge records"
              type="search"
              value={search}
            />
          </label>
        </div>

        {actionError ? <div className="answer-memory-action-error" role="alert">{actionError}</div> : null}

        {visibleRoutes.length ? (
          <div className="table-wrap answer-memory-table-wrap">
            <table className="answer-memory-table">
              <thead>
                <tr><th>Driver question</th><th>Approved answer route</th><th>Status</th><th>Evidence</th><th>Last seen</th><th>Action</th></tr>
              </thead>
              <tbody>
                {visibleRoutes.map((route) => {
                  const meta = statusMeta(route.status);
                  const isUpdating = reviewMutation.isPending && reviewMutation.variables?.routeKey === route.route_key;
                  const isExpanded = expandedRouteKey === route.route_key;
                  const preview = route.preview;
                  const previewSteps = preview?.answer_structure?.steps || [];
                  const previewWatchFor = preview?.answer_structure?.watch_for
                    || preview?.answer_structure?.prohibited_actions?.[0]
                    || null;
                  return (
                    <Fragment key={route.route_key}>
                      <tr>
                        <td><strong>{route.normalized_question}</strong><small>{route.response_mode === 'CLARIFY' ? 'Asks a clarification' : 'Gives an answer'} · {route.risk_tier === 'HIGH' ? 'High-risk topic' : 'Standard topic'}</small></td>
                        <td><strong>{formatKnowledgeId(route.knowledge_id)}</strong><small>{route.knowledge_id} · version {route.knowledge_version}</small></td>
                        <td><span className={`answer-memory-status ${meta.tone}`}>{meta.label}</span></td>
                        <td>
                          <strong>{route.agreement_count || 0} of {route.required_agreements || (route.response_mode === 'CLARIFY' || route.risk_tier === 'HIGH' ? 5 : 3)} confirmations</strong>
                          <small>{route.reuse_count || 0} AI calls avoided · {route.audit_agreement_count || 0} audits passed · {route.audit_disagreement_count || 0} audit disagreements</small>
                          {route.audit_error_count ? <small>{route.audit_error_count} audit provider errors · last audit {formatDate(route.last_audited_at)}</small> : null}
                        </td>
                        <td>{formatDate(route.last_seen_at)}</td>
                        <td>
                          <div className="answer-memory-actions">
                            <button
                              className="secondary-button"
                              onClick={() => setExpandedRouteKey(isExpanded ? null : route.route_key)}
                              type="button"
                            >
                              {isExpanded ? 'Hide behavior' : 'Preview behavior'}
                            </button>
                            {route.status !== 'ACTIVE' ? (
                              <button
                                className="primary-button"
                                disabled={isUpdating || !preview || !route.ready_for_approval}
                                onClick={() => reviewMutation.mutate({ routeKey: route.route_key, action: 'APPROVE' })}
                                type="button"
                              >
                                {isUpdating
                                  ? 'Saving…'
                                  : !route.ready_for_approval
                                    ? `Needs ${(route.required_agreements || 5) - (route.agreement_count || 0)} more`
                                    : route.status === 'SUSPENDED' ? 'Reactivate' : 'Approve'}
                              </button>
                            ) : null}
                            {route.status !== 'SUSPENDED' ? (
                              <button
                                className="secondary-button"
                                disabled={isUpdating}
                                onClick={() => reviewMutation.mutate({ routeKey: route.route_key, action: 'SUSPEND' })}
                                type="button"
                              >
                                Suspend
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr className="answer-memory-preview-row">
                          <td colSpan="6">
                            <div className="answer-memory-preview">
                              <div className="answer-memory-preview-heading">
                                <div>
                                  <span className="eyebrow">What the driver will receive</span>
                                  <h3>{preview?.response_mode === 'CLARIFY' ? 'Clarification' : 'Published answer'}</h3>
                                </div>
                                <span className={`answer-memory-status ${route.risk_tier === 'HIGH' ? 'warning' : 'neutral'}`}>{route.risk_tier === 'HIGH' ? 'Manager approval required' : 'Standard route'}</span>
                              </div>
                              {!preview ? <p>Preview unavailable. Do not approve this route until its published behavior can be loaded.</p> : null}
                              {preview?.clarification_prompt ? <p className="answer-memory-preview-answer">{preview.clarification_prompt}</p> : null}
                              {preview?.clarification_options?.length ? (
                                <div>
                                  <strong>Choices shown to the driver</strong>
                                  <div className="answer-memory-preview-options">
                                    {preview.clarification_options.map((option) => <span key={`${option.label}-${option.query}`}>{option.label}</span>)}
                                  </div>
                                </div>
                              ) : null}
                              {preview?.answer ? <p className="answer-memory-preview-answer">{preview.answer}</p> : null}
                              {previewSteps.length ? (
                                <div>
                                  <strong>Do this</strong>
                                  <ol>{previewSteps.map((step) => <li key={step}>{step}</li>)}</ol>
                                </div>
                              ) : null}
                              {previewWatchFor ? <p className="answer-memory-preview-watch"><strong>Watch for:</strong> {previewWatchFor}</p> : null}
                              {preview?.more_info ? <details><summary>More Info</summary><p>{preview.more_info}</p></details> : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">No Answer Memory routes match this view yet.</div>
        )}
      </section>
    </main>
  );
}
