import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';

export default function DriverInvitePage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const isReset = useMemo(() => searchParams.get('mode') === 'reset', [searchParams]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!token) return setError('This invitation link is missing. Ask your manager to send a new one.');
    if (password.length < 10) return setError('Password must be at least 10 characters.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setSaving(true);
    try {
      const response = await api.post('/auth/driver/accept-invite', { token, password, username: username.trim() || null });
      setMessage(response.data?.message || 'Password established. You can sign in from the ReadyRoute app.');
      setPassword('');
      setConfirmPassword('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Unable to accept this invitation.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="brand-ready">ready</span><span className="brand-route">Route</span></div>
        <div className="brand-subtitle">{isReset ? 'Reset driver password' : 'Set up driver access'}</div>
        <div className="info-banner">Choose your private driver password. Your manager will not be able to view it.</div>
        <label className="field-label" htmlFor="driver-username">Username (optional)</label>
        <input className="text-field" id="driver-username" onChange={(event) => setUsername(event.target.value)} value={username} />
        <label className="field-label" htmlFor="driver-password">Password</label>
        <input autoComplete="new-password" className="text-field" id="driver-password" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        <label className="field-label" htmlFor="driver-confirm-password">Confirm password</label>
        <input autoComplete="new-password" className="text-field" id="driver-confirm-password" onChange={(event) => setConfirmPassword(event.target.value)} type="password" value={confirmPassword} />
        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="info-banner">{message}</div> : null}
        <button className="primary-cta" disabled={saving || Boolean(message)} type="submit">{saving ? 'Saving password...' : isReset ? 'Reset password' : 'Activate driver access'}</button>
        <div className="login-helper-note"><Link to="/login">Manager sign in</Link></div>
      </form>
    </div>
  );
}
