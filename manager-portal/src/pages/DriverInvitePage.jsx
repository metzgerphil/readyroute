import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';

export default function DriverInvitePage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const isReset = useMemo(() => searchParams.get('mode') === 'reset', [searchParams]);
  const [username, setUsername] = useState('');
  const [credentialType, setCredentialType] = useState('pin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!token) return setError('This invitation link is missing. Ask your manager to send a new one.');
    if (credentialType === 'pin' && !/^\d{4}$/.test(password)) return setError('PIN must be exactly 4 digits.');
    if (credentialType === 'password' && password.length < 10) return setError('Password must be at least 10 characters.');
    if (password !== confirmPassword) return setError(credentialType === 'pin' ? 'PINs do not match.' : 'Passwords do not match.');
    setSaving(true);
    try {
      const response = await api.post('/auth/driver/accept-invite', {
        token,
        password,
        credential_type: credentialType,
        username: username.trim() || null
      });
      setMessage(response.data?.message || 'Driver access established. You can sign in from the ReadyRoute app.');
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
        <div className="brand-subtitle">{isReset ? 'Reset driver access' : 'Set up driver access'}</div>
        <div className="info-banner">Choose a private 4-digit PIN for quick driver sign-in, or use a full password. Your manager cannot view either one.</div>
        <label className="field-label" htmlFor="driver-username">Username (optional)</label>
        <input className="text-field" id="driver-username" onChange={(event) => setUsername(event.target.value)} value={username} />
        <fieldset className="driver-credential-choice">
          <legend className="field-label">Choose sign-in method</legend>
          <label className={credentialType === 'pin' ? 'driver-credential-option selected' : 'driver-credential-option'}>
            <input checked={credentialType === 'pin'} name="credential-type" onChange={() => { setCredentialType('pin'); setPassword(''); setConfirmPassword(''); setError(''); }} type="radio" />
            <span><strong>4-digit PIN</strong><small>Recommended for drivers</small></span>
          </label>
          <label className={credentialType === 'password' ? 'driver-credential-option selected' : 'driver-credential-option'}>
            <input checked={credentialType === 'password'} name="credential-type" onChange={() => { setCredentialType('password'); setPassword(''); setConfirmPassword(''); setError(''); }} type="radio" />
            <span><strong>Full password</strong><small>At least 10 characters</small></span>
          </label>
        </fieldset>
        <label className="field-label" htmlFor="driver-password">{credentialType === 'pin' ? '4-digit PIN' : 'Password'}</label>
        <input autoComplete="new-password" className="text-field" id="driver-password" inputMode={credentialType === 'pin' ? 'numeric' : undefined} maxLength={credentialType === 'pin' ? 4 : 200} onChange={(event) => setPassword(credentialType === 'pin' ? event.target.value.replace(/\D/g, '').slice(0, 4) : event.target.value)} type="password" value={password} />
        <label className="field-label" htmlFor="driver-confirm-password">{credentialType === 'pin' ? 'Confirm PIN' : 'Confirm password'}</label>
        <input autoComplete="new-password" className="text-field" id="driver-confirm-password" inputMode={credentialType === 'pin' ? 'numeric' : undefined} maxLength={credentialType === 'pin' ? 4 : 200} onChange={(event) => setConfirmPassword(credentialType === 'pin' ? event.target.value.replace(/\D/g, '').slice(0, 4) : event.target.value)} type="password" value={confirmPassword} />
        {error ? <div className="error-banner">{error}</div> : null}
        {message ? <div className="info-banner">{message}</div> : null}
        <button className="primary-cta" disabled={saving || Boolean(message)} type="submit">{saving ? 'Saving access...' : isReset ? 'Reset driver access' : 'Activate driver access'}</button>
        <div className="login-helper-note"><Link to="/login">Manager sign in</Link></div>
      </form>
    </div>
  );
}
