import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '../components/PortalDesignSystem';
import api from '../services/api';
import { clearManagerToken, getManagerTokenPayload } from '../services/auth';

const WEEKDAYS = [
  [1, 'Monday'],
  [2, 'Tuesday'],
  [3, 'Wednesday'],
  [4, 'Thursday'],
  [5, 'Friday'],
  [6, 'Saturday'],
  [7, 'Sunday']
];

const TIMEZONES = [
  ['America/New_York', 'Eastern Time'],
  ['America/Chicago', 'Central Time'],
  ['America/Denver', 'Mountain Time'],
  ['America/Phoenix', 'Arizona Time'],
  ['America/Los_Angeles', 'Pacific Time'],
  ['America/Anchorage', 'Alaska Time'],
  ['Pacific/Honolulu', 'Hawaii Time']
];

export default function ManagerSettingsPage() {
  const navigate = useNavigate();
  const managerPayload = getManagerTokenPayload() || {};
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [canManageSchedule, setCanManageSchedule] = useState(false);
  const [currentWeekday, setCurrentWeekday] = useState(null);
  const [operationsTimezone, setOperationsTimezone] = useState('America/New_York');
  const [managers, setManagers] = useState([]);
  const [schedule, setSchedule] = useState({});
  const [newManager, setNewManager] = useState({ full_name: '', email: '', phone: '' });
  const [managerAdding, setManagerAdding] = useState(false);

  useEffect(() => {
    let isCurrent = true;

    async function loadSchedule() {
      try {
        const response = await api.get('/manager/account/manager-schedule');
        if (!isCurrent) return;
        const data = response.data || {};
        const activeManagers = Array.isArray(data.managers) ? data.managers : [];
        const assignments = Object.fromEntries(
          (Array.isArray(data.schedule) ? data.schedule : [])
            .map((entry) => [Number(entry.iso_weekday), entry.manager_user_id])
        );
        const defaultManagerId = activeManagers[0]?.id || '';
        WEEKDAYS.forEach(([isoWeekday]) => {
          if (!assignments[isoWeekday]) assignments[isoWeekday] = defaultManagerId;
        });
        setOperationsTimezone(data.operations_timezone || 'America/New_York');
        setCurrentWeekday(Number(data.current_iso_weekday) || null);
        setCanManageSchedule(Boolean(data.can_manage));
        setManagers(activeManagers);
        setSchedule(assignments);
      } catch (error) {
        if (isCurrent) {
          setScheduleError(error.response?.data?.error || 'Could not load the manager schedule.');
        }
      } finally {
        if (isCurrent) setScheduleLoading(false);
      }
    }

    loadSchedule();
    return () => {
      isCurrent = false;
    };
  }, []);

  function updateManagerPhone(managerId, phone) {
    setManagers((current) => current.map((manager) => (
      manager.id === managerId ? { ...manager, phone } : manager
    )));
  }

  function updateManagerName(managerId, fullName) {
    setManagers((current) => current.map((manager) => (
      manager.id === managerId ? { ...manager, full_name: fullName } : manager
    )));
  }

  async function handleAddManager() {
    setScheduleError('');
    setScheduleMessage('');
    setManagerAdding(true);

    try {
      const response = await api.post('/manager/manager-users/invite', newManager);
      const addedManager = response.data?.manager_user;
      if (addedManager) {
        setManagers((current) => [
          ...current.filter((manager) => manager.id !== addedManager.id),
          addedManager
        ].sort((left, right) => String(left.full_name || left.email).localeCompare(String(right.full_name || right.email))));
      }
      setNewManager({ full_name: '', email: '', phone: '' });
      setScheduleMessage(response.data?.message || 'Manager added. You can now assign them to the weekly schedule.');
      if (response.data?.invite_url) {
        window.prompt('Email delivery is unavailable. Copy this secure manager invite link:', response.data.invite_url);
      }
    } catch (error) {
      setScheduleError(error.response?.data?.error || 'Could not add this manager.');
    } finally {
      setManagerAdding(false);
    }
  }

  async function handleScheduleSubmit(event) {
    event.preventDefault();
    setScheduleError('');
    setScheduleMessage('');
    setScheduleSaving(true);

    try {
      await api.put('/manager/account/manager-schedule', {
        operations_timezone: operationsTimezone,
        managers: managers.map((manager) => ({
          id: manager.id,
          full_name: manager.full_name || '',
          phone: manager.phone || ''
        })),
        schedule: WEEKDAYS.map(([isoWeekday]) => ({
          iso_weekday: isoWeekday,
          manager_user_id: schedule[isoWeekday] || ''
        }))
      });
      setScheduleMessage('Manager call schedule saved. Drivers will now use this schedule.');
    } catch (error) {
      setScheduleError(error.response?.data?.error || 'Could not save the manager schedule.');
    } finally {
      setScheduleSaving(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (!currentPassword) {
      setErrorMessage('Enter your current password.');
      return;
    }

    if (newPassword.length < 10) {
      setErrorMessage('Password must be at least 10 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post('/auth/manager/change-password', {
        current_password: currentPassword,
        new_password: newPassword
      });
      clearManagerToken();
      navigate('/login?password=changed', { replace: true });
    } catch (error) {
      if (!error.response) {
        setErrorMessage('ReadyRoute is temporarily unavailable. Please try again.');
      } else {
        setErrorMessage(error.response?.data?.error || 'Could not update your password.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const managerEmail = managerPayload.manager_email || managerPayload.email || 'ReadyRoute manager';

  return (
    <main className="page manager-settings-page">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Set who drivers call each day and manage your sign-in."
      />

      <section className="rra-company-card rra-manager-schedule-card">
        <h2>Driver manager call schedule</h2>
        <p>Choose one manager for each day. ReadyRoute automatically shows every driver the scheduled manager using your company timezone.</p>

        {scheduleLoading ? <p className="rra-schedule-note">Loading manager schedule...</p> : null}
        {!scheduleLoading && managers.length === 0 ? (
          <div className="error-banner">Add an active manager before setting the call schedule.</div>
        ) : null}

        {!scheduleLoading && managers.length > 0 ? (
          <form className="rra-manager-schedule-form" onSubmit={handleScheduleSubmit}>
            <label className="rra-schedule-timezone">
              Company timezone
              <select
                disabled={!canManageSchedule || scheduleSaving}
                onChange={(event) => setOperationsTimezone(event.target.value)}
                value={operationsTimezone}
              >
                {TIMEZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                {!TIMEZONES.some(([value]) => value === operationsTimezone) ? (
                  <option value={operationsTimezone}>{operationsTimezone}</option>
                ) : null}
              </select>
            </label>

            <div className="rra-schedule-manager-phones">
              <h3>Managers drivers can call</h3>
              <p className="rra-schedule-note">Add each manager once, then choose who is on call for every day below.</p>
              {canManageSchedule ? (
                <div className="rra-schedule-add-manager">
                  <label>
                    Manager name
                    <input onChange={(event) => setNewManager((current) => ({ ...current, full_name: event.target.value }))} placeholder="Eugene" type="text" value={newManager.full_name} />
                  </label>
                  <label>
                    Email
                    <input onChange={(event) => setNewManager((current) => ({ ...current, email: event.target.value }))} placeholder="manager@company.com" type="email" value={newManager.email} />
                  </label>
                  <label>
                    Phone number
                    <input inputMode="tel" onChange={(event) => setNewManager((current) => ({ ...current, phone: event.target.value }))} placeholder="(555) 555-0100" type="tel" value={newManager.phone} />
                  </label>
                  <button className="secondary-inline-button" disabled={managerAdding || !newManager.full_name.trim() || !newManager.email.trim() || !newManager.phone.trim()} onClick={handleAddManager} type="button">{managerAdding ? 'Adding…' : 'Add manager'}</button>
                </div>
              ) : null}
              <div className="rra-schedule-manager-list">
                {managers.map((manager) => (
                  <div className="rra-schedule-manager-entry" key={manager.id}>
                    <label>
                      Manager name
                      <input
                        disabled={!canManageSchedule || scheduleSaving}
                        onChange={(event) => updateManagerName(manager.id, event.target.value)}
                        placeholder="Manager name"
                        required
                        type="text"
                        value={manager.full_name || ''}
                      />
                    </label>
                    <label>
                      Phone number
                      <input
                        disabled={!canManageSchedule || scheduleSaving}
                        inputMode="tel"
                        onChange={(event) => updateManagerPhone(manager.id, event.target.value)}
                        placeholder="Manager phone number"
                        required
                        type="tel"
                        value={manager.phone || ''}
                      />
                    </label>
                    <span>{manager.email}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rra-schedule-week">
              <h3>Weekly schedule</h3>
              {WEEKDAYS.map(([isoWeekday, label]) => (
                <label className={currentWeekday === isoWeekday ? 'today' : ''} key={isoWeekday}>
                  <span>{label}{currentWeekday === isoWeekday ? ' · Today' : ''}</span>
                  <select
                    disabled={!canManageSchedule || scheduleSaving}
                    onChange={(event) => setSchedule((current) => ({
                      ...current,
                      [isoWeekday]: event.target.value
                    }))}
                    value={schedule[isoWeekday] || ''}
                  >
                    {managers.map((manager) => (
                      <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>

            {scheduleError ? <div className="error-banner">{scheduleError}</div> : null}
            {scheduleMessage ? <div className="rra-company-message">{scheduleMessage}</div> : null}
            {!canManageSchedule ? <p className="rra-schedule-note">Only the company owner or an administrator can change this schedule.</p> : null}

            {canManageSchedule ? (
              <button className="rra-primary-action" disabled={scheduleSaving} type="submit">
                {scheduleSaving ? 'Saving schedule...' : 'Save manager schedule'}
              </button>
            ) : null}
          </form>
        ) : null}

        {scheduleError && (scheduleLoading || managers.length === 0) ? <div className="error-banner">{scheduleError}</div> : null}
      </section>

      <section className="page-card staff-user-create-card">
        <h2>Change Password</h2>
        <p className="staff-settings-summary">Signed in as {managerEmail}.</p>

        <form className="staff-user-form" onSubmit={handleSubmit}>
          <label>
            Current password
            <input
              autoComplete="current-password"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </label>

          <label>
            New password
            <input
              autoComplete="new-password"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
          </label>

          <label>
            Confirm new password
            <input
              autoComplete="new-password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </label>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <button className="primary-cta" disabled={isSubmitting} type="submit">
            {isSubmitting ? 'Updating password...' : 'Update Password'}
          </button>
        </form>
      </section>
    </main>
  );
}
