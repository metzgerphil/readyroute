import { useQuery } from '@tanstack/react-query';

import api from '../services/api';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export default function KnowledgeActivityPage() {
  const activityQuery = useQuery({
    queryKey: ['driver-help-overview'],
    queryFn: async () => {
      const response = await api.get('/manager/driver-help/overview');
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
              <thead><tr><th>Question</th><th>Result</th><th>Knowledge trace</th><th>Time</th></tr></thead>
              <tbody>
                {interactions.map((row) => (
                  <tr key={row.id}>
                    <td>{row.question}</td>
                    <td>{row.response_mode}</td>
                    <td>{(row.selected_knowledge_ids || []).map((id, index) => `${id} v${row.selected_knowledge_versions?.[index] || 1}`).join(', ') || '—'}</td>
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
