import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';

import api from '../services/api';
import { getTodayString, loadStoredOperationsDate, saveStoredOperationsDate } from '../utils/operationsDate';

const CODE_CATEGORY_GROUPS = [
  {
    key: '1',
    title: 'Delivery Not Attempted',
    codes: ['011', '012', '015', '016', '017', '027', '079', '081', '082', '083', '095', '100']
  },
  {
    key: '2',
    title: 'Delivery Attempted, Not Completed',
    codes: ['001', '002', '003', '004', '006', '007', '010', '030', '034', '250']
  },
  {
    key: '3',
    title: 'Delivery Completed',
    codes: ['009', '013', '014', '018', '019', '021', '025', '026', '028', '029']
  },
  {
    key: '4',
    title: 'Pickup Codes',
    codes: ['P01', 'P14', 'P16', 'P17', 'P24', 'P25', 'P10', 'P11', 'P15', 'P21', 'P26']
  }
];

const CODE_LABELS = {
  '001': 'Customer Security Delay',
  '002': 'Incorrect Recipient Address',
  '003': 'Unable to Locate',
  '004': 'Recipient Not In',
  '006': 'Refused',
  '007': 'Unable to Indirect/Release',
  '009': 'Delivery to Business',
  '010': 'Inspection Required',
  '011': 'Closed on Saturday',
  '012': 'Sorted to Wrong Route',
  '013': 'Residential Signature',
  '014': 'Residence Driver Release',
  '015': 'Holding Package',
  '016': 'Not on Van',
  '017': 'Misdelivered Pickup',
  '018': 'Delivered to Correct Recipient',
  '019': 'Indirect Delivery',
  '021': 'Business Driver Release',
  '025': 'Tendered to USPS',
  '026': 'Delivered to Shipper',
  '027': 'No Attempt',
  '028': 'Connecting Carrier',
  '029': 'Call Tag Pickup',
  '030': 'Retail Refusal',
  '034': 'Future Delivery',
  '079': 'Package Transfer',
  '081': 'Contractor Refused',
  '082': 'Weather Delay',
  '083': 'Holiday',
  '095': 'Intra-FedEx Transfer',
  '100': 'Customer Request',
  '250': 'Unable to Hold',
  P01: 'Missed Pickup',
  P10: 'Pickup Not Ready',
  P11: 'Closed, No Packages',
  P14: 'Weather',
  P15: 'Residential Not Home',
  P16: 'Holiday/Contingency',
  P17: 'Hazmat',
  P21: 'Express Pickup Cancel',
  P24: 'Pickup Cancelled',
  P25: 'Wrong Address',
  P26: 'Pickup Not Scanned'
};

