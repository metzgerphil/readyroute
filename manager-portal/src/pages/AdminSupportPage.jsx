import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, PageHeader, StatCard, StatusBadge } from '../components/PortalDesignSystem';
import api from '../services/api';

const STATUS_OPTIONS = [
  { value: '', label: 'All tickets' },
  { value: 'new', label: 'New' },
  { value: 'open', label: 'Open' },
  { value: 'waiting_on_customer', label: 'Waiting on customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' }
];

const WORKFLOW_STATUS_OPTIONS = STATUS_OPTIONS.filter((option) => option.value);

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

function formatTicketTime(value) {
  if (!value) {
    return 'Time unavailable';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Time unavailable';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatLabel(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusTone(status) {
  if (status === 'resolved') {
    return 'active';
  }

  if (status === 'closed') {
    return 'neutral';
  }

  if (status === 'waiting_on_customer') {
    return 'purple';
  }

  return 'warning';
}

function getPriorityTone(priority) {
  if (priority === 'urgent' || priority === 'high') {
    return 'urgent';
  }

  if (priority === 'normal') {
    return 'warning';
  }

  return 'neutral';
}

function getTicketTitle(ticket) {
  return ticket?.subject || ticket?.description?.slice(0, 80) || 'Support request';
}

function getRequesterLabel(ticket) {
  const name = ticket?.requester_name || 'Requester';
  const email = ticket?.requester_email ? ` · ${ticket.requester_email}` : '';
  return `${name}${email}`;
}

function formatContext(context) {
  if (!context) {
    return '';
  }

  try {
    return JSON.stringify(context, null, 2);
  } catch {
    return String(context);
  }
}

export default function AdminSupportPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [editorDraft, setEditorDraft] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');

  const ticketsQueryKey = ['readyroute-support-tickets', statusFilter];
  const ticketsQuery = useQuery({
    queryKey: ticketsQueryKey,
    queryFn: async () => {
      const params = { limit: 100 };

      if (statusFilter) {
        params.status = statusFilter;
      }

      const response = await api.get('/support/tickets', { params });
      return response.data?.tickets || [];
    }
  });

  const tickets = useMemo(
    () => (Array.isArray(ticketsQuery.data) ? ticketsQuery.data : []),
    [ticketsQuery.data]
  );
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || tickets[0] || null,
    [selectedTicketId, tickets]
  );
  const selectedEditorDraft = editorDraft?.ticketId === selectedTicket?.id ? editorDraft : null;
  const statusDraft = selectedEditorDraft?.status || selectedTicket?.status || 'new';
  const priorityDraft = selectedEditorDraft?.priority || selectedTicket?.priority || 'normal';
  const notesDraft = selectedEditorDraft?.internal_notes ?? selectedTicket?.internal_notes ?? '';
  const contextJson = formatContext(selectedTicket?.context);
  const openCount = tickets.filter((ticket) => ['new', 'open'].includes(ticket.status)).length;
  const urgentCount = tickets.filter((ticket) => ['urgent', 'high'].includes(ticket.priority)).length;
  const waitingCount = tickets.filter((ticket) => ticket.status === 'waiting_on_customer').length;
  const isForbidden = ticketsQuery.error?.response?.status === 403;

  const updateTicketMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicket?.id) {
        throw new Error('Select a support ticket first.');
      }

      const response = await api.patch(`/support/tickets/${selectedTicket.id}`, {
        status: statusDraft,
        priority: priorityDraft,
        internal_notes: notesDraft
      });

      return response.data?.ticket || null;
    },
    onSuccess: (ticket) => {
      if (ticket) {
        queryClient.setQueryData(ticketsQueryKey, (current = []) => (
          Array.isArray(current)
            ? current.map((item) => (item.id === ticket.id ? { ...item, ...ticket } : item))
            : current
        ));
      }

      setEditorDraft(null);
      setSaveMessage('Ticket updated.');
      queryClient.invalidateQueries({ queryKey: ['readyroute-support-tickets'] });
    }
  });

  function updateEditorDraft(patch) {
    if (!selectedTicket?.id) {
      return;
    }

    setEditorDraft((current) => {
      const currentMatchesTicket = current?.ticketId === selectedTicket.id;

      return {
        ticketId: selectedTicket.id,
        status: currentMatchesTicket ? current.status : selectedTicket.status || 'new',
        priority: currentMatchesTicket ? current.priority : selectedTicket.priority || 'normal',
        internal_notes: currentMatchesTicket ? current.internal_notes : selectedTicket.internal_notes || '',
        ...patch
      };
    });
    setSaveMessage('');
  }

  function handleSelectTicket(ticketId) {
    setSelectedTicketId(ticketId);
    setEditorDraft(null);
    setSaveMessage('');
  }

  async function handleSaveTicket(event) {
    event.preventDefault();
    setSaveMessage('');

    try {
      await updateTicketMutation.mutateAsync();
    } catch {
      // The mutation error state renders the user-facing message.
    }
  }

  return (
    <section className="admin-support-page">
      <PageHeader
        eyebrow="ReadyRoute Internal"
        title="Support Desk"
        description="Review customer support requests, keep internal notes, and move tickets through follow-up."
        actions={(
          <button className="secondary-inline-button" onClick={() => ticketsQuery.refetch()} type="button">
            Refresh
          </button>
        )}
      />

      <div className="admin-support-stat-grid">
        <StatCard label="Visible Tickets" value={tickets.length} />
        <StatCard label="New or Open" value={openCount} tone={openCount ? 'warning' : 'active'} />
        <StatCard label="High Priority" value={urgentCount} tone={urgentCount ? 'urgent' : 'active'} />
        <StatCard label="Waiting" value={waitingCount} tone={waitingCount ? 'warning' : 'active'} />
      </div>

      <div className="support-desk-toolbar">
        <label>
          Status
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ticketsQuery.isLoading ? (
        <LoadingState title="Loading support tickets" variant="card" />
      ) : ticketsQuery.isError ? (
        <ErrorState
          title={isForbidden ? 'ReadyRoute staff access required' : 'Unable to load support tickets'}
          description={isForbidden ? 'This internal desk is limited to ReadyRoute staff accounts.' : 'Refresh this page or try again in a moment.'}
          onRetry={() => ticketsQuery.refetch()}
        />
      ) : tickets.length ? (
        <div className="support-desk-layout">
          <aside className="support-ticket-list" aria-label="Support tickets">
            {tickets.map((ticket) => {
              const isSelected = ticket.id === selectedTicket?.id;

              return (
                <button
                  className={`support-ticket-row${isSelected ? ' selected' : ''}`}
                  key={ticket.id}
                  onClick={() => handleSelectTicket(ticket.id)}
                  type="button"
                >
                  <span className="support-ticket-row-header">
                    <strong>{getTicketTitle(ticket)}</strong>
                    <StatusBadge tone={getStatusTone(ticket.status)}>
                      {formatLabel(ticket.status || 'new')}
                    </StatusBadge>
                  </span>
                  <span className="support-ticket-row-meta">
                    {ticket.ticket_reference || 'No reference'} · {formatTicketTime(ticket.created_at)}
                  </span>
                  <span className="support-ticket-row-meta">
                    {ticket.company_name || 'No company'} · {ticket.requester_name || ticket.requester_type || 'Requester'}
                  </span>
                  <span className="support-ticket-row-footer">
                    <StatusBadge tone={getPriorityTone(ticket.priority)}>
                      {formatLabel(ticket.priority || 'normal')}
                    </StatusBadge>
                    <span>{formatLabel(ticket.category || 'other')}</span>
                  </span>
                </button>
              );
            })}
          </aside>

          {selectedTicket ? (
            <article className="support-ticket-detail">
              <header className="support-ticket-detail-header">
                <div className="support-ticket-detail-badges">
                  <StatusBadge tone={getStatusTone(selectedTicket.status)}>
                    {formatLabel(selectedTicket.status || 'new')}
                  </StatusBadge>
                  <StatusBadge tone={getPriorityTone(selectedTicket.priority)}>
                    {formatLabel(selectedTicket.priority || 'normal')}
                  </StatusBadge>
                </div>
                <h2>{getTicketTitle(selectedTicket)}</h2>
                <p>
                  {selectedTicket.ticket_reference || 'No reference'} · Created {formatTicketTime(selectedTicket.created_at)}
                </p>
              </header>

              <section className="support-ticket-description">
                <h3>Request</h3>
                <p>{selectedTicket.description || 'No description provided.'}</p>
              </section>

              <div className="support-ticket-meta-grid">
                <div>
                  <span>Company</span>
                  <strong>{selectedTicket.company_name || 'Not provided'}</strong>
                </div>
                <div>
                  <span>Requester</span>
                  <strong>{getRequesterLabel(selectedTicket)}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{selectedTicket.requester_phone || 'Not provided'}</strong>
                </div>
                <div>
                  <span>Surface</span>
                  <strong>{selectedTicket.app_surface || selectedTicket.source || 'Support form'}</strong>
                </div>
                <div>
                  <span>Page</span>
                  <strong>{selectedTicket.page_url || 'Not captured'}</strong>
                </div>
                <div>
                  <span>Call requested</span>
                  <strong>{selectedTicket.request_call ? 'Yes' : 'No'}</strong>
                </div>
              </div>

              {contextJson ? (
                <details className="support-ticket-context">
                  <summary>Captured context</summary>
                  <pre>{contextJson}</pre>
                </details>
              ) : null}

              <form className="support-ticket-editor" onSubmit={handleSaveTicket}>
                <div className="support-ticket-editor-grid">
                  <label>
                    Status
                    <select value={statusDraft} onChange={(event) => updateEditorDraft({ status: event.target.value })}>
                      {WORKFLOW_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select value={priorityDraft} onChange={(event) => updateEditorDraft({ priority: event.target.value })}>
                      {PRIORITY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label>
                  Internal notes
                  <textarea
                    onChange={(event) => updateEditorDraft({ internal_notes: event.target.value })}
                    placeholder="Add follow-up notes, decisions, or account context."
                    value={notesDraft}
                  />
                </label>

                <div className="support-ticket-editor-actions">
                  {updateTicketMutation.isError ? (
                    <span className="support-ticket-save-error">Ticket could not be updated.</span>
                  ) : saveMessage ? (
                    <span className="support-ticket-save-message">{saveMessage}</span>
                  ) : null}
                  <button
                    className="primary-cta"
                    disabled={updateTicketMutation.isPending}
                    type="submit"
                  >
                    {updateTicketMutation.isPending ? 'Saving...' : 'Save Ticket'}
                  </button>
                </div>
              </form>
            </article>
          ) : null}
        </div>
      ) : (
        <EmptyState
          title="No support tickets yet"
          description="New tickets from the support button and public support form will appear here."
        />
      )}
    </section>
  );
}
