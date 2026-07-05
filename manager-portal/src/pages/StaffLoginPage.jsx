import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import api from '../services/api';
import { saveReadyRouteStaffToken } from '../services/auth';

export default function StaffLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const destination = location.state?.from || '/readyroute/support';

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

            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            <button className="primary-cta" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="login-secondary-links">
            <a href="/login">Manager portal</a>
            <a href="https://readyroute.org/">ReadyRoute home</a>
          </div>
        </div>
      </div>
    </div>
  );
}
