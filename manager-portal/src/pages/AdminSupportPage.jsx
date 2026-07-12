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

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Attachment could not be read.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export default function AdminSupportPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState('');
  const [editorDraft, setEditorDraft] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [replyIsInternal, setReplyIsInternal] = useState(false);
  const [replyAttachment, setReplyAttachment] = useState(null);

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
  const ticketDetailQuery = useQuery({
    enabled: Boolean(selectedTicket?.id),
    queryKey: ['readyroute-support-ticket-detail', selectedTicket?.id],
    queryFn: async () => {
      const response = await api.get(`/support/tickets/${selectedTicket.id}`);
      return response.data || {};
    }
  });
  const staffUsersQuery = useQuery({
    queryKey: ['staff-users'],
    queryFn: async () => {
      const response = await api.get('/staff/users');
      return response.data?.staff_users || [];
    }
  });
  const detailedTicket = ticketDetailQuery.data?.ticket || selectedTicket;
  const ticketMessages = ticketDetailQuery.data?.messages || [];
  const ticketAttachments = ticketDetailQuery.data?.attachments || [];
  const ticketEvents = ticketDetailQuery.data?.events || [];
  const selectedEditorDraft = editorDraft?.ticketId === selectedTicket?.id ? editorDraft : null;
  const statusDraft = selectedEditorDraft?.status || selectedTicket?.status || 'new';
  const priorityDraft = selectedEditorDraft?.priority || selectedTicket?.priority || 'normal';
  const notesDraft = selectedEditorDraft?.internal_notes ?? selectedTicket?.internal_notes ?? '';
  const assigneeDraft = selectedEditorDraft?.assigned_staff_user_id ?? selectedTicket?.assigned_staff_user_id ?? '';
  const contextJson = formatContext(detailedTicket?.context);
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
        internal_notes: notesDraft,
        ...(assigneeDraft !== (selectedTicket.assigned_staff_user_id || '')
          ? { assigned_staff_user_id: assigneeDraft || null }
          : {})
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
      queryClient.invalidateQueries({ queryKey: ['readyroute-support-ticket-detail', selectedTicket?.id] });
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
        assigned_staff_user_id: currentMatchesTicket ? current.assigned_staff_user_id : selectedTicket.assigned_staff_user_id || '',
        ...patch
      };
    });
    setSaveMessage('');
    setReplyBody('');
    setReplyIsInternal(false);
    setReplyAttachment(null);
  }

  const addMessageMutation = useMutation({
    mutationFn: async () => {
      const attachment = replyAttachment ? {
        file_name: replyAttachment.name,
        mime_type: replyAttachment.type || 'application/octet-stream',
        file_base64: await readFileAsBase64(replyAttachment)
      } : null;
      const response = await api.post(`/support/tickets/${selectedTicket.id}/messages`, {
        body: replyBody,
        is_internal: replyIsInternal,
        attachment
      });
      return response.data || {};
    },
    onSuccess: () => {
      setReplyBody('');
      setReplyIsInternal(false);
      setReplyAttachment(null);
      queryClient.invalidateQueries({ queryKey: ['readyroute-support-ticket-detail', selectedTicket?.id] });
      queryClient.invalidateQueries({ queryKey: ['readyroute-support-tickets'] });
    }
  });

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
        description="Review support requests, manage ticket status, and keep internal notes."
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
                <h2>{getTicketTitle(detailedTicket)}</h2>
                <p>
                  {selectedTicket.ticket_reference || 'No reference'} · Created {formatTicketTime(selectedTicket.created_at)}
                </p>
              </header>

              <section className="support-ticket-description">
                <h3>Request</h3>
                <p>{detailedTicket.description || 'No description provided.'}</p>
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
                  <label>
                    Assigned to
                    <select value={assigneeDraft} onChange={(event) => updateEditorDraft({ assigned_staff_user_id: event.target.value })}>
                      <option value="">Unassigned</option>
                      {(staffUsersQuery.data || []).filter((staffUser) => staffUser.is_active !== false).map((staffUser) => (
                        <option key={staffUser.id} value={staffUser.id}>{staffUser.full_name || staffUser.email}</option>
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

              <section className="support-ticket-conversation">
                <div className="staff-section-heading-row">
                  <h3>Conversation and History</h3>
                  <span>{ticketMessages.length} messages · {ticketEvents.length} events</span>
                </div>
                {ticketDetailQuery.isLoading ? (
                  <LoadingState title="Loading ticket history" />
                ) : (
                  <div className="support-ticket-timeline">
                    <article className="support-ticket-message requester">
                      <strong>{detailedTicket.requester_name || 'Requester'}</strong>
                      <span>{formatTicketTime(detailedTicket.created_at)}</span>
                      <p>{detailedTicket.description}</p>
                    </article>
                    {ticketMessages.map((message) => (
                      <article className={`support-ticket-message ${message.is_internal ? 'internal' : message.author_type}`} key={message.id}>
                        <strong>{message.is_internal ? 'Internal note' : message.author_type === 'staff' ? 'ReadyRoute Support' : 'Requester'}</strong>
                        <span>{formatTicketTime(message.created_at)}</span>
                        <p>{message.body}</p>
                      </article>
                    ))}
                    {ticketEvents.map((event) => (
                      <div className="support-ticket-event" key={event.id}>
                        <span>{formatLabel(event.event_type)} · {formatTicketTime(event.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {ticketAttachments.length ? (
                  <div className="support-ticket-attachments">
                    <h4>Attachments</h4>
                    {ticketAttachments.map((attachment) => (
                      <a href={attachment.access_url || '#'} key={attachment.id} rel="noreferrer" target="_blank">
                        {attachment.file_name} · {Math.max(1, Math.round(Number(attachment.size_bytes || 0) / 1024))} KB
                      </a>
                    ))}
                  </div>
                ) : null}

                <form
                  className="support-reply-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    await addMessageMutation.mutateAsync();
                  }}
                >
                  <label className="support-checkbox-row">
                    <input checked={replyIsInternal} onChange={(event) => setReplyIsInternal(event.target.checked)} type="checkbox" />
                    Internal note only
                  </label>
                  <label>
                    {replyIsInternal ? 'Internal note' : 'Reply to customer'}
                    <textarea onChange={(event) => setReplyBody(event.target.value)} required value={replyBody} />
                  </label>
                  <label>
                    Optional attachment
                    <input
                      accept="image/*,.pdf,.txt"
                      onChange={(event) => setReplyAttachment(event.target.files?.[0] || null)}
                      type="file"
                    />
                  </label>
                  {addMessageMutation.isError ? <span className="support-ticket-save-error">Reply could not be saved.</span> : null}
                  <button className="primary-cta" disabled={addMessageMutation.isPending} type="submit">
                    {addMessageMutation.isPending ? 'Sending...' : replyIsInternal ? 'Add Internal Note' : 'Send Reply'}
                  </button>
                </form>
              </section>
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
