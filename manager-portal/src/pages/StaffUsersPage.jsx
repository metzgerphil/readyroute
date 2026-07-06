import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge } from '../components/PortalDesignSystem';
import api from '../services/api';

const STAFF_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'support', label: 'Support' },
  { value: 'read_only', label: 'Read Only' }
];

function formatDateTime(value) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Not recorded';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function formatRole(role) {
  return String(role || 'staff')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getRoleTone(role) {
  if (role === 'owner' || role === 'admin') {
    return 'purple';
  }

  if (role === 'support') {
    return 'warning';
  }

  return 'neutral';
}

function getStatusTone(status) {
  if (status === 'pending') {
    return 'warning';
  }

  if (status === 'accepted' || status === 'active') {
    return 'active';
  }

  return 'urgent';
}

export default function StaffUsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    role: 'support'
  });
  const [successMessage, setSuccessMessage] = useState('');
  const [manualInviteUrl, setManualInviteUrl] = useState('');

  const staffUsersQuery = useQuery({
    queryKey: ['staff-users'],
    queryFn: async () => {
      const response = await api.get('/staff/users');
      return response.data?.staff_users || [];
    }
  });

  const staffInvitesQuery = useQuery({
    queryKey: ['staff-invites'],
    queryFn: async () => {
      const response = await api.get('/staff/invites');
      return response.data?.invites || [];
    }
  });

  const createStaffInviteMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/staff/invites', form);
      return response.data || {};
    },
    onSuccess: (payload) => {
      if (payload.invite) {
        queryClient.setQueryData(['staff-invites'], (current = []) => (
          Array.isArray(current)
            ? [payload.invite, ...current.filter((invite) => invite.id !== payload.invite.id)]
            : [payload.invite]
        ));
      }

      setForm({
        full_name: '',
        email: '',
        role: 'support'
      });
      setManualInviteUrl(payload.invite_url || '');
      setSuccessMessage(
        payload.email_delivery?.delivered
          ? 'Staff invite sent.'
          : 'Staff invite created. Share the invite link manually.'
      );
    }
  });

  const resendInviteMutation = useMutation({
    mutationFn: async (inviteId) => {
      const response = await api.post(`/staff/invites/${inviteId}/resend`);
      return response.data || {};
    },
    onSuccess: (payload) => {
      if (payload.invite) {
        queryClient.setQueryData(['staff-invites'], (current = []) => (
          Array.isArray(current)
            ? current.map((invite) => (invite.id === payload.invite.id ? payload.invite : invite))
            : current
        ));
      }

      setManualInviteUrl(payload.invite_url || '');
      setSuccessMessage(
        payload.email_delivery?.delivered
          ? 'Staff invite resent.'
          : 'Staff invite refreshed. Share the invite link manually.'
      );
    }
  });

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
    setSuccessMessage('');
    setManualInviteUrl('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSuccessMessage('');
    setManualInviteUrl('');

    try {
      await createStaffInviteMutation.mutateAsync();
    } catch {
      // The mutation state renders the user-facing error.
    }
  }

  const staffUsers = Array.isArray(staffUsersQuery.data) ? staffUsersQuery.data : [];
  const staffInvites = Array.isArray(staffInvitesQuery.data) ? staffInvitesQuery.data : [];
  const isForbidden = staffUsersQuery.error?.response?.status === 403 || staffInvitesQuery.error?.response?.status === 403;

  return (
    <section className="staff-page staff-users-page">
      <PageHeader
        eyebrow="ReadyRoute Internal"
        title="Staff Users"
        description="Invite ReadyRoute employees and manage internal access separately from customer manager accounts."
      />

      <div className="staff-users-layout">
        <section className="staff-user-create-card">
          <h2>Invite Staff User</h2>
          <form className="staff-user-form" onSubmit={handleSubmit}>
            <label>
              Full name
              <input
                onChange={(event) => updateField('full_name', event.target.value)}
                type="text"
                value={form.full_name}
              />
            </label>
            <label>
              Email
              <input
                onChange={(event) => updateField('email', event.target.value)}
                type="email"
                value={form.email}
              />
            </label>
            <label>
              Role
              <select value={form.role} onChange={(event) => updateField('role', event.target.value)}>
                {STAFF_ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            {createStaffInviteMutation.isError ? (
              <div className="error-banner">
                {createStaffInviteMutation.error?.response?.data?.error || 'Staff invite could not be created.'}
              </div>
            ) : successMessage ? (
              <div className="info-banner">{successMessage}</div>
            ) : null}

            {manualInviteUrl ? (
              <label>
                Invite link
                <textarea readOnly value={manualInviteUrl} />
              </label>
            ) : null}

            <button className="primary-cta" disabled={createStaffInviteMutation.isPending} type="submit">
              {createStaffInviteMutation.isPending ? 'Sending invite...' : 'Send Staff Invite'}
            </button>
          </form>
        </section>

        <section className="staff-user-list-card">
          <h2>Pending Invites</h2>
          {staffInvitesQuery.isLoading ? (
            <LoadingState title="Loading staff invites" />
          ) : staffInvitesQuery.isError ? (
            <ErrorState
              title={isForbidden ? 'Owner or admin access required' : 'Unable to load staff invites'}
              description={isForbidden ? 'Support and read-only staff cannot manage employee access.' : 'Refresh this page or sign back in.'}
              onRetry={() => staffInvitesQuery.refetch()}
            />
          ) : staffInvites.length ? (
            <div className="staff-user-list">
              {staffInvites.map((invite) => (
                <article className="staff-user-row" key={invite.id}>
                  <div>
                    <strong>{invite.full_name || invite.email}</strong>
                    <span>{invite.email}</span>
                    <span>Expires {formatDateTime(invite.expires_at)}</span>
                  </div>
                  <div className="staff-user-row-badges">
                    <StatusBadge tone={getRoleTone(invite.role)}>
                      {formatRole(invite.role)}
                    </StatusBadge>
                    <StatusBadge tone={getStatusTone(invite.status)}>
                      {formatRole(invite.status)}
                    </StatusBadge>
                    {invite.status === 'pending' ? (
                      <button
                        className="secondary-inline-button"
                        disabled={resendInviteMutation.isPending}
                        onClick={() => resendInviteMutation.mutate(invite.id)}
                        type="button"
                      >
                        Resend
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No pending invites"
              description="Staff invites will appear here after you send them."
              variant="inline"
            />
          )}
        </section>

        <section className="staff-user-list-card">
          <h2>Current Staff</h2>
          {staffUsersQuery.isLoading ? (
            <LoadingState title="Loading staff users" />
          ) : staffUsersQuery.isError ? (
            <ErrorState
              title={isForbidden ? 'Owner or admin access required' : 'Unable to load staff users'}
              description={isForbidden ? 'Support and read-only staff cannot manage employee access.' : 'Refresh this page or sign back in.'}
              onRetry={() => staffUsersQuery.refetch()}
            />
          ) : staffUsers.length ? (
            <div className="staff-user-list">
              {staffUsers.map((staffUser) => (
                <article className="staff-user-row" key={staffUser.id}>
                  <div>
                    <strong>{staffUser.full_name || staffUser.email}</strong>
                    <span>{staffUser.email}</span>
                    <span>Created {formatDateTime(staffUser.created_at)}</span>
                  </div>
                  <div className="staff-user-row-badges">
                    <StatusBadge tone={getRoleTone(staffUser.role)}>
                      {formatRole(staffUser.role)}
                    </StatusBadge>
                    <StatusBadge tone={getStatusTone(staffUser.is_active ? 'active' : 'inactive')}>
                      {staffUser.is_active ? 'Active' : 'Inactive'}
                    </StatusBadge>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No staff users yet"
              description="Create the first staff users after bootstrapping your owner account."
              variant="inline"
            />
          )}
        </section>
      </div>
    </section>
  );
}
