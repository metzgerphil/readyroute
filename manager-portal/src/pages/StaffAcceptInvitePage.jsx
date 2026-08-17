import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { saveReadyRouteStaffToken } from '../services/auth';

export default function StaffAcceptInvitePage({ basePath = '/readyroute' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (!token.trim()) {
      setErrorMessage('This invite link is missing. Ask a ReadyRoute owner or admin to resend it.');
      return;
    }

    if (password.length < 10) {
      setErrorMessage('Password must be at least 10 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.post('/staff/invites/accept', {
        token: token.trim(),
        password
      });
      saveReadyRouteStaffToken(response.data?.token || '');
      navigate(`${basePath}/support`, { replace: true });
    } catch (error) {
      if (!error.response) {
        setErrorMessage('ReadyRoute is temporarily unavailable. Please try again.');
      } else {
        setErrorMessage(error.response?.data?.error || 'Invite could not be accepted.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page staff-login-page">
      <form className="login-card login-card-elevated" onSubmit={handleSubmit}>
        <div className="login-card-header">
          <div className="brand">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </div>
          <div className="login-card-title">Accept staff invite</div>
        </div>

        <div className="info-banner">
          {token
            ? 'Set your password to activate ReadyRoute staff access.'
            : 'This invite link is missing. Ask a ReadyRoute owner or admin to resend it.'}
        </div>

        {token ? (
          <>
            <label className="field-label" htmlFor="staff-invite-password">Password</label>
            <input
              autoComplete="new-password"
              className="text-field"
              id="staff-invite-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />

            <label className="field-label" htmlFor="staff-invite-confirm-password">Confirm password</label>
            <input
              autoComplete="new-password"
              className="text-field"
              id="staff-invite-confirm-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />

            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            <button className="primary-cta" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Activating access...' : 'Activate Staff Access'}
            </button>
          </>
        ) : null}

        <div className="login-helper-note">
          <Link to={`${basePath}/login`}>Back to staff sign in</Link>
        </div>
      </form>
    </div>
  );
}
