import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import api from '../services/api';
import { saveReadyRouteStaffToken } from '../services/auth';

export default function StaffLoginPage({ basePath = '/readyroute' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState(
    new URLSearchParams(location.search).get('reset') === 'success'
      ? 'Password reset. Sign in with your new staff password.'
      : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const destination = location.state?.from || `${basePath}/support`;

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const response = await api.post('/staff/login', { email, password });
      saveReadyRouteStaffToken(response.data?.token || '');
      navigate(destination, { replace: true });
    } catch (error) {
      if (!error.response) {
        setErrorMessage('ReadyRoute is temporarily unavailable. Please try again.');
      } else if (error.response.status === 401) {
        setErrorMessage('Incorrect staff email or password.');
      } else {
        setErrorMessage(error.response?.data?.error || 'Staff sign-in failed.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetRequest(event) {
    event.preventDefault();
    setResetMessage('');
    setResetErrorMessage('');
    setInfoMessage('');
    setIsRequestingReset(true);

    try {
      const response = await api.post('/staff/request-password-reset', {
        email: resetEmail
      });
      setResetMessage(response.data?.message || 'Check your email for reset instructions.');
    } catch (error) {
      if (!error.response) {
        setResetErrorMessage('ReadyRoute is temporarily unavailable. Please try again.');
      } else {
        setResetErrorMessage(error.response?.data?.error || 'Could not send reset instructions.');
      }
    } finally {
      setIsRequestingReset(false);
    }
  }

  return (
    <div className="login-page staff-login-page">
      <div className="login-shell">
        <section className="login-hero-panel staff-login-hero">
          <div className="login-hero-badge">ReadyRoute Internal</div>
          <h1 className="login-hero-title">Support customers and monitor the business.</h1>
          <p className="login-hero-copy">
            Staff access is separate from customer manager access, even when the same person has both accounts.
          </p>
        </section>

        <div className="login-card login-card-elevated">
          <div className="login-card-header">
            <div className="brand">
              <span className="brand-ready">ready</span>
              <span className="brand-route">Route</span>
            </div>
            <div className="login-card-title">Staff sign in</div>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="staff-email">Email</label>
            <input
              className="text-field"
              id="staff-email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />

            <label className="field-label" htmlFor="staff-password">Password</label>
            <input
              className="text-field"
              id="staff-password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />

            {infoMessage ? <div className="info-banner">{infoMessage}</div> : null}
            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            <div className="login-action-row">
              <button className="primary-cta" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Signing in...' : 'Sign In'}
              </button>

              <button
                className="secondary-button"
                onClick={() => {
                  setShowResetForm(true);
                  setResetMessage('');
                  setResetErrorMessage('');
                  setResetEmail(email);
                }}
                type="button"
              >
                Forgot password?
              </button>
            </div>
          </form>

          {showResetForm ? (
            <div className="login-helper-card">
              <div>
                <div className="login-helper-title">Reset staff password</div>
                <p className="login-helper-copy">Enter your ReadyRoute staff email and we&apos;ll send reset instructions.</p>
              </div>
              <form className="login-helper-form" onSubmit={handleResetRequest}>
                <label className="field-label" htmlFor="staff-reset-email">Staff email</label>
                <input
                  className="text-field"
                  id="staff-reset-email"
                  onChange={(event) => setResetEmail(event.target.value)}
                  type="email"
                  value={resetEmail}
                />
                {resetMessage ? <div className="info-banner">Check your email for reset instructions.</div> : null}
                {resetErrorMessage ? <div className="error-banner">{resetErrorMessage}</div> : null}
                <button className="secondary-button" disabled={isRequestingReset} type="submit">
                  {isRequestingReset ? 'Sending reset link...' : 'Send reset link'}
                </button>
              </form>
            </div>
          ) : null}

          <div className="login-secondary-links">
            <a href="https://portal.readyroute.org/login">Manager portal</a>
            <a href="https://readyroute.org/">ReadyRoute home</a>
          </div>
        </div>
      </div>
    </div>
  );
}