const emptyForm = {
  name: '',
  email: '',
  phone: '',
  hourly_rate: '',
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

function DriverModal({ form, mode, errorMessage, isSubmitting, onChange, onClose, onSubmit }) {
  const isEdit = mode === 'edit';

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <div className="card-title">{isEdit ? 'Edit Driver' : 'Add Driver'}</div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>

        <form className="form-card modal-form" onSubmit={onSubmit}>
          <input className="text-field" onChange={(event) => onChange('name', event.target.value)} placeholder="Full Name" value={form.name} />
          <input
            className="text-field"
            disabled={isEdit}
            onChange={(event) => onChange('email', event.target.value)}
            placeholder="Email"
            type="email"
            value={form.email}
          />
          <input className="text-field" onChange={(event) => onChange('phone', event.target.value)} placeholder="Phone" value={form.phone} />
          <label className="money-field">
            <span>$</span>
            <input
              className="text-field money-input"
              min="0"
              onChange={(event) => onChange('hourly_rate', event.target.value)}
              placeholder="Hourly Rate"
              step="0.01"
              type="number"
              value={form.hourly_rate}
            />
          </label>

          {!isEdit ? (
            <>
              <div className="driver-meta">
                Leave the PIN fields blank to use this CSA&apos;s starter driver PIN.
              </div>
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
              <div className="driver-meta">
                Leave the PIN fields blank to keep the current driver PIN. Add a new 4-digit PIN only when you want to reset it.
              </div>
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
  onChange,
  onClose,
  onSubmit,
  onRefreshInvite
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

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(Number(value || 0));
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

  return phone || 'No phone on file';
}

function groupExceptionBreakdown(breakdown) {
  return CODE_CATEGORY_GROUPS.map((group) => ({
    ...group,
    items: group.codes
      .filter((code) => breakdown?.[code])
      .map((code) => ({
        code,
        count: breakdown[code],
        label: CODE_LABELS[code] || 'FedEx code'
      }))
  })).filter((group) => group.items.length > 0);
}

export default function DriversPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedWeekDate, setSelectedWeekDate] = useState(loadStoredOperationsDate() || getTodayString());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLaborModalOpen, setIsLaborModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('add');
  const [form, setForm] = useState(emptyForm);
  const [errorMessage, setErrorMessage] = useState('');
  const [laborForm, setLaborForm] = useState(emptyLaborForm);
  const [laborErrorMessage, setLaborErrorMessage] = useState('');
  const [expandedLiveLaborDriverId, setExpandedLiveLaborDriverId] = useState(null);
  const [expandedWeeklyLaborDriverId, setExpandedWeeklyLaborDriverId] = useState(null);
  const [expandedDailyLaborDriverId, setExpandedDailyLaborDriverId] = useState(null);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [managerInviteForm, setManagerInviteForm] = useState(emptyManagerInviteForm);
  const [managerInviteError, setManagerInviteError] = useState('');
  const [managerInviteResult, setManagerInviteResult] = useState(null);
  const [starterPin, setStarterPin] = useState('');
  const [starterPinError, setStarterPinError] = useState('');

  const driversQuery = useQuery({
    queryKey: ['manager-drivers'],
    queryFn: async () => {
      const response = await api.get('/manager/drivers');
      return response.data?.drivers || [];
    }
  });

  const activeDriverStatsId = expandedDailyLaborDriverId || expandedWeeklyLaborDriverId || null;

  const driverStatsQuery = useQuery({
    queryKey: ['manager-driver-stats', activeDriverStatsId],
    queryFn: async () => {
      const response = await api.get(`/manager/drivers/${activeDriverStatsId}/stats`);
      return response.data?.stats || null;
    },
    enabled: Boolean(activeDriverStatsId)
  });

  const weeklyTimecardsQuery = useQuery({
    queryKey: ['manager-weekly-timecards', selectedWeekDate],
    queryFn: async () => {
      const response = await api.get('/manager/timecards/weekly', {
        params: {
          date: selectedWeekDate
        }
      });
      return response.data || null;
    }
  });

  const dailyLaborQuery = useQuery({
    queryKey: ['manager-daily-labor', selectedWeekDate],
    queryFn: async () => {
      const response = await api.get('/manager/timecards/daily', {
        params: {
          date: selectedWeekDate
        }
      });
      return response.data || null;
    }
  });

  const liveLaborQuery = useQuery({
    queryKey: ['manager-live-labor', selectedWeekDate],
    queryFn: async () => {
      const response = await api.get('/manager/timecards/live', {
        params: {
          date: selectedWeekDate
        }
      });
      return response.data || null;
    },
    refetchInterval: selectedWeekDate === getTodayString() ? 30000 : false
  });

  const managerUsersQuery = useQuery({
    queryKey: ['manager-users'],
    queryFn: async () => {
      const response = await api.get('/manager/manager-users');
      return response.data?.manager_users || [];
    }
  });

  const driverAccessQuery = useQuery({
    queryKey: ['manager-driver-access'],
    queryFn: async () => {
      const response = await api.get('/manager/driver-access');
      return response.data || { starter_pin: null };
    }
  });

  const createDriver = useMutation({
    mutationFn: async () => {
      await api.post('/manager/drivers', {
        name: form.name,
        email: form.email,
        phone: form.phone,
        hourly_rate: Number(form.hourly_rate),
        pin: form.pin
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
    },
    onError: (error) => {
      setErrorMessage(error.response?.data?.error || 'Unable to create driver.');
    }
  });

  const updateDriver = useMutation({
    mutationFn: async () => {
      await api.put(`/manager/drivers/${form.id}`, {
        name: form.name,
        phone: form.phone,
        hourly_rate: Number(form.hourly_rate),
        pin: form.pin || undefined
      });
    },
    onSuccess: () => {
      setIsModalOpen(false);
      setForm(emptyForm);
      setErrorMessage('');
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manager-drivers'] });
    }
  });

  const updateDriverAccess = useMutation({
    mutationFn: async () => {
      const response = await api.patch('/manager/driver-access', {
        starter_pin: starterPin
      });
      return response.data || null;
    },
    onSuccess: (data) => {
      setStarterPinError('');
      setStarterPin(data?.starter_pin || '');
      queryClient.invalidateQueries({ queryKey: ['manager-driver-access'] });
    },
    onError: (error) => {
      setStarterPinError(error.response?.data?.error || 'Unable to update starter PIN.');
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
      queryClient.invalidateQueries({ queryKey: ['manager-live-labor', selectedWeekDate] });
      queryClient.invalidateQueries({ queryKey: ['manager-daily-labor', selectedWeekDate] });
      queryClient.invalidateQueries({ queryKey: ['manager-weekly-timecards', selectedWeekDate] });
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
      queryClient.invalidateQueries({ queryKey: ['manager-users'] });
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
      queryClient.invalidateQueries({ queryKey: ['manager-users'] });
    },
    onError: (error) => {
      setManagerInviteError(error.response?.data?.error || 'Unable to refresh manager invite.');
    }
  });

  const isSubmitting = createDriver.isPending || updateDriver.isPending;
  const drivers = useMemo(() => driversQuery.data || [], [driversQuery.data]);
  const managerUsers = useMemo(() => managerUsersQuery.data || [], [managerUsersQuery.data]);
  const isSetupFlow = searchParams.get('source') === 'setup';
  const setupFocus = searchParams.get('focus') || '';
  const setupBanner = useMemo(() => {
    if (!isSetupFlow) {
      return null;
    }

    const starterPinSet = Boolean(driverAccessQuery.data?.starter_pin);

    if (setupFocus === 'starter-pin') {
      if (starterPinSet) {
        return {
          tone: 'done',
          title: 'Starter PIN is ready',
          body: 'New drivers can now use the shared CSA PIN during initial login.',
          actionTo: '/vedr?source=setup&focus=vedr',
          actionLabel: 'Continue to VEDR'
        };
      }

      return {
        tone: 'active',
        title: 'Set the shared driver PIN first',
        body: 'Save one 4-digit CSA PIN here, then ReadyRoute can create driver accounts without requiring a unique PIN for each driver up front.'
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

      if (!starterPinSet) {
        return {
          tone: 'blocked',
          title: 'Drivers are blocked until the starter PIN is saved',
          body: 'Set the CSA starter PIN in the Driver Access card below, then come back to create your first drivers.'
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
  }, [driverAccessQuery.data?.starter_pin, drivers.length, isSetupFlow, setupFocus]);

  useEffect(() => {
    setStarterPin(driverAccessQuery.data?.starter_pin || '');
  }, [driverAccessQuery.data?.starter_pin]);

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
      date: selectedWeekDate,
      clock_in: formatDateTimeLocalInput(latestTimecard?.clock_in, selectedWeekDate),
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
      phone: driver.phone || '',
      hourly_rate: String(driver.hourly_rate ?? ''),
      pin: '',
      confirmPin: ''
    });
    setErrorMessage('');
    setIsModalOpen(true);
  }

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
      } else if (!driverAccessQuery.data?.starter_pin) {
        setErrorMessage('Set a CSA starter PIN first, or enter a PIN for this driver.');
        return;
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

  function toggleWeeklyLaborDetail(driverId) {
    setExpandedWeeklyLaborDriverId((current) => (current === driverId ? null : driverId));
    setExpandedDailyLaborDriverId(null);
    setExpandedLiveLaborDriverId(null);
  }

  function toggleDailyLaborDetail(driverId) {
    setExpandedDailyLaborDriverId((current) => (current === driverId ? null : driverId));
    setExpandedWeeklyLaborDriverId(null);
    setExpandedLiveLaborDriverId(null);
  }

  function toggleLiveLaborDetail(driverId) {
    setExpandedLiveLaborDriverId((current) => (current === driverId ? null : driverId));
    setExpandedWeeklyLaborDriverId(null);
    setExpandedDailyLaborDriverId(null);
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

  function handleStarterPinSubmit(event) {
    event.preventDefault();
    setStarterPinError('');

    if (!/^\d{4}$/.test(String(starterPin))) {
      setStarterPinError('Starter PIN must be a 4-digit code.');
      return;
    }

    updateDriverAccess.mutate();
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
    <section className="page-section">
      <div className="page-header">
        <div>
          <h1>Drivers</h1>
          <p>Manage access, pay rates, and performance for your active fleet.</p>
        </div>
        <div className="page-header-actions">
          <button className="primary-cta manifest-button" onClick={openManagerModal} type="button">
            Add Manager
          </button>
          <button className="primary-cta manifest-button" onClick={openAddModal} type="button">
            Add Driver
          </button>
        </div>
      </div>

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

      <div className="card driver-access-card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Driver Access</div>
            <div className="driver-meta">
              New drivers can start with one shared CSA PIN, then get a personal reset later if needed.
            </div>
          </div>
        </div>
        <form className="driver-access-inline-form" onSubmit={handleStarterPinSubmit}>
          <label className="field-group">
            <span className="field-label">Starter Driver PIN</span>
            <input
              className="text-field"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setStarterPin(event.target.value)}
              placeholder="4-digit PIN"
              type="password"
              value={starterPin}
            />
          </label>
          <button className="primary-inline-button" disabled={updateDriverAccess.isPending} type="submit">
            {updateDriverAccess.isPending ? 'Saving...' : 'Save Starter PIN'}
          </button>
        </form>
        {starterPinError ? <div className="error-banner">{starterPinError}</div> : null}
        {driverAccessQuery.isLoading ? <div className="driver-meta">Loading current starter PIN...</div> : null}
      </div>

      <div className="info-banner">
        Drivers do not need to self-register. Use each driver&apos;s email as the login, assign a simple 4-digit PIN from this page, and the app will keep them signed in until you deactivate them or reset their access.
      </div>

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Driver Directory</div>
            <div className="driver-meta">
              Every driver added to this CSA appears here, even before they have any labor activity.
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
          <div className="driver-directory-list">
            {drivers.map((driver) => (
              <div className="driver-directory-card" key={driver.id}>
                <div className="driver-directory-row">
                  <div className="driver-directory-identity">
                    <strong>{driver.name}</strong>
                    <span>{driver.email}</span>
                  </div>
                  <div className="driver-directory-meta">
                    <span>{formatPhoneDisplay(driver.phone)}</span>
                    <span>{driver.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <div className="driver-directory-rate">
                    {formatCurrency(driver.hourly_rate || 0)}/hr
                  </div>
                </div>
                <div className="driver-directory-actions">
                  <button className="secondary-inline-button" onClick={() => openEditModal(driver)} type="button">
                    Edit Driver
                  </button>
                  <button className="secondary-inline-button" onClick={() => handleStatusToggle(driver)} type="button">
                    {driver.is_active ? 'Deactivate Driver' : 'Activate Driver'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="labor-empty-state">No drivers have been added to this CSA yet.</div>
        )}
      </div>

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Live Labor</div>
            <div className="driver-meta">
              Real-time clock-in, lunch, and break visibility for {selectedWeekDate}.
            </div>
          </div>
          <div className="driver-meta">
            {selectedWeekDate === getTodayString() ? 'Auto-refreshing every 30 seconds' : 'Historical date selected'}
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
                          <div className="labor-empty-state">No labor activity recorded for this driver on {selectedWeekDate}.</div>
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

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Finalized Day</div>
            <div className="driver-meta">
              {dailyLaborQuery.data?.snapshot
                ? `Finalized at ${new Date(dailyLaborQuery.data.snapshot.finalized_at).toLocaleString()}`
                : 'This day will finalize automatically when the last driver clocks out.'}
            </div>
          </div>
        </div>

        {dailyLaborQuery.isLoading ? (
          <div className="driver-meta">Loading finalized labor snapshot...</div>
        ) : dailyLaborQuery.isError ? (
          <div className="error-banner">Unable to load finalized day snapshot.</div>
        ) : dailyLaborQuery.data?.snapshot ? (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Worked Hours</div>
                <div className="stat-value small">{formatHours(dailyLaborQuery.data.snapshot.total_worked_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Payable Hours</div>
                <div className="stat-value small">{formatHours(dailyLaborQuery.data.snapshot.total_payable_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Drivers Finalized</div>
                <div className="stat-value small">{dailyLaborQuery.data.snapshot.driver_count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Estimated Payroll</div>
                <div className="stat-value small">{formatCurrency(dailyLaborQuery.data.snapshot.estimated_payroll)}</div>
              </div>
            </div>

            <div className="weekly-timecard-table">
              <div className="weekly-timecard-header">
                <span>Driver</span>
                <span>Shifts</span>
                <span>Worked</span>
                <span>Breaks</span>
                <span>Lunch</span>
                <span>Actions</span>
              </div>

              {(dailyLaborQuery.data.drivers || []).map((row) => {
                const driverRecord = drivers.find((driver) => driver.id === row.driver_id) || null;
                const isExpanded = expandedDailyLaborDriverId === row.driver_id;
                const stats = isExpanded ? driverStatsQuery.data : null;
                const groupedExceptions = groupExceptionBreakdown(stats?.exception_code_breakdown || {});

                return (
                <div className="weekly-timecard-group" key={row.driver_id}>
                  <div className="weekly-timecard-row">
                    <div className="driver-cell-stack">
                      <strong>{row.driver_name}</strong>
                      <div className="driver-cell-meta">
                        <small>{row.email}</small>
                        <small className="driver-cell-phone">{formatPhoneDisplay(driverRecord?.phone)}</small>
                      </div>
                    </div>
                    <span>{row.shift_count}</span>
                    <span>{formatHours(row.worked_hours)}</span>
                    <span>{formatMinutes(row.break_minutes)}</span>
                    <span>{formatMinutes(row.lunch_minutes)}</span>
                    <span>
                      <button className="secondary-inline-button" onClick={() => toggleDailyLaborDetail(row.driver_id)} type="button">
                        {isExpanded ? 'Hide' : 'View'}
                      </button>
                    </span>
                  </div>
                  {isExpanded ? (
                    <div className="labor-detail-panel">
                      <div className="driver-directory-actions">
                        {driverRecord ? (
                          <>
                            <button className="secondary-inline-button" onClick={() => openEditModal(driverRecord)} type="button">
                              Edit Driver
                            </button>
                            <button className="secondary-inline-button" onClick={() => handleStatusToggle(driverRecord)} type="button">
                              {driverRecord.is_active ? 'Deactivate Driver' : 'Activate Driver'}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {row.compliance_flags?.length ? (
                        <div className="labor-flag-list">
                          {row.compliance_flags.map((flag) => (
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
                      <div className="stats-grid compact">
                        <div className="stat-card">
                          <div className="stat-label">Last 7 Days Avg Stops/Hr</div>
                          <div className="stat-value small">{stats?.last_7_days_stops_per_hour ?? '--'}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">Deliveries This Month</div>
                          <div className="stat-value small">{stats?.total_deliveries_this_month ?? 0}</div>
                        </div>
                        <div className="stat-card expansion-card">
                          <div className="stat-label">Exception Code Breakdown</div>
                          <div className="exception-list">
                            {groupedExceptions.length ? (
                              groupedExceptions.map((group) => (
                                <div className="exception-group" key={group.key}>
                                  <div className="exception-group-title">{group.title}</div>
                                  <div className="exception-chip-list">
                                    {group.items.map((item) => (
                                      <div className="exception-chip" key={item.code}>
                                        {item.code} — {item.label}: {item.count}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="driver-meta">No exceptions recorded</div>
                            )}
                          </div>
                        </div>
                      </div>
                      {(row.timecards || []).length ? (
                        (row.timecards || []).map((timecard) => (
                          <div className="labor-shift-card" key={timecard.id}>
                            <div className="labor-shift-topline">
                              <strong>{timecard.route_name ? `Route ${timecard.route_name}` : 'Unlabeled route'}</strong>
                              <span>{formatShiftWindow(timecard.clock_in, timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(timecard.worked_hours)} worked</span>
                              <span>{formatMinutes(timecard.break_minutes)} breaks</span>
                              <span>{formatMinutes(timecard.lunch_minutes)} lunch</span>
                            </div>
                            {(timecard.breaks || []).length ? (
                              <div className="labor-break-list">
                                {timecard.breaks.map((breakRow) => (
                                  <span className="labor-break-chip" key={breakRow.id}>
                                    {`${String(breakRow.break_type || 'break').toUpperCase()} · ${formatMinutes(breakRow.minutes)}`}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="labor-empty-state">No shift detail recorded for this finalized day.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              )})}
            </div>
          </>
        ) : (
          <div className="info-banner">
            Live labor data is still in progress for this day. Once the last driver clocks out, ReadyRoute will finalize the day automatically here.
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title-row">
          <div>
            <div className="card-title">Weekly Labor Summary</div>
            <div className="driver-meta">
              {weeklyTimecardsQuery.data
                ? `${weeklyTimecardsQuery.data.week_start} to ${weeklyTimecardsQuery.data.week_end}`
                : 'Current week'}
            </div>
          </div>
          <label className="weekly-date-picker">
            <span className="field-label">Week Of</span>
            <input
              className="date-field"
              onChange={(event) => {
                setSelectedWeekDate(event.target.value);
                saveStoredOperationsDate(event.target.value);
              }}
              type="date"
              value={selectedWeekDate}
            />
          </label>
        </div>

        {weeklyTimecardsQuery.isLoading ? (
          <div className="stats-grid">
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
            <div className="stat-card skeleton-card"><div className="skeleton-line" style={{ height: 18, width: '55%' }} /><div className="skeleton-line" style={{ height: 32, width: '80%' }} /></div>
          </div>
        ) : weeklyTimecardsQuery.isError ? (
          <div className="error-banner">Unable to load weekly labor data.</div>
        ) : (
          <>
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-label">Worked Hours</div>
                <div className="stat-value small">{formatHours(weeklyTimecardsQuery.data?.totals?.worked_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Payable Hours</div>
                <div className="stat-value small">{formatHours(weeklyTimecardsQuery.data?.totals?.payable_hours)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Break Minutes</div>
                <div className="stat-value small">{formatMinutes(weeklyTimecardsQuery.data?.totals?.break_minutes)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Lunch Minutes</div>
                <div className="stat-value small">{formatMinutes(weeklyTimecardsQuery.data?.totals?.lunch_minutes)}</div>
              </div>
            </div>

            <div className="weekly-timecard-table">
              <div className="weekly-timecard-header">
                <span>Driver</span>
                <span>Shifts</span>
                <span>Worked</span>
                <span>Breaks</span>
                <span>Lunch</span>
                <span>Actions</span>
              </div>

              {(weeklyTimecardsQuery.data?.drivers || []).map((row) => {
                const driverRecord = drivers.find((driver) => driver.id === row.driver_id) || null;
                const isExpanded = expandedWeeklyLaborDriverId === row.driver_id;
                const stats = isExpanded ? driverStatsQuery.data : null;
                const groupedExceptions = groupExceptionBreakdown(stats?.exception_code_breakdown || {});

                return (
                <div className="weekly-timecard-group" key={row.driver_id}>
                  <div className="weekly-timecard-row">
                    <div className="driver-cell-stack">
                      <strong>{row.driver_name}</strong>
                      <div className="driver-cell-meta">
                        <small>{row.email}</small>
                        <small className="driver-cell-phone">{formatPhoneDisplay(driverRecord?.phone)}</small>
                      </div>
                    </div>
                    <span>{row.shift_count}</span>
                    <span>{formatHours(row.worked_hours)}</span>
                    <span>{formatMinutes(row.break_minutes)}</span>
                    <span>{formatMinutes(row.lunch_minutes)}</span>
                    <span>
                      <button className="secondary-inline-button" onClick={() => toggleWeeklyLaborDetail(row.driver_id)} type="button">
                        {isExpanded ? 'Hide' : 'View'}
                      </button>
                    </span>
                  </div>
                  {isExpanded ? (
                    <div className="labor-detail-panel">
                      <div className="driver-directory-actions">
                        {driverRecord ? (
                          <>
                            <button className="secondary-inline-button" onClick={() => openEditModal(driverRecord)} type="button">
                              Edit Driver
                            </button>
                            <button className="secondary-inline-button" onClick={() => handleStatusToggle(driverRecord)} type="button">
                              {driverRecord.is_active ? 'Deactivate Driver' : 'Activate Driver'}
                            </button>
                          </>
                        ) : null}
                      </div>
                      {row.compliance_flags?.length ? (
                        <div className="labor-flag-list">
                          {row.compliance_flags.map((flag) => (
                            <span className="labor-flag-chip" key={`${row.driver_id}-${flag}`}>{flag}</span>
                          ))}
                        </div>
                      ) : null}
                      <div className="stats-grid compact">
                        <div className="stat-card">
                          <div className="stat-label">Last 7 Days Avg Stops/Hr</div>
                          <div className="stat-value small">{stats?.last_7_days_stops_per_hour ?? '--'}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">Deliveries This Month</div>
                          <div className="stat-value small">{stats?.total_deliveries_this_month ?? 0}</div>
                        </div>
                        <div className="stat-card expansion-card">
                          <div className="stat-label">Exception Code Breakdown</div>
                          <div className="exception-list">
                            {groupedExceptions.length ? (
                              groupedExceptions.map((group) => (
                                <div className="exception-group" key={group.key}>
                                  <div className="exception-group-title">{group.title}</div>
                                  <div className="exception-chip-list">
                                    {group.items.map((item) => (
                                      <div className="exception-chip" key={item.code}>
                                        {item.code} — {item.label}: {item.count}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="driver-meta">No exceptions recorded</div>
                            )}
                          </div>
                        </div>
                      </div>
                      {(row.timecards || []).length ? (
                        (row.timecards || []).map((timecard) => (
                          <div className="labor-shift-card" key={timecard.id}>
                            <div className="labor-shift-topline">
                              <strong>{timecard.route_name ? `Route ${timecard.route_name}` : 'Unlabeled route'}</strong>
                              <span>{formatShiftWindow(timecard.clock_in, timecard.clock_out)}</span>
                            </div>
                            <div className="labor-shift-metrics">
                              <span>{formatHours(timecard.worked_hours)} worked</span>
                              <span>{formatMinutes(timecard.break_minutes)} breaks</span>
                              <span>{formatMinutes(timecard.lunch_minutes)} lunch</span>
                            </div>
                            {(timecard.breaks || []).length ? (
                              <div className="labor-break-list">
                                {timecard.breaks.map((breakRow) => (
                                  <span className="labor-break-chip" key={breakRow.id}>
                                    {`${String(breakRow.break_type || 'break').toUpperCase()} · ${formatMinutes(breakRow.minutes)}`}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="labor-empty-state">No shift detail recorded for this week yet.</div>
                      )}
                    </div>
                  ) : null}
                </div>
              )})}
            </div>
          </>
        )}
      </div>

      {isModalOpen ? (
        <DriverModal
          errorMessage={errorMessage}
          form={form}
          isSubmitting={isSubmitting}
          mode={modalMode}
          onChange={updateField}
          onClose={() => setIsModalOpen(false)}
          onSubmit={handleModalSubmit}
        />
      ) : null}

      {isManagerModalOpen ? (
        <ManagerModal
          errorMessage={managerInviteError}
          form={managerInviteForm}
          isRefreshingInvite={refreshManagerInvite.isPending}
          isSubmitting={inviteManagerUser.isPending}
          managerUsers={managerUsers}
          onChange={updateManagerInviteField}
          onClose={() => setIsManagerModalOpen(false)}
          onRefreshInvite={(managerUserId) => refreshManagerInvite.mutate(managerUserId)}
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
