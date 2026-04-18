import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { saveManagerToken } from '../services/auth';

export default function TrialActivatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('Activating your ReadyRoute trial...');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    document.title = 'Activating Trial | ReadyRoute';

    let cancelled = false;

    async function activateTrial() {
      const token = searchParams.get('token');
      const sessionId = searchParams.get('session_id');

      if (!token || !sessionId) {
        setErrorMessage('This trial activation link is missing required checkout details.');
        return;
      }

      try {
        const response = await api.post('/auth/manager/complete-trial', {
          token,
          session_id: sessionId
        });

        if (cancelled) {
          return;
        }

        const authToken = response.data?.token || '';
        saveManagerToken(authToken);
        setStatus('Your trial is active. Opening company setup...');
        navigate('/setup?source=trial', { replace: true });
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (!error.response) {
          setErrorMessage('ReadyRoute could not reach the backend to activate your trial.');
        } else {
          setErrorMessage(error.response?.data?.error || 'Could not activate your trial.');
        }
      }
    }

    activateTrial();

    return () => {
      cancelled = true;
    };
  }, [navigate, searchParams]);

  return (
    <div className="login-page">
      <div className="login-shell trial-activate-shell">
        <section className="login-hero-panel">
          <div className="login-hero-badge">ReadyRoute Trial</div>
          <div className="brand login-brand">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </div>
          <h1 className="login-hero-title">Finishing your workspace setup.</h1>
          <p className="login-hero-copy">
            We’re confirming your trial checkout and getting your company account ready for onboarding.
          </p>
        </section>

        <div className="login-card login-card-elevated trial-activate-card">
          {!errorMessage ? <div className="info-banner">{status}</div> : null}
          {errorMessage ? (
            <>
              <div className="error-banner">{errorMessage}</div>
              <div className="login-helper-note">
                You can try again from <Link to="/start-trial">Start Free Trial</Link> or sign in if your account was
                already activated.
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
