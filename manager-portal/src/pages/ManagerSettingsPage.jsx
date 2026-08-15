import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../components/PortalDesignSystem';
import api from '../services/api';
import { clearManagerToken, getManagerTokenPayload } from '../services/auth';

export default function ManagerSettingsPage() {
  const navigate = useNavigate();
  const managerPayload = getManagerTokenPayload() || {};
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (!currentPassword) {
      setErrorMessage('Enter your current password.');
      return;
    }

    if (newPassword.length < 10) {
      setErrorMessage('Password must be at least 10 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/auth/manager/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      clearManagerToken();
      navigate('/login?password=changed', { replace: true });
    } catch (error) {
      if (!error.response) {
        setErrorMessage('ReadyRoute is temporarily unavailable. Please try again.');
      } else {
        setErrorMessage(error.response?.data?.error || 'Could not update your password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const managerEmail = managerPayload.manager_email || managerPayload.email || 'ReadyRoute manager';

  return (
    <main className="page manager-settings-page">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your manager password and sign-in."
      />

      <section className="page-card staff-user-create-card">
        <h2>Change Password</h2>
        <p className="staff-settings-summary">Signed in as {managerEmail}.</p>

        <form className="staff-user-form" onSubmit={handleSubmit}>
          <label>
            Current password
            <input
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </label>

          <label>
            New password
            <input
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
          </label>

          <label>
            Confirm new password
            <input
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </label>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <button className="primary-cta" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Updating password...' : 'Update Password'}
          </button>
        </form>
      </section>
    </main>
  );
}
