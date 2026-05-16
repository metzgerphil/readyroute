import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { EmptyState, PageHeader, StatusBadge } from '../components/PortalDesignSystem';
import { useSelectedCsa } from '../context/SelectedCsaContext';
import { getTodayString } from '../utils/operationsDate';

const emptyForm = {
  name: '',
  email: '',
  fedex_driver_id: '',
  phone: '',
  pin: '',
  confirmPin: ''
};

const emptyManagerInviteForm = {
  full_name: '',
  email: ''
};

const emptyLaborForm = {
  driver_id: '',
  driver_name: '',
  date: '',
  clock_in: '',
  clock_out: '',
  break_minutes: '0',
  lunch_minutes: '0',
  adjustment_reason: ''
};

function DriverModal({
  form,
  mode,
  errorMessage,
  isSubmitting,
  isStatusSubmitting,
  onChange,
  onClose,
  onStatusToggle,
  onSubmit
}) {
  const isEdit = mode === 'edit';
  const status = isEdit ? getDriverStatus(form) : null;

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <div className="card-title">{isEdit ? 'Edit Driver' : 'Add Driver'}</div>
            {isEdit ? (
              <div className="driver-meta">Update the driver&apos;s contact information, FedEx Driver ID, and PIN.</div>
            ) : null}
          </div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <section className="driver-modal-section">
            <div>
              <div className="driver-modal-section-title">Driver details</div>
              <div className="driver-meta">Contact details and FedEx identity used by dispatch.</div>
            </div>
            <label className="driver-modal-field">
              <span className="field-label">Driver Name</span>
              <input className="text-field" onChange={(event) => onChange('name', event.target.value)} placeholder="Driver Name" value={form.name} />
            </label>
            <label className="driver-modal-field">
              <span className="field-label">FedEx Driver ID</span>
              <input
                className="text-field"
                onChange={(event) => onChange('fedex_driver_id', event.target.value)}
                placeholder="Enter FedEx Driver ID"
                value={form.fedex_driver_id}
              />
            </label>
            <label className="driver-modal-field">
              <span className="field-label">Email</span>
              <input
                className="text-field"
                disabled={isEdit}
                onChange={(event) => onChange('email', event.target.value)}
                placeholder="Email"
                type="email"
                value={form.email}
              />
            </label>
            <label className="driver-modal-field">
              <span className="field-label">Phone Number <span className="field-label-muted">Optional</span></span>
              <input className="text-field" onChange={(event) => onChange('phone', event.target.value)} placeholder="Phone Number" value={form.phone} />
            </label>
          </section>

          <section className="driver-modal-section">
            <div>
              <div className="driver-modal-section-title">{isEdit ? 'PIN reset' : 'App access'}</div>
              <div className="driver-meta">
                {isEdit
                  ? 'Leave PIN fields blank to keep the current PIN. Enter a new 4-digit PIN only when you want to reset it.'
                  : 'Leave the PIN fields blank to use the default 1234 driver PIN.'}
              </div>
            </div>
          {!isEdit ? (
            <>
              <input
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('pin', event.target.value)}
                placeholder="4-digit PIN (optional)"
                type="password"
                value={form.pin}
              />
              <input
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('confirmPin', event.target.value)}
                placeholder="Confirm PIN"
                type="password"
                value={form.confirmPin}
              />
            </>
          ) : (
            <>
              <input
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('pin', event.target.value)}
                placeholder="New 4-digit PIN (optional)"
                type="password"
                value={form.pin}
              />
              <input
                className="text-field"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => onChange('confirmPin', event.target.value)}
                placeholder="Confirm new PIN"
                type="password"
                value={form.confirmPin}
              />
            </>
          )}
          </section>

          {isEdit ? (
            <section className="driver-modal-section">
              <div>
                <div className="driver-modal-section-title">Driver status</div>
                <div className="driver-modal-status-row">
                  <div>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    <div className="driver-meta">
                      {form.is_active
                        ? 'Deactivate this driver if they should no longer be able to sign in.'
                        : 'Reactivate this driver when they should have app access again.'}
                    </div>
                  </div>
                  <button
                    className="secondary-inline-button"
                    disabled={isStatusSubmitting}
                    onClick={onStatusToggle}
                    type="button"
                  >
                    {isStatusSubmitting ? 'Updating...' : form.is_active ? 'Deactivate Driver' : 'Activate Driver'}
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Driver'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ManagerModal({
  form,
  managerUsers,
  errorMessage,
  result,
  isSubmitting,
  isRefreshingInvite,
  isSendingPasswordReset,
  onChange,
  onClose,
  onSubmit,
  onRefreshInvite,
  onSendPasswordReset
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card manager-modal-card">
        <div className="modal-header">
          <div className="card-title">Add Manager</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <input
            className="text-field"
            onChange={(event) => onChange('full_name', event.target.value)}
            placeholder="Manager name"
            value={form.full_name}
          />
          <input
            className="text-field"
            onChange={(event) => onChange('email', event.target.value)}
            placeholder="Manager email"
            type="email"
            value={form.email}
          />

          {result?.message ? <div className="info-banner">{result.message}</div> : null}
          {result?.invite_url ? (
            <div className="driver-meta">
              Email delivery is not configured yet, so share the invite link manually below.
            </div>
          ) : null}
          {result?.invite_url ? <textarea className="text-field" readOnly rows={4} value={result.invite_url} /> : null}
          {result?.reset_url ? (
            <div className="driver-meta">
              Email delivery is not configured yet, so share the reset link manually below.
            </div>
          ) : null}
          {result?.reset_url ? <textarea className="text-field" readOnly rows={4} value={result.reset_url} /> : null}
          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Sending invite...' : 'Send invite'}
            </button>
          </div>
        </form>

        <div className="manager-modal-list">
          <div className="card-title">Current Managers</div>
          <div className="manager-access-list">
            {(managerUsers || []).map((managerUser) => (
              <div className="manager-access-row" key={managerUser.id || managerUser.email}>
                <div>
                  <strong>{managerUser.full_name || managerUser.email}</strong>
                  <div className="driver-meta">{managerUser.email}</div>
                </div>
                <div className="manager-access-status-group">
                  <span className={`pin-workflow-chip ${managerUser.status === 'active' ? 'pin-workflow-chip-good' : 'pin-workflow-chip-warning'}`}>
                    {managerUser.status === 'active' ? (managerUser.is_primary ? 'Primary manager' : 'Active') : 'Invite pending'}
                  </span>
                  {managerUser.status === 'pending_invite' && managerUser.id ? (
                    <button
                      className="secondary-inline-button"
                      disabled={isRefreshingInvite}
                      onClick={() => onRefreshInvite(managerUser.id)}
                      type="button"
                    >
                      {isRefreshingInvite ? 'Refreshing...' : 'Resend invite'}
                    </button>
                  ) : null}
                  {managerUser.status === 'active' && managerUser.id ? (
                    <button
                      className="secondary-inline-button"
                      disabled={isSendingPasswordReset}
                      onClick={() => onSendPasswordReset(managerUser.id)}
                      type="button"
                    >
                      {isSendingPasswordReset ? 'Sending...' : 'Send reset'}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LaborAdjustmentModal({
  form,
  errorMessage,
  isSubmitting,
  onChange,
  onClose,
  onSubmit
}) {
  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="card-title">Edit Labor</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <div className="driver-meta">
            Adjust labor for <strong>{form.driver_name || 'Driver'}</strong> on {form.date || 'the selected date'}.
          </div>
          <label className="field-group">
            <span className="field-label">Clock In</span>
            <input
              className="text-field"
              onChange={(event) => onChange('clock_in', event.target.value)}
              type="datetime-local"
              value={form.clock_in}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Clock Out</span>
            <input
              className="text-field"
              onChange={(event) => onChange('clock_out', event.target.value)}
              type="datetime-local"
              value={form.clock_out}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Break Minutes</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('break_minutes', event.target.value)}
              step="1"
              type="number"
              value={form.break_minutes}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Lunch Minutes</span>
            <input
              className="text-field"
              min="0"
              onChange={(event) => onChange('lunch_minutes', event.target.value)}
              step="1"
              type="number"
              value={form.lunch_minutes}
            />
          </label>
          <label className="field-group">
            <span className="field-label">Reason</span>
            <textarea
              className="text-field"
              onChange={(event) => onChange('adjustment_reason', event.target.value)}
              placeholder="Why are you correcting this labor record?"
              rows={4}
              value={form.adjustment_reason}
            />
          </label>

          <div className="driver-meta">
            ReadyRoute will save these as the manager-corrected labor totals for that day and refresh the daily labor summary if the day is already closed out.
          </div>

          {errorMessage ? <div className="error-banner">{errorMessage}</div> : null}

          <div className="modal-actions">
            <button className="secondary-inline-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-inline-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? 'Saving...' : 'Save Labor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatHours(value) {
  return `${Number(value || 0).toFixed(2)} hrs`;
}

function formatMinutes(value) {
  return `${Number(value || 0)} min`;
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function formatShiftWindow(clockIn, clockOut) {
  if (!clockIn) {
    return '—';
  }

  const start = formatDateTime(clockIn);
  const end = clockOut ? formatDateTime(clockOut) : 'Still clocked in';
  return `${start} → ${end}`;
}

function formatShortTime(value) {
  if (!value) {
    return '—';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getLiveStatusClass(code) {
  switch (code) {
    case 'working':
      return 'live-status-chip-working';
    case 'on_lunch':
      return 'live-status-chip-lunch';
    case 'on_break':
      return 'live-status-chip-break';
    case 'clocked_out':
      return 'live-status-chip-off';
    case 'not_clocked_in':
    default:
      return 'live-status-chip-idle';
  }
}

function getMinutesUntil(value) {
  if (!value) {
    return null;
  }

  const targetMs = new Date(value).getTime();
  if (!Number.isFinite(targetMs)) {
    return null;
  }

  return Math.max(0, Math.ceil((targetMs - Date.now()) / (1000 * 60)));
}

function formatDateTimeLocalInput(value, fallbackDate) {
  if (!value) {
    return fallbackDate ? `${fallbackDate}T08:00` : '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fallbackDate ? `${fallbackDate}T08:00` : '';
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function localInputToIso(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function formatPhoneDisplay(phone) {
  const digits = String(phone || '').replace(/\D/g, '');

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return phone || 'Not recorded';
}

function getFedexDriverId(driver) {
  return String(driver?.fedex_driver_id || '').trim();
}

function formatFedexDriverId(driver) {
  return getFedexDriverId(driver) || 'Not recorded';
}

function getDriverInitials(name) {
  return String(name || 'Driver')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1).toUpperCase())
    .join('');
}

function getDriverStatus(driver) {
  if (!driver.is_active) {
    return { label: 'Inactive', tone: 'neutral' };
  }

  return { label: 'Active', tone: 'active' };
}

export default function DriversPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const todayString = getTodayString();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [form, setForm] = useState(emptyForm);
  const [errorMessage, setErrorMessage] = useState('');
  const [laborForm, setLaborForm] = useState(emptyLaborForm);
  const [laborErrorMessage, setLaborErrorMessage] = useState('');
  const [expandedLiveLaborDriverId, setExpandedLiveLaborDriverId] = useState(null);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [managerInviteForm, setManagerInviteForm] = useState(emptyManagerInviteForm);
  const [managerInviteError, setManagerInviteError] = useState('');
  const [managerInviteResult, setManagerInviteResult] = useState(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [driverImportMessage, setDriverImportMessage] = useState('');
  const driverImportInputRef = useRef(null);
  const { selectedCsaId } = useSelectedCsa();

  const driversQuery = useQuery({
    queryKey: ['manager-drivers', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/drivers');
      return response.data?.drivers || [];
    }
  });

  const liveLaborQuery = useQuery({
    queryKey: ['manager-live-labor', selectedCsaId, todayString],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/timecards/live', {
        params: {
          date: todayString
        }
      });
      return response.data || null;
    },
    refetchInterval: 30000
  });

  const managerUsersQuery = useQuery({
    queryKey: ['manager-users', selectedCsaId],
    enabled: Boolean(selectedCsaId),
    queryFn: async () => {
      const response = await api.get('/manager/manager-users');
      return response.data?.manager_users || [];
    }
  });

  const createDriver = useMutation({
    mutationFn: async () => {
      await api.post('/manager/drivers', {
        name: form.name.trim(),
        email: form.email.trim(),
        fedex_driver_id: form.fedex_driver_id.trim(),
        phone: form.phone.trim(),
        pin: form.pin
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['manager-drivers', selectedCsaId] });
    },
    onError: (error) => {
      setErrorMessage(error.response?.data?.error || 'Unable to create driver.');
    }
  });

  const importDrivers = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post('/manager/drivers/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      return response.data;
    },
    onSuccess: async (result) => {
      setDriverImportMessage(
        `Driver import complete: ${result.created || 0} created, ${result.skipped || 0} skipped, ${(result.errors || []).length} errors.`
      );
      await queryClient.invalidateQueries({ queryKey: ['manager-drivers', selectedCsaId] });
    },
    onError: (error) => {
      setDriverImportMessage(error.response?.data?.error || 'Unable to import drivers.');
    }
  });

  const updateDriver = useMutation({
    mutationFn: async () => {
      await api.put(`/manager/drivers/${form.id}`, {
        name: form.name.trim(),
        fedex_driver_id: form.fedex_driver_id.trim(),
        phone: form.phone.trim(),
        pin: form.pin || undefined
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['manager-drivers', selectedCsaId] });
    },
    onError: (error) => {
      setErrorMessage(error.response?.data?.error || 'Unable to update driver.');
    }
  });

  const deactivateDriver = useMutation({
    mutationFn: async ({ driverId, isActive }) => {
      await api.patch(`/manager/drivers/${driverId}/status`, {
        is_active: isActive
      });
    },
    onSuccess: (_data, variables) => {
      setForm((current) => (
        current.id === variables.driverId
          ? { ...current, is_active: variables.isActive }
          : current
      ));
      queryClient.invalidateQueries({ queryKey: ['manager-drivers', selectedCsaId] });
    }
  });

  const updateLabor = useMutation({
    mutationFn: async () => {
      const response = await api.put('/manager/timecards/live', {
        date: laborForm.date,
        driver_id: laborForm.driver_id,
        clock_in: localInputToIso(laborForm.clock_in),
        clock_out: localInputToIso(laborForm.clock_out),
        break_minutes: Number(laborForm.break_minutes || 0),
        lunch_minutes: Number(laborForm.lunch_minutes || 0),
        adjustment_reason: laborForm.adjustment_reason.trim()
      });
      return response.data || null;
    },
    onSuccess: () => {
      setIsLaborModalOpen(false);
      setLaborErrorMessage('');
      setLaborForm(emptyLaborForm);
      queryClient.invalidateQueries({ queryKey: ['manager-live-labor', selectedCsaId, todayString] });
      queryClient.invalidateQueries({ queryKey: ['manager-daily-labor', selectedCsaId, todayString] });
      queryClient.invalidateQueries({ queryKey: ['manager-weekly-timecards', selectedCsaId, todayString] });
    },
    onError: (error) => {
      setLaborErrorMessage(error.response?.data?.error || 'Unable to update labor.');
    }
  });

  const inviteManagerUser = useMutation({
    mutationFn: async () => {
      const response = await api.post('/manager/manager-users/invite', managerInviteForm);
      return response.data;
    },
    onSuccess: (data) => {
      setManagerInviteError('');
      setManagerInviteResult(data);
      setManagerInviteForm(emptyManagerInviteForm);
      queryClient.invalidateQueries({ queryKey: ['manager-users', selectedCsaId] });
    },
    onError: (error) => {
      setManagerInviteError(error.response?.data?.error || 'Unable to prepare manager invite.');
    }
  });

  const refreshManagerInvite = useMutation({
    mutationFn: async (managerUserId) => {
      const response = await api.post(`/manager/manager-users/${managerUserId}/invite`);
      return response.data;
    },
    onSuccess: (data) => {
      setManagerInviteError('');
      setManagerInviteResult(data);
      queryClient.invalidateQueries({ queryKey: ['manager-users', selectedCsaId] });
    },
    onError: (error) => {
      setManagerInviteError(error.response?.data?.error || 'Unable to refresh manager invite.');
    }
  });

  const sendManagerPasswordReset = useMutation({
    mutationFn: async (managerUserId) => {
      const response = await api.post(`/manager/manager-users/${managerUserId}/password-reset`);
      return response.data;
    },
    onSuccess: (data) => {
      setManagerInviteError('');
      setManagerInviteResult(data);
      queryClient.invalidateQueries({ queryKey: ['manager-users', selectedCsaId] });
    },
    onError: (error) => {
      setManagerInviteError(error.response?.data?.error || 'Unable to send manager password reset.');
    }
  });

  const isSubmitting = createDriver.isPending || updateDriver.isPending;
  const drivers = useMemo(() => driversQuery.data || [], [driversQuery.data]);
  const filteredDrivers = useMemo(() => {
    const query = driverSearch.trim().toLowerCase();

    if (!query) {
      return drivers;
    }

    return drivers.filter((driver) => (
      String(driver.name || '').toLowerCase().includes(query) ||
      getFedexDriverId(driver).toLowerCase().includes(query)
    ));
  }, [driverSearch, drivers]);
  const managerUsers = useMemo(() => managerUsersQuery.data || [], [managerUsersQuery.data]);
  const routesByDriverId = useMemo(() => {
    const entries = new Map();
    (liveLaborQuery.data?.drivers || []).forEach((row) => {
      const routeName = row.latest_timecard?.route_name || row.route_name || row.work_area_name || '';
      if (row.driver_id && routeName) {
        entries.set(row.driver_id, routeName);
      }
    });
    return entries;
  }, [liveLaborQuery.data?.drivers]);
  const isSetupFlow = searchParams.get('source') === 'setup';
  const setupFocus = searchParams.get('focus') || '';
  const setupBanner = useMemo(() => {
    if (!isSetupFlow) {
      return null;
    }

    if (setupFocus === 'starter-pin') {
      return {
        tone: 'done',
        title: 'Driver PIN default is ready',
        body: 'New drivers can use the default 1234 PIN unless you set a different PIN for that driver.',
        actionTo: '/vedr?source=setup&focus=vedr',
        actionLabel: 'Continue to VEDR'
      };
    }

    if (setupFocus === 'drivers') {
      if (drivers.length > 0) {
        return {
          tone: 'done',
          title: 'Drivers are loaded',
          body: `${drivers.length} driver${drivers.length === 1 ? '' : 's'} are ready for dispatch and route assignment.`,
          actionTo: '/vehicles?source=setup&focus=vehicles',
          actionLabel: 'Continue to Vehicles'
        };
      }

      return {
        tone: 'active',
        title: 'Add the first drivers for this CSA',
        body: 'Once at least one driver is added here, ReadyRoute can move you straight into vehicle setup.'
      };
    }

    if (setupFocus === 'managers') {
      return {
        tone: 'active',
        title: 'Manager access is in place',
        body: 'You can invite supporting managers here if needed, or jump back into setup and keep moving.',
        actionTo: '/setup',
        actionLabel: 'Back to Setup'
      };
    }

    return null;
  }, [drivers.length, isSetupFlow, setupFocus]);

  function openAddModal() {
    setModalMode('add');
    setForm(emptyForm);
    setErrorMessage('');
    setIsModalOpen(true);
  }

  function openManagerModal() {
    setManagerInviteError('');
    setManagerInviteResult(null);
    setManagerInviteForm(emptyManagerInviteForm);
    setIsManagerModalOpen(true);
  }

  function openLaborModal(row) {
    const latestTimecard = row.latest_timecard || null;
    setLaborErrorMessage('');
    setLaborForm({
      driver_id: row.driver_id,
      driver_name: row.driver_name,
      date: todayString,
      clock_in: formatDateTimeLocalInput(latestTimecard?.clock_in, todayString),
      clock_out: latestTimecard?.clock_out ? formatDateTimeLocalInput(latestTimecard.clock_out, null) : '',
      break_minutes: String(row.break_minutes ?? 0),
      lunch_minutes: String(row.lunch_minutes ?? 0),
      adjustment_reason: ''
    });
    setIsLaborModalOpen(true);
  }

  function openEditModal(driver) {
    setModalMode('edit');
    setForm({
      id: driver.id,
      name: driver.name || '',
      email: driver.email || '',
      fedex_driver_id: getFedexDriverId(driver),
      phone: driver.phone || '',
      is_active: Boolean(driver.is_active),
      pin: '',
      confirmPin: ''
    });
    setErrorMessage('');
    setIsModalOpen(true);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleDriverImportChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setDriverImportMessage('');
    importDrivers.mutate(file);
  }

  function handleModalSubmit(event) {
    event.preventDefault();
    setErrorMessage('');

    if (modalMode === 'add') {
      if (form.pin || form.confirmPin) {
        if (form.pin !== form.confirmPin) {
          setErrorMessage('PINs must match.');
          return;
        }

        if (!/^\d{4}$/.test(String(form.pin))) {
          setErrorMessage('PIN must be a 4-digit code.');
          return;
        }
      }

      createDriver.mutate();
      return;
    }

    if (form.pin || form.confirmPin) {
      if (form.pin !== form.confirmPin) {
        setErrorMessage('PINs must match.');
        return;
      }

      if (!/^\d{4}$/.test(String(form.pin))) {
        setErrorMessage('PIN must be a 4-digit code.');
        return;
      }
    }

    updateDriver.mutate();
  }

  function handleStatusToggle(driver) {
    const nextStatus = !driver.is_active;

    if (!nextStatus) {
      const shouldContinue = window.confirm(
        `Deactivating ${driver.name} will prevent them from logging in. Their history will be preserved. Continue?`
      );

      if (!shouldContinue) {
        return;
      }
    }

    deactivateDriver.mutate({
      driverId: driver.id,
      isActive: nextStatus
    });
  }

  function handleModalStatusToggle() {
    if (!form.id) {
      return;
    }

    handleStatusToggle({
      id: form.id,
      name: form.name,
      is_active: form.is_active
    });
  }

  function toggleLiveLaborDetail(driverId) {
    setExpandedLiveLaborDriverId((current) => (current === driverId ? null : driverId));
  }

  function updateManagerInviteField(field, value) {
    setManagerInviteForm((current) => ({ ...current, [field]: value }));
  }

  function handleManagerInviteSubmit(event) {
    event.preventDefault();
    setManagerInviteError('');

    if (!managerInviteForm.email.trim()) {
      setManagerInviteError('Manager email is required.');
      return;
    }

    inviteManagerUser.mutate();
  }

  function updateLaborField(field, value) {
    setLaborForm((current) => ({ ...current, [field]: value }));
  }

  function handleLaborSubmit(event) {
    event.preventDefault();
    setLaborErrorMessage('');

    if (!laborForm.clock_in) {
      setLaborErrorMessage('Clock in time is required.');
      return;
    }

    if (!laborForm.adjustment_reason.trim()) {
      setLaborErrorMessage('A reason is required for labor edits.');
      return;
    }

    if (laborForm.clock_out) {
      const clockInIso = localInputToIso(laborForm.clock_in);
      const clockOutIso = localInputToIso(laborForm.clock_out);

      if (!clockInIso || !clockOutIso) {
        setLaborErrorMessage('Clock in and clock out must be valid datetimes.');
        return;
      }

      if (new Date(clockOutIso).getTime() <= new Date(clockInIso).getTime()) {
        setLaborErrorMessage('Clock out must be later than clock in.');
        return;
      }
    }

    updateLabor.mutate();
  }

  return (
    <section className="page-section drivers-page">
      <PageHeader
        title="Drivers"
        description={`${drivers.length} driver${drivers.length === 1 ? '' : 's'}`}
        actions={(
          <>
            <button className="secondary-button" onClick={openManagerModal} type="button">
              Add Manager
            </button>
            <button
              className="secondary-button"
              disabled={importDrivers.isPending}
              onClick={() => driverImportInputRef.current?.click()}
              type="button"
            >
              {importDrivers.isPending ? 'Importing...' : 'Import Drivers'}
            </button>
            <button className="primary-cta manifest-button" onClick={openAddModal} type="button">
              Add Driver
            </button>
            <input
              accept=".csv,.xls,.xlsx"
              hidden
              onChange={handleDriverImportChange}
              ref={driverImportInputRef}
              type="file"
            />
          </>
        )}
      />

      {driverImportMessage ? <div className="info-banner">{driverImportMessage}</div> : null}

      {setupBanner ? (
        <div className={`card setup-continue-banner ${setupBanner.tone}`}>
          <div>
            <div className="setup-next-eyebrow">Onboarding</div>
            <h2>{setupBanner.title}</h2>
            <p>{setupBanner.body}</p>
          </div>
          {setupBanner.actionTo ? (
            <Link className="primary-cta setup-next-action" to={setupBanner.actionTo}>
              {setupBanner.actionLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="card drivers-table-card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Driver Directory</div>
            <div className="driver-meta">
              Driver contact details, access status, and route activity for today.
            </div>
          </div>
          <div className="driver-meta">
            {drivers.length} driver{drivers.length === 1 ? '' : 's'}
          </div>
        </div>

        {driversQuery.isLoading ? (
          <div className="driver-meta">Loading drivers...</div>
        ) : driversQuery.isError ? (
          <div className="error-banner">Unable to load drivers.</div>
        ) : drivers.length ? (
          <>
            <div className="drivers-directory-toolbar">
              <input
                className="text-field"
                onChange={(event) => setDriverSearch(event.target.value)}
                placeholder="Search drivers by name or FedEx Driver ID"
                type="search"
                value={driverSearch}
              />
              <span className="driver-meta">
                {filteredDrivers.length} shown
              </span>
            </div>
            <div className="drivers-manager-table">
              <div className="drivers-manager-table-header">
                <span>Driver</span>
                <span>FedEx Driver ID</span>
                <span>Phone</span>
                <span>Status</span>
                <span>Route today</span>
                <span>Actions</span>
              </div>
              {filteredDrivers.map((driver) => {
                const routeToday = routesByDriverId.get(driver.id);
                const status = getDriverStatus(driver);
                const fedexDriverId = formatFedexDriverId(driver);
                const phoneDisplay = formatPhoneDisplay(driver.phone);
                const routeLabel = routeToday ? `Route ${routeToday}` : 'Not assigned';

                return (
                  <div className="drivers-manager-table-row" key={driver.id}>
                    <div className="drivers-manager-driver-cell">
                      <div className="drivers-avatar" aria-hidden="true">{getDriverInitials(driver.name)}</div>
                      <div>
                        <strong title={driver.name}>{driver.name}</strong>
                      </div>
                    </div>
                    <span
                      className={getFedexDriverId(driver) ? 'drivers-table-value' : 'drivers-muted-value'}
                      title={fedexDriverId}
                    >
                      {fedexDriverId}
                    </span>
                    <span className="drivers-table-value" title={phoneDisplay}>{phoneDisplay}</span>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    <div>
                      {routeToday ? (
                        <span className="drivers-route-badge" title={routeLabel}>{routeLabel}</span>
                      ) : (
                        <span className="drivers-muted-value" title={routeLabel}>{routeLabel}</span>
                      )}
                    </div>
                    <div className="drivers-table-actions">
                      <button className="secondary-inline-button" onClick={() => openEditModal(driver)} type="button">
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="driver-directory-list drivers-mobile-list">
              {filteredDrivers.map((driver) => {
                const routeToday = routesByDriverId.get(driver.id);
                const status = getDriverStatus(driver);
                const fedexDriverId = formatFedexDriverId(driver);
                const phoneDisplay = formatPhoneDisplay(driver.phone);
                const routeLabel = routeToday ? `Route ${routeToday}` : 'Not assigned';

                return (
                  <div className="driver-directory-card" key={driver.id}>
                    <div className="driver-directory-row">
                      <div className="drivers-manager-driver-cell">
                        <div className="drivers-avatar" aria-hidden="true">{getDriverInitials(driver.name)}</div>
                        <div>
                          <strong title={driver.name}>{driver.name}</strong>
                        </div>
                      </div>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </div>
                    <div className="driver-directory-meta">
                      <span title={fedexDriverId}>FedEx ID: {fedexDriverId}</span>
                      <span title={phoneDisplay}>{phoneDisplay}</span>
                      <span title={routeLabel}>{routeLabel}</span>
                    </div>
                    <div className="driver-directory-actions">
                      <button className="secondary-inline-button" onClick={() => openEditModal(driver)} type="button">
                        Edit Driver
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {!filteredDrivers.length ? (
              <EmptyState
                title="No matching drivers"
                description="Try searching by driver name or FedEx Driver ID."
              />
            ) : null}
          </>
        ) : (
          <EmptyState
            title="No drivers yet"
            description="Add drivers so routes can be assigned from Morning Setup."
            actions={(
              <button className="primary-cta manifest-button" onClick={openAddModal} type="button">
                Add Driver
              </button>
            )}
          />
        )}
      </div>

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Live Labor</div>
            <div className="driver-meta">
              Today's real-time clock-in, lunch, and break visibility.
            </div>
          </div>
          <div className="driver-meta">
            Auto-refreshing every 30 seconds
          </div>
        </div>

        {liveLaborQuery.isLoading ? (
          <div className="driver-meta">Loading live labor status...</div>
        ) : liveLaborQuery.isError ? (
          <div className="error-banner">Unable to load live labor status.</div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Working</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.working ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">On Lunch</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.on_lunch ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">On Break</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.on_break ?? 0}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Not Clocked In</div>
                <div className="stat-value small">{liveLaborQuery.data?.totals?.not_clocked_in ?? 0}</div>
              </div>
            </div>

            <div className="weekly-timecard-table live-labor-table">
              <div className="weekly-timecard-header">
                <span>Driver</span>
                <span>Status</span>
                <span>Current Shift</span>
                <span>Worked</span>
                <span>Breaks</span>
                <span>Actions</span>
              </div>

              {(liveLaborQuery.data?.drivers || []).map((row) => {
                const driverRecord = drivers.find((driver) => driver.id === row.driver_id) || null;
                const isExpanded = expandedLiveLaborDriverId === row.driver_id;
                const breakEndsIn = getMinutesUntil(row.active_break?.scheduled_end_at);

                return (
                  <div className="weekly-timecard-group" key={`live-${row.driver_id}`}>
                    <div className="weekly-timecard-row">
                      <div className="driver-cell-stack">
                        <strong>{row.driver_name}</strong>
                        <div className="driver-cell-meta">
                          <small>{row.email}</small>
                          <small className="driver-cell-phone">{formatPhoneDisplay(driverRecord?.phone || row.phone)}</small>
                        </div>
                      </div>
                      <div className="live-status-cell">
                        <span className={`live-status-chip ${getLiveStatusClass(row.status?.code)}`}>
                          {row.status?.label || 'Unknown'}
                        </span>
                        {row.active_break?.scheduled_end_at ? (
                          <small>
                            Ends {formatShortTime(row.active_break.scheduled_end_at)}
                            {breakEndsIn !== null ? ` · ${breakEndsIn} min` : ''}
                          </small>
                        ) : null}
                      </div>
                      <span>{row.latest_timecard ? formatShiftWindow(row.latest_timecard.clock_in, row.latest_timecard.clock_out) : '—'}</span>
                      <span>{formatHours(row.worked_hours)}</span>
                      <span>{`${formatMinutes(row.break_minutes)} · ${formatMinutes(row.lunch_minutes)} lunch`}</span>
                      <span>
                        <button className="secondary-inline-button" onClick={() => toggleLiveLaborDetail(row.driver_id)} type="button">
                          {isExpanded ? 'Hide' : 'View'}
                        </button>
                      </span>
                    </div>
                    {isExpanded ? (
                      <div className="labor-detail-panel">
                        <div className="driver-directory-actions">
                          <button className="secondary-inline-button" onClick={() => openLaborModal(row)} type="button">
                            Edit Labor
                          </button>
                        </div>
                        {row.latest_timecard ? (
                          <div className="labor-shift-card">
                            <div className="labor-shift-topline">
                              <strong>{row.latest_timecard.route_name ? `Route ${row.latest_timecard.route_name}` : 'No route linked'}</strong>
                              <span>{formatShiftWindow(row.latest_timecard.clock_in, row.latest_timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(row.worked_hours)} worked so far</span>
                              <span>{formatMinutes(row.break_minutes)} total breaks</span>
                              <span>{formatMinutes(row.lunch_minutes)} lunch</span>
                              {row.latest_timecard.manager_adjusted ? <span>Manager adjusted</span> : null}
                            </div>
                            {row.latest_timecard.compliance_flags?.length ? (
                              <div className="labor-flag-list">
                                {row.latest_timecard.compliance_flags.map((flag) => (
                                  <span className="labor-flag-chip" key={`${row.driver_id}-${flag}`}>{flag}</span>
                                ))}
                              </div>
                            ) : null}
                            {row.adjustments?.length ? (
                              <div className="labor-audit-list">
                                {row.adjustments.map((adjustment) => (
                                  <div className="labor-audit-card" key={adjustment.id}>
                                    <strong>{formatDateTime(adjustment.created_at)}</strong>
                                    <span>{adjustment.adjustment_reason}</span>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            {(row.timecards || []).length ? (
                              <div className="labor-break-list">
                                {row.timecards.flatMap((timecard) => timecard.breaks || []).map((breakRow) => (
                                  <span className="labor-break-chip" key={breakRow.id}>
                                    {`${String(breakRow.break_type || 'break').toUpperCase()} · ${formatShortTime(breakRow.started_at)}${
                                      breakRow.ended_at ? ` → ${formatShortTime(breakRow.ended_at)}` : ' · Active'
                                    }`}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="labor-empty-state">No labor activity recorded for this driver today.</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {isModalOpen ? (
        <DriverModal
          errorMessage={errorMessage}
          form={form}
          isSubmitting={isSubmitting}
          isStatusSubmitting={deactivateDriver.isPending}
          mode={modalMode}
          onChange={updateField}
          onClose={() => setIsModalOpen(false)}
          onStatusToggle={handleModalStatusToggle}
          onSubmit={handleModalSubmit}
        />
      ) : null}

      {isManagerModalOpen ? (
        <ManagerModal
          errorMessage={managerInviteError}
          form={managerInviteForm}
          isRefreshingInvite={refreshManagerInvite.isPending}
          isSendingPasswordReset={sendManagerPasswordReset.isPending}
          isSubmitting={inviteManagerUser.isPending}
          managerUsers={managerUsers}
          onChange={updateManagerInviteField}
          onClose={() => setIsManagerModalOpen(false)}
          onRefreshInvite={(managerUserId) => refreshManagerInvite.mutate(managerUserId)}
          onSendPasswordReset={(managerUserId) => sendManagerPasswordReset.mutate(managerUserId)}
          onSubmit={handleManagerInviteSubmit}
          result={managerInviteResult}
        />
      ) : null}

      {isLaborModalOpen ? (
        <LaborAdjustmentModal
          errorMessage={laborErrorMessage}
          form={laborForm}
          isSubmitting={updateLabor.isPending}
          onChange={updateLaborField}
          onClose={() => setIsLaborModalOpen(false)}
          onSubmit={handleLaborSubmit}
        />
      ) : null}
    </section>
  );
}
