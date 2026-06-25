import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  const [showResetForm, setShowResetForm] = useState(false);
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
        setErrorMessage('ReadyRoute is temporarily unavailable. Please try again.');
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
    <div className="login-page">
      <div className="login-shell">
        <section className="login-hero-panel">
          <div className="login-hero-badge">ReadyRoute Manager Portal</div>
          <h1 className="login-hero-title">Run today&apos;s routes with confidence.</h1>
          <p className="login-hero-copy">Load routes, assign drivers, monitor progress, and keep the day moving from one clean operations portal.</p>

          <div className="login-hero-points">
            <div className="login-hero-point">
              <strong>Manifest-first</strong>
              <span>Keep the day&apos;s route work centered on the manifest.</span>
            </div>
            <div className="login-hero-point">
              <strong>Map-aware</strong>
              <span>See route coverage, stop pins, and driver visibility in one place.</span>
            </div>
            <div className="login-hero-point">
              <strong>Field-ready</strong>
              <span>Send drivers the stop details, notes, and route information they need.</span>
            </div>
          </div>
        </section>

        <div className="login-card login-card-elevated">
          <div className="login-card-header">
            <div className="brand">
              <span className="brand-ready">ready</span>
              <span className="brand-route">Route</span>
            </div>
            <div className="login-card-title">Manager sign in</div>
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
                <div className="login-helper-title">Reset your password</div>
                <p className="login-helper-copy">Enter your manager email and we&apos;ll send reset instructions.</p>
              </div>
              <form className="login-helper-form" onSubmit={handleResetRequest}>
                <label className="field-label" htmlFor="reset-email">Manager email</label>
                <input
                  className="text-field"
                  id="reset-email"
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
            <a href="https://readyroute.org/mvp">Request access</a>
            <a href="https://readyroute.org/">Back to ReadyRoute</a>
          </div>
        </div>
      </div>
    </div>
  );
}
