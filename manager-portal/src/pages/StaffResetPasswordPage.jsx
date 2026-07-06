import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';

export default function StaffResetPasswordPage() {
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
      setErrorMessage('This reset link is missing. Request a new staff password reset.');
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
      await api.post('/staff/reset-password', {
        token: token.trim(),
        password
      });
      navigate('/readyroute/login?reset=success', { replace: true });
    } catch (error) {
      if (!error.response) {
        setErrorMessage('ReadyRoute is temporarily unavailable. Please try again.');
      } else {
        setErrorMessage(error.response?.data?.error || 'Password reset failed. Please try again.');
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
          <div className="login-card-title">Reset staff password</div>
        </div>

        <div className="info-banner">
          {token
            ? 'Choose a new password for your ReadyRoute staff account.'
            : 'This reset link is missing. Request a new staff password reset.'}
        </div>

        {token ? (
          <>
            <label className="field-label" htmlFor="staff-new-password">New password</label>
            <input
              autoComplete="new-password"
              className="text-field"
              id="staff-new-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />

            <label className="field-label" htmlFor="staff-confirm-password">Confirm password</label>
            <input
              autoComplete="new-password"
              className="text-field"
              id="staff-confirm-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />

            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            <button className="primary-cta" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving password...' : 'Update Password'}
            </button>
          </>
        ) : null}

        <div className="login-helper-note">
          <Link to="/readyroute/login">Back to staff sign in</Link>
        </div>
      </form>
    </div>
  );
}
