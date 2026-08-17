import { useQuery } from '@tanstack/react-query';

import api from '../services/api';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

function formatPercent(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value) * 100)}%` : '—';
}

export default function KnowledgeActivityPage({ apiBase = '/manager/driver-help' }) {
  const activityQuery = useQuery({
    queryKey: ['driver-help-overview', apiBase],
    queryFn: async () => {
      const response = await api.get(`${apiBase}/overview`);
      return response.data;
    },
    refetchInterval: 60000
  });

  if (activityQuery.isLoading) {
    return <div className="page-card">Loading knowledge activity...</div>;
  }

  if (activityQuery.isError) {
    return <div className="page-card">Knowledge activity could not be loaded.</div>;
  }

  const data = activityQuery.data || {};
  const metrics = data.metrics || {};
  const unanswered = data.unanswered_questions || [];
  const interactions = data.recent_interactions || [];
  const feedback = data.recent_feedback || [];

  return (
    <main className="page knowledge-activity-page">
      <div className="page-heading-row">
        <div>
          <div className="eyebrow">Driver operational help</div>
          <h1>Knowledge Activity</h1>
          <p>Review the latest {data.window_limit || 50} answers, unanswered questions, and driver feedback.</p>
        </div>
      </div>

      {data.setup_required ? (
        <div className="page-card warning-card">
          The driver-help database migration and verified knowledge import must be completed before activity appears.
        </div>
      ) : null}

      <section className="summary-grid">
        <div className="summary-card"><span>Recent questions</span><strong>{metrics.total_questions || 0}</strong></div>
        <div className="summary-card"><span>Approved answers</span><strong>{metrics.approved_answers || 0}</strong></div>
        <div className="summary-card"><span>Clarifications</span><strong>{metrics.clarifications || 0}</strong></div>
        <div className="summary-card"><span>Escalations</span><strong>{metrics.escalations || 0}</strong></div>
        <div className="summary-card"><span>Negative feedback</span><strong>{metrics.negative_feedback || 0}</strong></div>
      </section>

      <section className="page-card">
        <div className="section-heading-row">
          <div>
            <h2>AI shadow testing</h2>
            <p>The AI proposal is measured here but does not control the answer shown to drivers.</p>
          </div>
        </div>
        <div className="summary-grid">
          <div className="summary-card"><span>Shadow runs</span><strong>{metrics.ai_shadow_runs || 0}</strong></div>
          <div className="summary-card"><span>Valid results</span><strong>{metrics.ai_shadow_valid_results || 0}</strong></div>
          <div className="summary-card"><span>Record agreement</span><strong>{formatPercent(metrics.ai_shadow_record_agreement_rate)}</strong></div>
          <div className="summary-card"><span>Answer/clarify agreement</span><strong>{formatPercent(metrics.ai_shadow_response_mode_agreement_rate)}</strong></div>
          <div className="summary-card"><span>AI errors</span><strong>{metrics.ai_shadow_errors || 0}</strong></div>
        </div>
      </section>

      <section className="page-card">
        <div className="section-heading-row">
          <div>
            <h2>Unanswered questions</h2>
            <p>These produced no approved answer and were sent to management.</p>
          </div>
        </div>
        {unanswered.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Question</th><th>Status</th><th>Asked</th></tr></thead>
              <tbody>
                {unanswered.map((row) => (
                  <tr key={row.id}>
                    <td>{row.question}</td>
                    <td><span className="status-pill warning">{row.status}</span></td>
                    <td>{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No unanswered questions yet.</div>}
      </section>

      <section className="page-card">
        <div className="section-heading-row"><div><h2>Recent answer trace</h2><p>Exact knowledge IDs and versions selected for driver responses.</p></div></div>
        {interactions.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Question</th><th>Result</th><th>Knowledge trace</th><th>AI shadow</th><th>Time</th></tr></thead>
              <tbody>
                {interactions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.question}</td>
                    <td>{row.response_mode}</td>
                    <td>{(row.selected_knowledge_ids || []).map((id, index) => `${id} v${row.selected_knowledge_versions?.[index] || 1}`).join(', ') || '—'}</td>
                    <td>{row.interpretation_mode === 'AI_SHADOW'
                      ? `${row.interpretation_result?.proposed_knowledge_id || 'No selection'} · ${row.interpretation_result?.record_agreement ? 'Match' : 'Different'}`
                      : row.interpretation_mode === 'AI_SHADOW_FALLBACK' ? 'No valid result' : '—'}</td>
                    <td>{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No driver-help interactions yet.</div>}
      </section>

      <section className="page-card">
        <div className="section-heading-row"><div><h2>Recent feedback</h2><p>Driver ratings and optional comments for reviewed interactions.</p></div></div>
        {feedback.length ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Rating</th><th>Comment</th><th>Time</th></tr></thead>
              <tbody>
                {feedback.map((row) => (
                  <tr key={row.id}>
                    <td>{row.rating === 'up' ? 'Helpful' : 'Not helpful'}</td>
                    <td>{row.comment || '—'}</td>
                    <td>{formatDate(row.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="empty-state">No driver feedback yet.</div>}
      </section>
    </main>
  );
}
