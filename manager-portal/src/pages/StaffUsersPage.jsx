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

export default function StaffUsersPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    role: 'support'
  });
  const [successMessage, setSuccessMessage] = useState('');

  const staffUsersQuery = useQuery({
    queryKey: ['staff-users'],
    queryFn: async () => {
      const response = await api.get('/staff/users');
      return response.data?.staff_users || [];
    }
  });

  const createStaffUserMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/staff/users', form);
      return response.data?.staff_user || null;
    },
    onSuccess: (staffUser) => {
      if (staffUser) {
        queryClient.setQueryData(['staff-users'], (current = []) => (
          Array.isArray(current) ? [staffUser, ...current] : [staffUser]
        ));
      }

      setForm({
        full_name: '',
        email: '',
        password: '',
        role: 'support'
      });
      setSuccessMessage('Staff user created.');
    }
  });

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
    setSuccessMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSuccessMessage('');

    try {
      await createStaffUserMutation.mutateAsync();
    } catch {
      // The mutation state renders the user-facing error.
    }
  }

  const staffUsers = Array.isArray(staffUsersQuery.data) ? staffUsersQuery.data : [];
  const isForbidden = staffUsersQuery.error?.response?.status === 403;

  return (
    <section className="staff-page staff-users-page">
      <PageHeader
        eyebrow="ReadyRoute Internal"
        title="Staff Users"
        description="Manage ReadyRoute employee access separately from customer manager accounts."
      />

      <div className="staff-users-layout">
        <section className="staff-user-create-card">
          <h2>Add Staff User</h2>
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
              Temporary password
              <input
                onChange={(event) => updateField('password', event.target.value)}
                type="password"
                value={form.password}
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

            {createStaffUserMutation.isError ? (
              <div className="error-banner">
                {createStaffUserMutation.error?.response?.data?.error || 'Staff user could not be created.'}
              </div>
            ) : successMessage ? (
              <div className="info-banner">{successMessage}</div>
            ) : null}

            <button className="primary-cta" disabled={createStaffUserMutation.isPending} type="submit">
              {createStaffUserMutation.isPending ? 'Creating...' : 'Create Staff User'}
            </button>
          </form>
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
                    <StatusBadge tone={staffUser.is_active ? 'active' : 'urgent'}>
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
