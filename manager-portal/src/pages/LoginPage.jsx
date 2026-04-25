import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

import api from '../services/api';
import { saveManagerToken } from '../services/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState(
    searchParams.get('invite') === 'accepted'
      ? 'Manager access is active. Sign in with the password you just set.'
      : searchParams.get('reset') === 'success'
        ? 'Password reset. Sign in with your new password.'
        : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetErrorMessage, setResetErrorMessage] = useState('');
  const handoffToken = searchParams.get('token') || '';

  useEffect(() => {
    if (!handoffToken) {
      return;
    }

    saveManagerToken(handoffToken);
    navigate('/', { replace: true });
  }, [handoffToken, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const response = await api.post('/auth/manager/login', { email, password });
      saveManagerToken(response.data?.token || '');
      navigate('/', { replace: true });
    } catch (error) {
      if (!error.response) {
        setErrorMessage('Backend server is unavailable. Start the ReadyRoute backend and try again.');
      } else if (error.response.status === 401) {
        setErrorMessage('Incorrect email or password. Try again.');
      } else {
        setErrorMessage('Sign-in failed. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResetRequest(event) {
    event.preventDefault();
    setResetErrorMessage('');
    setResetMessage('');
    setInfoMessage('');
    setIsRequestingReset(true);

    try {
      const response = await api.post('/auth/manager/request-password-reset', {
        email: resetEmail
      });
      const resetUrl = response.data?.reset_url;

      if (resetUrl) {
        setResetMessage(`Reset link ready for local use: ${resetUrl}`);
      } else {
        setResetMessage(response.data?.message || 'If that email exists, a reset link has been prepared.');
      }
    } catch (error) {
      if (!error.response) {
        setResetErrorMessage('Backend server is unavailable. Start the ReadyRoute backend and try again.');
      } else {
        setResetErrorMessage(error.response?.data?.error || 'Could not prepare a reset link.');
      }
    } finally {
      setIsRequestingReset(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-hero-panel">
          <div className="login-hero-badge">ReadyRoute Manager Portal</div>
          <div className="brand login-brand">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </div>
          <h1 className="login-hero-title">Operate the manifest. Keep the map. Move faster in the field.</h1>
          <p className="login-hero-copy">
            ReadyRoute helps dispatch and drivers execute the day with live route visibility, apartment intelligence,
            building notes, and manifest-first stop control.
          </p>

          <div className="login-hero-points">
            <div className="login-hero-point">
              <strong>Manifest-first</strong>
              <span>Keep FedEx stop order as the source of truth.</span>
            </div>
            <div className="login-hero-point">
              <strong>Map-aware</strong>
              <span>See every stop pin and the live driver position in one view.</span>
            </div>
            <div className="login-hero-point">
              <strong>Building intel</strong>
              <span>Capture gates, units, offices, docks, parking, and repeat-stop knowledge.</span>
            </div>
          </div>
        </section>

        <div className="login-card login-card-elevated">
          <div className="login-card-header">
            <div className="brand">
              <span className="brand-ready">ready</span>
              <span className="brand-route">Route</span>
            </div>
            <div className="brand-subtitle login-brand-subtitle">Manager sign in</div>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="email">Email</label>
            <input
              className="text-field"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />

            <label className="field-label" htmlFor="password">Password</label>
            <input
              className="text-field"
              id="password"
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

          <div className="login-helper-card">
            <div className="login-helper-title">Need a new password?</div>
            <form className="login-helper-form" onSubmit={handleResetRequest}>
              <label className="field-label" htmlFor="reset-email">Manager email</label>
              <input
                className="text-field"
                id="reset-email"
                onChange={(event) => setResetEmail(event.target.value)}
                type="email"
                value={resetEmail}
              />
              {resetMessage ? <div className="info-banner">{resetMessage}</div> : null}
              {resetErrorMessage ? <div className="error-banner">{resetErrorMessage}</div> : null}
              <button className="secondary-button" disabled={isRequestingReset} type="submit">
                {isRequestingReset ? 'Preparing reset link...' : 'Send reset link'}
              </button>
            </form>
            <div className="login-helper-note">
              In local development, the reset link appears here and in the backend terminal. In production, ReadyRoute emails the reset link when the mail service is configured.
            </div>
          </div>

          <div className="login-helper-note">
            If you already have a reset link, open it directly or use the <Link to="/reset-password">reset password page</Link>.
          </div>

          <div className="login-helper-note">
            New to ReadyRoute? <Link to="/start-trial">Start your free trial</Link>.
          </div>
        </div>
      </div>
    </div>
  );
}
