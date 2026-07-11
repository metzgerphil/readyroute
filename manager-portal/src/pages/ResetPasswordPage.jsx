import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const mode = useMemo(() => searchParams.get('mode') || '', [searchParams]);
  const isInvite = mode === 'invite';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const infoMessage = useMemo(
    () => (
      token
        ? isInvite
          ? 'Set your manager password to activate this ReadyRoute invite.'
          : 'Choose a new password for your manager account.'
        : 'This invite or reset link is missing. Ask your CSA manager to send a new invite.'
    ),
    [isInvite, token]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (!token.trim()) {
      setErrorMessage('This invite or reset link is missing. Ask your CSA manager to send a new invite.');
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
        token: token.trim(),
        password
      });
      navigate(`/login?reset=success${isInvite ? '&invite=accepted' : ''}`, { replace: true });
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
        <div className="brand-subtitle">{isInvite ? 'Set your manager password' : 'Reset manager password'}</div>

        {infoMessage ? <div className="info-banner">{infoMessage}</div> : null}

        {token ? (
          <>
            <label className="field-label" htmlFor="new-password">New password</label>
            <input
              autoComplete="new-password"
              className="text-field"
              id="new-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />

            <label className="field-label" htmlFor="confirm-password">Confirm password</label>
            <input
              autoComplete="new-password"
              className="text-field"
              id="confirm-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />

            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            <button className="primary-cta" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving password...' : isInvite ? 'Activate account' : 'Update password'}
            </button>
          </>
        ) : null}

        <div className="login-helper-note">
          <Link to="/login">Back to sign in</Link>
        </div>
      </form>
    </div>
  );
}
