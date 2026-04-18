import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { getManagerToken } from '../services/auth';

const DEFAULT_FORM = {
  company_name: '',
  full_name: '',
  email: '',
  password: '',
  vehicle_count: '15'
};

export default function StartTrialPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState({
    ...DEFAULT_FORM,
    email: searchParams.get('email') || ''
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [infoMessage, setInfoMessage] = useState(
    searchParams.get('canceled') === '1'
      ? 'Your billing setup was canceled. You can start the free trial again whenever you are ready.'
      : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Start Free Trial | ReadyRoute';

    if (getManagerToken()) {
      navigate('/setup', { replace: true });
    }
  }, [navigate]);

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setInfoMessage('');
    setIsSubmitting(true);

    try {
      const response = await api.post('/auth/manager/start-trial', {
        ...form,
        vehicle_count: Number(form.vehicle_count)
      });

      const checkoutUrl = response.data?.checkout_url;

      if (!checkoutUrl) {
        throw new Error('Missing checkout URL');
      }

      window.location.assign(checkoutUrl);
    } catch (error) {
      if (!error.response) {
        setErrorMessage('ReadyRoute could not reach the backend. Please try again.');
      } else {
        setErrorMessage(error.response?.data?.error || 'Could not start your free trial.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <section className="login-hero-panel">
          <div className="login-hero-badge">ReadyRoute Free Trial</div>
          <div className="brand login-brand">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </div>
          <h1 className="login-hero-title">Start your 14-day trial and launch your CSA the right way.</h1>
          <p className="login-hero-copy">
            Create your company workspace, save your billing method once, and move straight into setup for VEDR,
            managers, drivers, vehicles, and first-route import.
          </p>

          <div className="login-hero-points">
            <div className="login-hero-point">
              <strong>Billing up front</strong>
              <span>Your card is saved now, and billing begins automatically after the 14-day trial.</span>
            </div>
            <div className="login-hero-point">
              <strong>Guided setup</strong>
              <span>We’ll drop you into a clean company setup flow as soon as checkout is complete.</span>
            </div>
            <div className="login-hero-point">
              <strong>No re-entry later</strong>
              <span>Your company account and lead manager access are created before onboarding starts.</span>
            </div>
          </div>
        </section>

        <div className="login-card login-card-elevated">
          <div className="login-card-header">
            <div className="brand">
              <span className="brand-ready">ready</span>
              <span className="brand-route">Route</span>
            </div>
            <div className="brand-subtitle login-brand-subtitle">Start your free trial</div>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="trial-company-name">Company / CSA name</label>
            <input
              className="text-field"
              id="trial-company-name"
              onChange={(event) => updateField('company_name', event.target.value)}
              value={form.company_name}
            />

            <label className="field-label" htmlFor="trial-full-name">Lead manager name</label>
            <input
              className="text-field"
              id="trial-full-name"
              onChange={(event) => updateField('full_name', event.target.value)}
              value={form.full_name}
            />

            <label className="field-label" htmlFor="trial-email">Lead manager email</label>
            <input
              className="text-field"
              id="trial-email"
              onChange={(event) => updateField('email', event.target.value)}
              type="email"
              value={form.email}
            />

            <label className="field-label" htmlFor="trial-password">Password</label>
            <input
              className="text-field"
              id="trial-password"
              onChange={(event) => updateField('password', event.target.value)}
              type="password"
              value={form.password}
            />

            <label className="field-label" htmlFor="trial-vehicle-count">Estimated active vehicles</label>
            <input
              className="text-field"
              id="trial-vehicle-count"
              min="1"
              onChange={(event) => updateField('vehicle_count', event.target.value)}
              type="number"
              value={form.vehicle_count}
            />

            {infoMessage ? <div className="info-banner">{infoMessage}</div> : null}
            {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

            <div className="trial-billing-note">
              Start your free trial. Your card will be saved during Stripe checkout, and billing will begin
              automatically in 14 days unless you cancel first.
            </div>

            <div className="login-action-row">
              <button className="primary-cta" disabled={isSubmitting} type="submit">
                {isSubmitting ? 'Preparing checkout...' : 'Continue to secure checkout'}
              </button>
              <Link className="secondary-button trial-secondary-link" to="/login">
                Back to sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
