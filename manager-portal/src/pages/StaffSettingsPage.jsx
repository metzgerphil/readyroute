import { useState } from 'react';

import { PageHeader } from '../components/PortalDesignSystem';
import api from '../services/api';
import { getReadyRouteStaffTokenPayload } from '../services/auth';

export default function StaffSettingsPage() {
  const staffPayload = getReadyRouteStaffTokenPayload() || {};
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

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
      await api.post('/staff/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccessMessage('Staff password updated.');
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

  return (
    <section className="staff-page staff-settings-page">
      <PageHeader
        eyebrow="ReadyRoute Internal"
        title="Settings"
        description="Manage your staff password and sign-in."
      />

      <div className="staff-users-layout">
        <section className="staff-user-create-card">
          <h2>Change Password</h2>
          <p className="staff-settings-summary">
            Signed in as {staffPayload.staff_email || 'ReadyRoute staff'}.
          </p>

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

            {successMessage ? <div className="info-banner">{successMessage}</div> : null}
            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            <button className="primary-cta" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Updating password...' : 'Update Password'}
            </button>
          </form>
        </section>
      </div>
    </section>
  );
}
