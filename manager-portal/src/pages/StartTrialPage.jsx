import { useEffect } from 'react';

const MVP_URL = 'https://readyroute.org/mvp';

export default function StartTrialPage() {
  useEffect(() => {
    document.title = 'ReadyRoute MVP | ReadyRoute';
    window.location.replace(MVP_URL);
  }, []);

  return (
    <div className="login-page">
      <div className="login-shell">
        <div className="login-card">
          <div className="brand">
            <span className="brand-ready">ready</span>
            <span className="brand-route">Route</span>
          </div>
          <div className="brand-subtitle login-brand-subtitle">Redirecting to ReadyRoute MVP...</div>
          <a className="primary-button" href={MVP_URL}>Continue to MVP page</a>
        </div>
      </div>
    </div>
  );
}
