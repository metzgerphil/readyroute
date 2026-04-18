import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const mode = useMemo(() => searchParams.get('mode') || '', [searchParams]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState(
    token
      ? mode === 'invite'
        ? 'Set your manager password to activate this ReadyRoute invite.'
        : 'Choose a new password for your manager account.'
      : 'Open this page from a reset link, or paste the reset token below.'
  );
  const [manualToken, setManualToken] = useState(token);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (!manualToken.trim()) {
      setErrorMessage('Reset token is required.');
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
      await api.post('/auth/manager/reset-password', {
        token: manualToken.trim(),
        password
      });
      navigate(`/login?reset=success${mode === 'invite' ? '&invite=accepted' : ''}`, { replace: true });
    } catch (error) {
      if (!error.response) {
        setErrorMessage('Backend server is unavailable. Start the ReadyRoute backend and try again.');
      } else {
        setErrorMessage(error.response?.data?.error || 'Password reset failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="brand">
          <span className="brand-ready">ready</span>
          <span className="brand-route">Route</span>
        </div>
        <div className="brand-subtitle">{mode === 'invite' ? 'Activate manager access' : 'Reset manager password'}</div>

        {infoMessage ? <div className="info-banner">{infoMessage}</div> : null}

        <label className="field-label" htmlFor="reset-token">Reset token</label>
        <textarea
          className="text-field"
          id="reset-token"
          onChange={(event) => setManualToken(event.target.value)}
          rows={4}
          value={manualToken}
        />

        <label className="field-label" htmlFor="new-password">New password</label>
        <input
          className="text-field"
          id="new-password"
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          value={password}
        />

        <label className="field-label" htmlFor="confirm-password">Confirm password</label>
        <input
          className="text-field"
          id="confirm-password"
          onChange={(event) => setConfirmPassword(event.target.value)}
          type="password"
          value={confirmPassword}
        />

        {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

        <button className="primary-cta" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Updating password...' : 'Update password'}
        </button>

        <div className="login-helper-note">
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
