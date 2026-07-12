import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import api from '../services/api';

function formatDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function formatLabel(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function StaffCompanySupportViewPage() {
  const navigate = useNavigate();
  const { accountId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session') || '';

  const supportViewQuery = useQuery({
    enabled: Boolean(accountId && sessionId),
    queryKey: ['staff-company-support-view', accountId, sessionId],
    queryFn: async () => {
      const response = await api.get(`/staff/accounts/${accountId}/support-view`, {
        params: { session_id: sessionId }
      });
      return response.data || {};
    },
    refetchOnWindowFocus: false
  });

  const endViewMutation = useMutation({
    mutationFn: async () => api.delete(`/staff/accounts/${accountId}/access-sessions/${sessionId}`),
    onSettled: () => navigate('/readyroute/companies', { replace: true })
  });

  if (!accountId || !sessionId) {
    return <ErrorState title="Support View link is incomplete" description="Return to Companies and start a new audited view." />;
  }

  if (supportViewQuery.isLoading) {
    return <LoadingState title="Opening read-only company view" variant="card" />;
  }

  if (supportViewQuery.isError) {
    return (
      <ErrorState
        title="Support View unavailable"
        description={supportViewQuery.error?.response?.data?.error || 'This session may have expired. Return to Companies to start a new one.'}
        onRetry={() => navigate('/readyroute/companies', { replace: true })}
      />
    );
  }

  const data = supportViewQuery.data || {};
  const account = data.account || {};
  const managers = data.managers || [];
  const drivers = data.drivers || [];
  const vehicles = data.vehicles || [];
  const routes = data.routes || [];
  const inspections = data.inspections || [];
  const tickets = data.support_tickets || [];

  return (
    <section className="staff-page staff-company-support-view-page">
      <div className="staff-support-view-banner">
        <div>
          <strong>Read-Only Support View</strong>
          <span>All access is recorded. This session expires {formatDate(data.access_session?.expires_at)}.</span>
        </div>
        <button className="secondary-inline-button" disabled={endViewMutation.isPending} onClick={() => endViewMutation.mutate()} type="button">
          {endViewMutation.isPending ? 'Ending...' : 'Exit Support View'}
        </button>
      </div>

      <PageHeader
        eyebrow="Customer Workspace Snapshot"
        title={account.company_name || 'Company'}
        description={`${account.manager_email || 'No manager email'} · ${formatLabel(account.subscription_status || account.plan || 'No plan')}`}
      />

      <div className="staff-stat-grid">
        <StatCard label="Managers" value={managers.filter((item) => item.is_active !== false).length} />
        <StatCard label="Drivers" value={drivers.filter((item) => item.is_active !== false).length} />
        <StatCard label="Vehicles" value={vehicles.length} />
        <StatCard label="Recent Routes" value={routes.length} />
        <StatCard label="Open Tickets" value={tickets.filter((item) => !['resolved', 'closed'].includes(item.status)).length} />
      </div>

      <div className="staff-support-view-grid">
        <section className="staff-detail-panel staff-detail-panel-wide">
          <h3>Vehicles</h3>
          {vehicles.length ? (
            <div className="staff-support-view-table-wrap">
              <table className="staff-support-view-table">
                <thead><tr><th>Vehicle</th><th>Plate</th><th>Type</th><th>Mileage</th><th>Status</th></tr></thead>
                <tbody>{vehicles.map((vehicle) => (
                  <tr key={vehicle.id}>
                    <td><strong>{vehicle.name}</strong><span>{[vehicle.make, vehicle.model, vehicle.year].filter(Boolean).join(' ') || 'No description'}</span></td>
                    <td>{vehicle.plate || 'Not recorded'}</td>
                    <td>{vehicle.truck_type || 'Not recorded'}</td>
                    <td>{Number(vehicle.current_mileage || 0).toLocaleString()} mi</td>
                    <td><StatusBadge tone={vehicle.is_active === false ? 'neutral' : 'active'}>{vehicle.is_active === false ? 'Inactive' : 'Active'}</StatusBadge></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <EmptyState title="No vehicles" description="This account has no vehicle records." variant="inline" />}
        </section>

        <section className="staff-detail-panel">
          <h3>Recent Routes</h3>
          <div className="staff-compact-list">
            {routes.slice(0, 12).map((route) => (
              <article key={route.id}><strong>{route.work_area_name || 'Route'} · {formatDate(route.date)}</strong><span>{route.completed_stops || 0}/{route.total_stops || 0} stops · {formatLabel(route.status)}</span></article>
            ))}
            {!routes.length ? <EmptyState title="No recent routes" description="No route activity is available." variant="inline" /> : null}
          </div>
        </section>

        <section className="staff-detail-panel">
          <h3>Recent Inspections</h3>
          <div className="staff-compact-list">
            {inspections.slice(0, 12).map((inspection) => (
              <article key={inspection.id}><strong>{formatLabel(inspection.status)} · {formatDate(inspection.inspection_date)}</strong><span>{inspection.issue_reported ? 'Issue reported' : 'No issue reported'} · {formatLabel(inspection.submitted_by_type)}</span></article>
            ))}
            {!inspections.length ? <EmptyState title="No inspections" description="No inspection records are available." variant="inline" /> : null}
          </div>
        </section>

        <section className="staff-detail-panel">
          <h3>Users</h3>
          <div className="staff-compact-list">
            {[...managers.map((item) => ({ ...item, label: item.full_name || item.email, role: 'Manager' })), ...drivers.map((item) => ({ ...item, label: item.name || item.email, role: 'Driver' }))].slice(0, 18).map((user) => (
              <article key={`${user.role}-${user.id}`}><strong>{user.label}</strong><span>{user.role} · {user.is_active === false ? 'Inactive' : 'Active'}</span></article>
            ))}
          </div>
        </section>

        <section className="staff-detail-panel">
          <h3>Support Tickets</h3>
          <div className="staff-compact-list">
            {tickets.slice(0, 12).map((ticket) => (
              <article key={ticket.id}><strong>{ticket.ticket_reference || 'Ticket'} · {formatLabel(ticket.status)}</strong><span>{ticket.subject || formatLabel(ticket.category)}</span></article>
            ))}
            {!tickets.length ? <EmptyState title="No tickets" description="No support tickets are linked to this company." variant="inline" /> : null}
          </div>
        </section>
      </div>
    </section>
  );
}
